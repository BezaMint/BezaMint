//! Resource and fee measurements for the Factory's entry points.
//!
//! These live inside the Factory crate rather than in `contracts/benchmarks`
//! because this crate is a `cdylib` and nothing else can link against it.
//! Building an `rlib` alongside the `cdylib` would make the measurements
//! importable -- and would also grow the deployed Wasm blob from 16,085 to
//! 27,752 bytes, which is not a trade a size-budgeted contract should make to
//! save a test module. See `bezamint-benchmarks`'s crate docs.
//!
//! The harness itself is shared: `bezamint-benchmarks` is a dev-dependency, so
//! `measure`, `within` and the registration helper are the same code here as
//! there, and the two output streams feed one table in `docs/resource-costs.md`.
//!
//! Factory paths are the ones a user actually pays for, and they are the sum of
//! a tree of cross-contract calls -- which is the point of measuring them rather
//! than adding up the entries by hand.

// The contract crate is `no_std`; the measurements run on the host, where the
// `RESOURCE ` lines they print are the point of the exercise.
extern crate std;

use bezamint_benchmarks::{measure, within, Harness};
use soroban_sdk::testutils::Address as _;

use crate::{BezaMintFactory, BezaMintFactoryClient};

const COLLECTION_ID: u64 = 1;

/// Budgets for the Factory paths, as measured with the host native.
mod factory_budget {
    pub const MINT_INSTRUCTIONS: i64 = 640_000;
    pub const MINT_WRITES: u32 = 13;
    pub const BATCH_1_INSTRUCTIONS: i64 = 680_000;
    pub const BATCH_1_WRITES: u32 = 13;
    pub const BATCH_25_INSTRUCTIONS: i64 = 29_000_000;
    pub const BATCH_25_WRITES: u32 = 160;
    pub const BURN_INSTRUCTIONS: i64 = 1_100_000;
    pub const BURN_WRITES: u32 = 14;
    pub const COLLECTION_INSTRUCTIONS: i64 = 420_000;
    pub const COLLECTION_WRITES: u32 = 8;
    pub const SET_CONTRACTS_INSTRUCTIONS: i64 = 180_000;
    pub const SET_CONTRACTS_WRITES: u32 = 4;
}

/// The shared harness plus a Factory wired to it, the way `scripts/deploy.sh`
/// leaves the deployed set.
struct Wired {
    h: Harness,
    factory_id: soroban_sdk::Address,
}

impl Wired {
    fn new() -> Self {
        let h = Harness::new();
        let factory_id = h.env.register(BezaMintFactory, (h.admin.clone(),));
        BezaMintFactoryClient::new(&h.env, &factory_id).set_contracts(
            &h.nft_id,
            &h.collection_id,
            &h.royalty_id,
            &h.creator_id,
        );
        Self { h, factory_id }
    }

    fn factory(&self) -> BezaMintFactoryClient<'_> {
        BezaMintFactoryClient::new(&self.h.env, &self.factory_id)
    }
}

#[test]
fn factory_entry_points() {
    let w = Wired::new();
    let h = &w.h;
    h.seed_collection();

    let (create, id) = measure(&h.env, "factory.create_collection_for_creator", || {
        w.factory().create_collection_for_creator(&h.user, &h.uri())
    });
    assert_eq!(id, 2);
    within(
        "factory.create_collection_for_creator",
        create,
        factory_budget::COLLECTION_INSTRUCTIONS,
        factory_budget::COLLECTION_WRITES,
    );

    let (mint, token_id) = measure(&h.env, "factory.mint_with_royalty", || {
        w.factory()
            .mint_with_royalty(&h.user, &h.user, &COLLECTION_ID, &h.uri(), &500)
    });
    assert!(token_id >= 1);
    within(
        "factory.mint_with_royalty",
        mint,
        factory_budget::MINT_INSTRUCTIONS,
        factory_budget::MINT_WRITES,
    );

    // The batch path exists to replace N transactions with one, so what matters
    // is the marginal cost per token, not just the total.
    //
    // Both ends of the batch are measured on the *same* state, because the
    // number of tokens already owned by an address changes what a mint costs:
    // the NFT contract keeps each owner's token ids in one vector and rewrites
    // it on every mint. A batch of 25 therefore pays the growth, and comparing
    // it to a mint measured on a smaller state would flatter it.
    let (batch_one, ids) = measure(&h.env, "factory.mint_batch_with_royalty (1)", || {
        w.factory()
            .mint_batch_with_royalty(&h.user, &h.user, &COLLECTION_ID, &h.batch(1), &500)
    });
    assert_eq!(ids.len(), 1);
    within(
        "factory.mint_batch_with_royalty (1)",
        batch_one,
        factory_budget::BATCH_1_INSTRUCTIONS,
        factory_budget::BATCH_1_WRITES,
    );

    let (batch_max, ids) = measure(&h.env, "factory.mint_batch_with_royalty (25)", || {
        w.factory()
            .mint_batch_with_royalty(&h.user, &h.user, &COLLECTION_ID, &h.batch(25), &500)
    });
    assert_eq!(ids.len(), 25);
    within(
        "factory.mint_batch_with_royalty (25)",
        batch_max,
        factory_budget::BATCH_25_INSTRUCTIONS,
        factory_budget::BATCH_25_WRITES,
    );

    // The marginal cost of the 24 extra tokens in the batch, against the cost of
    // minting one. Reported rather than asserted because it is the number the
    // optimization work is judged by, and it is expected to change.
    let marginal = (batch_max.instructions - batch_one.instructions) / 24;
    std::println!(
        "BATCH_PER_TOKEN mint={} batch_marginal={} batch_total={}",
        mint.instructions,
        marginal,
        batch_max.instructions
    );

    let (burn, ()) = measure(&h.env, "factory.burn_nft", || {
        w.factory().burn_nft(&h.user, &COLLECTION_ID, &token_id)
    });
    let _ = burn;
    within(
        "factory.burn_nft",
        burn,
        factory_budget::BURN_INSTRUCTIONS,
        factory_budget::BURN_WRITES,
    );
}

/// `set_contracts` is the one-time admin wiring call, measured because it also
/// performs the Royalty admin hand-off and is therefore a cross-contract call,
/// not a plain write.
///
/// It is measured on a fresh environment rather than on a wired harness. The
/// hand-off can only happen once: afterwards the Royalty admin *is* the Factory
/// contract, and a second hand-off needs that contract's authorization rather
/// than the deployer's. That is the deployed topology working as intended, so
/// the benchmark reproduces the single call `scripts/deploy.sh` actually makes.
#[test]
fn factory_set_contracts() {
    use bezamint_collection::BezaMintCollection;
    use bezamint_creator::BezaMintCreator;
    use bezamint_nft::BezaMintNft;
    use bezamint_royalty::BezaMintRoyalty;
    use soroban_sdk::{testutils::EnvTestConfig, Env};

    let env = Env::new_with_config(EnvTestConfig {
        capture_snapshot_at_drop: false,
    });
    env.mock_all_auths();
    let admin = soroban_sdk::Address::generate(&env);

    let nft_id = env.register(BezaMintNft, (admin.clone(),));
    let collection_id = env.register(BezaMintCollection, (admin.clone(),));
    let royalty_id = env.register(BezaMintRoyalty, (admin.clone(),));
    let creator_id = env.register(BezaMintCreator, (admin.clone(),));
    let factory_id = env.register(BezaMintFactory, (admin.clone(),));
    let client = BezaMintFactoryClient::new(&env, &factory_id);

    let (wiring, ()) = measure(&env, "factory.set_contracts", || {
        client.set_contracts(&nft_id, &collection_id, &royalty_id, &creator_id)
    });
    let _ = wiring;
    within(
        "factory.set_contracts",
        wiring,
        factory_budget::SET_CONTRACTS_INSTRUCTIONS,
        factory_budget::SET_CONTRACTS_WRITES,
    );
}
