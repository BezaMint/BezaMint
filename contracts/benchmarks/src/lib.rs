#![cfg(not(target_family = "wasm"))]

//! Resource and fee measurement harness for the BezaMint contracts.
//!
//! This crate contains no deployable code. It exists so that the cost of every
//! entry point is a measured number rather than an impression: Soroban charges
//! by resource (CPU instructions, memory, ledger entries read and written, and
//! rent on the entries a call leaves behind), not by gas, so a change that makes
//! a mint "simpler" can still make it more expensive.
//!
//! The measurements live in `tests/resources.rs`, and the Factory's -- which
//! cannot be reached from here, see below -- in `factory/src/bench.rs`.
//! `scripts/bench-contract-resources.py` runs them and turns the output into the
//! tables in `docs/resource-costs.md`.
//!
//! ## Why the Factory is measured from inside the Factory
//!
//! `bezamint-factory` builds a `cdylib` and nothing else, so no other crate can
//! link against it. Giving it an `rlib` as well is not a neutral change: with
//! both crate types the exported Wasm blob grows from 16,085 to 27,752 bytes,
//! a 72% increase on a contract that pays for it in the size budget and in
//! every deployment. The Factory's measurements therefore live in its own crate
//! as a unit test, where `crate::BezaMintFactory` is available without a second
//! crate type, and they reuse the harness below through a dev-dependency.
//!
//! ## Why the crate is empty on wasm32
//!
//! The harness needs the host test environment, which does not exist as a wasm
//! target: `soroban-sdk/testutils` does not compile for wasm32 at all. Scoping
//! the dependencies to non-wasm targets and gating the crate body the same way
//! keeps this crate in the workspace -- so `cargo test -p bezamint-benchmarks`
//! and a single shared lockfile keep working -- while
//! `cargo build --workspace --target wasm32-unknown-unknown` compiles it to an
//! empty rlib instead of failing the entire build.

use bezamint_collection::{BezaMintCollection, BezaMintCollectionClient};
use bezamint_creator::{BezaMintCreator, BezaMintCreatorClient};
use bezamint_nft::{BezaMintNft, BezaMintNftClient};
use bezamint_royalty::{BezaMintRoyalty, BezaMintRoyaltyClient};
use soroban_sdk::{
    testutils::{Address as _, EnvTestConfig, Ledger as _},
    Address, Env, Map, String, Vec,
};

// ── Measurement ────────────────────────────────────────────────

/// One measured invocation.
///
/// The fee is broken down by the term that produced it, because that is what
/// tells you where a call's cost lives. A mint whose fee is mostly
/// `write_entries` is priced by the number of ledger entries it touches; one
/// whose fee is mostly `instructions` is priced by the code it runs. The two
/// call for completely different optimizations.
#[derive(Clone, Copy)]
pub struct Reading {
    pub name: &'static str,
    pub instructions: i64,
    pub mem_bytes: i64,
    pub read_entries: u32,
    pub write_entries: u32,
    pub read_bytes: u32,
    pub write_bytes: u32,
    pub event_bytes: u32,
    pub fee: i64,
    pub fee_instructions: i64,
    pub fee_read_entries: i64,
    pub fee_write_entries: i64,
    pub fee_read_bytes: i64,
    pub fee_write_bytes: i64,
    pub fee_events: i64,
    pub rent: i64,
}

/// Run `f` and report what the host metered for it.
///
/// The invocation result is returned so a measurement can assert the call did
/// what it claims — a benchmark of a call that reverted measures the revert.
pub fn measure<R>(env: &Env, name: &'static str, f: impl FnOnce() -> R) -> (Reading, R) {
    let result = f();
    let resources = env.cost_estimate().resources();
    let fee = env.cost_estimate().fee();
    let reading = Reading {
        name,
        instructions: resources.instructions,
        mem_bytes: resources.mem_bytes,
        read_entries: resources.read_entries,
        write_entries: resources.write_entries,
        read_bytes: resources.read_bytes,
        write_bytes: resources.write_bytes,
        event_bytes: resources.contract_events_size_bytes,
        fee: fee.total,
        fee_instructions: fee.instructions,
        fee_read_entries: fee.read_entries,
        fee_write_entries: fee.write_entries,
        fee_read_bytes: fee.read_bytes,
        fee_write_bytes: fee.write_bytes,
        fee_events: fee.contract_events,
        rent: fee.persistent_entry_rent + fee.temporary_entry_rent,
    };
    report(reading);
    (reading, result)
}

fn report(reading: Reading) {
    println!(
        "RESOURCE {} instructions={} mem_bytes={} read_entries={} write_entries={} \
         read_bytes={} write_bytes={} event_bytes={} fee_stroops={} fee_instructions={} \
         fee_read_entries={} fee_write_entries={} fee_read_bytes={} fee_write_bytes={} \
         fee_events={} rent_stroops={}",
        reading.name,
        reading.instructions,
        reading.mem_bytes,
        reading.read_entries,
        reading.write_entries,
        reading.read_bytes,
        reading.write_bytes,
        reading.event_bytes,
        reading.fee,
        reading.fee_instructions,
        reading.fee_read_entries,
        reading.fee_write_entries,
        reading.fee_read_bytes,
        reading.fee_write_bytes,
        reading.fee_events,
        reading.rent,
    );
}

/// Fail when a measurement exceeds its budget.
///
/// Budgets are the measured value plus roughly a quarter, which is enough to
/// absorb host-version noise and small refactors but not enough to hide a
/// change that adds a storage entry or a cross-contract call to a hot path.
pub fn within(name: &str, reading: Reading, max_instructions: i64, max_write_entries: u32) {
    assert!(
        reading.instructions <= max_instructions,
        "{name}: {} instructions exceeds the {max_instructions} budget",
        reading.instructions
    );
    assert!(
        reading.write_entries <= max_write_entries,
        "{name}: {} written ledger entries exceeds the {max_write_entries} budget",
        reading.write_entries
    );
}

// ── Harness ────────────────────────────────────────────────────

/// The four contracts every measured path builds on, registered the way
/// `scripts/deploy.sh` registers them.
///
/// The Factory is deliberately absent: it cannot be linked from here, so the
/// tests that need it (`factory/src/bench.rs`) register it themselves and wire
/// it to these contracts. Everything else is ready to call.
pub struct Harness {
    pub env: Env,
    /// The deployer: admin of every contract, and the royalty admin until a
    /// Factory hand-off moves it.
    pub admin: Address,
    /// Owns the seeded collection and is the caller for the user-facing paths.
    pub user: Address,
    /// A second account, for transfers and operator approvals.
    pub other: Address,
    pub nft_id: Address,
    pub collection_id: Address,
    pub royalty_id: Address,
    pub creator_id: Address,
}

impl Default for Harness {
    fn default() -> Self {
        Self::new()
    }
}

impl Harness {
    pub fn new() -> Self {
        let env = Env::new_with_config(EnvTestConfig {
            // Measurements do not want a snapshot JSON written on every drop.
            capture_snapshot_at_drop: false,
        });
        env.mock_all_auths();
        env.ledger().set_timestamp(1_700_000_000);

        let admin = Address::generate(&env);
        let user = Address::generate(&env);
        let other = Address::generate(&env);

        let nft_id = env.register(BezaMintNft, (admin.clone(),));
        let collection_id = env.register(BezaMintCollection, (admin.clone(),));
        let royalty_id = env.register(BezaMintRoyalty, (admin.clone(),));
        let creator_id = env.register(BezaMintCreator, (admin.clone(),));

        Self {
            env,
            admin,
            user,
            other,
            nft_id,
            collection_id,
            royalty_id,
            creator_id,
        }
    }

    pub fn nft(&self) -> BezaMintNftClient<'_> {
        BezaMintNftClient::new(&self.env, &self.nft_id)
    }

    pub fn collection(&self) -> BezaMintCollectionClient<'_> {
        BezaMintCollectionClient::new(&self.env, &self.collection_id)
    }

    pub fn royalty(&self) -> BezaMintRoyaltyClient<'_> {
        BezaMintRoyaltyClient::new(&self.env, &self.royalty_id)
    }

    pub fn creator(&self) -> BezaMintCreatorClient<'_> {
        BezaMintCreatorClient::new(&self.env, &self.creator_id)
    }

    pub fn uri(&self) -> String {
        String::from_str(&self.env, "ipfs://bench/metadata.json")
    }

    /// Mint a token straight on the NFT contract, outside any measurement.
    pub fn seed_mint(&self, collection: u64) -> u64 {
        self.nft()
            .mint(&self.user, &self.user, &collection, &self.uri())
    }

    /// Create collection 1 for `user`, outside any measurement.
    pub fn seed_collection(&self) -> u64 {
        self.collection().create_collection(&self.user, &self.uri())
    }

    /// Attach tokens `from..=to` to a collection, outside any measurement.
    ///
    /// `add_nft` does not require the token to actually exist, so this is the
    /// cheapest way to reach a collection of a given size. It does refuse a
    /// token that is already a member, so the caller must not overlap the range
    /// with tokens it has already added.
    pub fn seed_members(&self, collection: u64, from: u64, to: u64) {
        let client = self.collection();
        for token_id in from..=to {
            client.add_nft(&collection, &token_id);
        }
    }

    /// A royalty split of `count` recipients whose shares sum to 100%.
    pub fn recipients(&self, count: u32) -> Map<Address, u32> {
        let mut recipients = Map::new(&self.env);
        let share = 100 / count;
        for index in 0..count {
            let recipient = Address::generate(&self.env);
            // The last recipient absorbs the remainder so the shares sum to 100.
            let amount = if index == count - 1 {
                100 - share * (count - 1)
            } else {
                share
            };
            recipients.set(recipient, amount);
        }
        recipients
    }

    /// A page request of `count` metadata URIs, for the batch mint path.
    pub fn batch(&self, count: u32) -> Vec<String> {
        let mut uris = Vec::new(&self.env);
        for _ in 0..count {
            uris.push_back(self.uri());
        }
        uris
    }
}
