#![no_std]

//! BezaMint Royalty contract.
//!
//! Owns per-target royalty terms: an NFT or a collection maps to a
//! [`RoyaltyConfig`] with a basis-point rate (0-10000) and an optional split
//! of recipients whose shares sum to 100%. In deployment the Factory holds
//! the admin role (transferred by `set_admin` during wiring) and configures
//! terms on behalf of minting users; the recorded `creator` of a config can
//! amend their own terms without the admin.
//!
//! ## Authorization model
//!
//! - `configure_royalty`: admin-only (the Factory in production), exactly
//!   once per target - a live or frozen config can never be silently replaced.
//! - `update_royalty`: the recorded creator or the admin; never when frozen.
//! - `freeze_royalty` / `set_admin`: admin-only. Frozen configs are
//!   irreversible.
//!
//! State expiration is managed explicitly (same policy as the NFT contract).

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short,
    token::TokenClient, Address, BytesN, Env, Map, Vec,
};

/// The Stellar "zero" account (all-zero ed25519 public key). Soroban has no
/// native null address, so this sentinel is used to reject obviously invalid
/// destinations — here, an admin that could never authorize anything — rather
/// than silently accepting them.
const ZERO_ADDRESS: &str = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

// ─────────────────────────── Constants ───────────────────────────

/// Royalty rates are expressed in basis points, where 10,000 bp == 100%.
const MAX_BASIS_POINTS: u32 = 10_000;

/// Recipient shares are expressed as whole percentages that must sum to 100.
const TOTAL_SHARE: u32 = 100;

/// Bound on the number of split recipients, so a config cannot be used to
/// create an unbounded payout fan-out.
const MAX_RECIPIENTS: u32 = 10;

/// Storage schema version written by this build. Bump it whenever the persisted
/// layout changes and add the matching step to [`BezaMintRoyalty::migrate`].
pub const STORAGE_VERSION: u32 = 1;

/// State-expiration (TTL) policy. Soroban entries silently archive once their
/// TTL elapses and then read as missing; a royalty config that archived would
/// make `get_royalty` panic for an NFT that demonstrably still exists. Every
/// write refreshes the touched entries to the network maximum
/// ([`TTL_LEDGERS`] = Stellar's `MAXIMUM_ENTRY_TTL_LEDGERS`, ~1 year at 5s
/// per ledger), and the primary getters bump entries that have fallen below
/// half-life so actively used configs stay alive indefinitely.
const TTL_LEDGERS: u32 = 6_312_000;
const TTL_THRESHOLD: u32 = TTL_LEDGERS / 2;

// ─────────────────────────── Types ───────────────────────────

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct RoyaltyConfig {
    /// Account that owns these terms. Recorded at configure time so the creator
    /// can amend them later without needing the deployer's admin key.
    pub creator: Address,
    pub basis_points: u32,
    pub recipients: Map<Address, u32>,
    pub is_frozen: bool,
    pub set_at: u64,
}

/// One recipient's share of a royalty payment, ready for a marketplace to pay
/// out. `amount` is in the same unit as the sale price used to quote it
/// (stroops, when the sale settles in XLM).
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct RoyaltyPayout {
    pub recipient: Address,
    pub amount: i128,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum RoyaltyKey {
    Admin,
    Version,
    ConfigNft(u64),
    ConfigCollection(u64),
}

// ─────────────────────────── Events ───────────────────────────

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum RoyaltyEvent {
    Configured(u64, u32),
    Updated(u64, u32),
    Frozen(u64),
    Removed(u64),
    AdminChanged(Address),

    /// The stored schema version advanced. A migration changes what stored
    /// values mean, so the one operation that most needs a timestamped on-chain
    /// record is the one that previously left none.
    Migrated(u32, u32),
    /// A sale was settled: `(target_id, asset, payer, total_paid)`. Emitted once
    /// per settlement, after every transfer succeeded, because a partial payout
    /// cannot happen -- a failed transfer rolls the whole invocation back.
    Paid(u64, Address, Address, i128),
}

fn emit(env: &Env, event: RoyaltyEvent) {
    env.events().publish((symbol_short!("royalty"),), event);
}

/// Extend the TTL of a persistent entry to [`TTL_LEDGERS`] when its remaining
/// life is at or below [`TTL_THRESHOLD`]. Cheap no-op otherwise, so it is safe
/// to call on every access path.
fn bump_ttl(env: &Env, key: &RoyaltyKey) {
    env.storage()
        .persistent()
        .extend_ttl(key, TTL_THRESHOLD, TTL_LEDGERS);
}

/// Panic unless the stored schema version matches this build.
///
/// The constructor writes `Version` but nothing used to read it, so an in-place
/// `upgrade` that changed the `RoyaltyConfig` layout would decode old entries
/// into the new struct and pay out garbage rather than failing. Every mutating
/// path consults the version first so the mismatch is loud and immediate.
fn assert_version(env: &Env) {
    let found: u32 = env
        .storage()
        .instance()
        .get(&RoyaltyKey::Version)
        .unwrap_or(0);
    if found != STORAGE_VERSION {
        panic_with_error!(env, RoyaltyError::StorageVersionMismatch);
    }
}

// ─────────────────────────── Errors ───────────────────────────

/// Typed contract errors.
///
/// A numeric code is part of the contract's public interface and the committed
/// ABI snapshot; callers switch on it instead of substring-matching a message.
/// Codes are grouped by subsystem and are never renumbered once shipped: add
/// new variants at the end of their group and leave existing numbers alone.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum RoyaltyError {
    /// The contract has not been constructed.
    NotInitialized = 1,
    /// Stored schema version does not match this build; run `migrate`.
    StorageVersionMismatch = 2,
    /// `migrate` was given a `from_version` that is not what is stored.
    StoredVersionMismatch = 3,
    /// `migrate` called when storage is already at this build's version.
    AlreadyAtCurrentVersion = 4,
    /// No royalty terms exist for the target.
    NoConfig = 5,
    /// Terms already exist; use `update_royalty` instead.
    ConfigAlreadyExists = 6,
    /// Rate exceeds `MAX_BASIS_POINTS`.
    BasisPointsTooHigh = 7,
    /// Caller is neither the recorded creator nor the royalty admin.
    CallerCannotUpdate = 8,
    /// Terms are frozen and cannot be amended or removed.
    ConfigFrozen = 9,
    /// More recipients than `MAX_RECIPIENTS`.
    TooManyRecipients = 10,
    /// A recipient was given a zero share.
    ZeroShare = 11,
    /// Recipient shares do not sum to exactly `TOTAL_SHARE`.
    SharesMustSumToTotal = 12,
    /// `quote_royalty` was given a negative sale price.
    SalePriceNegative = 13,
    /// `sale_price * basis_points` overflowed i128.
    SalePriceTooLarge = 14,
    /// `set_admin` was given the all-zero account.
    AdminZeroAddress = 15,
    /// `pay_royalty` was given a sale price of zero or less.
    ///
    /// Distinct from [`RoyaltyError::SalePriceNegative`], which `quote_royalty`
    /// accepts as long as the price is not negative: quoting a zero sale is a
    /// harmless question, while settling one would spend a transaction to move
    /// nothing.
    SalePriceNotPositive = 16,
    /// `pay_royalty` was given the all-zero account as the settlement asset.
    /// The zero account is not a deployed contract, so the transfer would fail
    /// after the payouts were computed, with nothing to show for the fee.
    AssetZeroAddress = 17,
}

// ─────────────────────────── Contract ───────────────────────────

#[contract]
pub struct BezaMintRoyalty;

#[contractimpl]
impl BezaMintRoyalty {
    /// Constructor: runs atomically as part of contract creation.
    ///
    /// Initialization previously required a second, publicly callable
    /// transaction after deployment. Because deployment and initialization are
    /// separate transactions, any observer could call `initialize` first,
    /// satisfy `require_auth()` with their own signature and become the admin of
    /// a contract the deployer had just paid to create. A constructor executes
    /// inside contract creation, so there is no window to race; it deliberately
    /// performs no `require_auth`, because the only party who can run it is the
    /// deployer, inside the deployment invocation itself.
    pub fn __constructor(env: Env, admin: Address) {
        env.storage().instance().set(&RoyaltyKey::Admin, &admin);
        env.storage().instance().set(&RoyaltyKey::Version, &1u32);
        // Instance data and contract code share one TTL; refresh both up front
        // so a long-dormant contract does not silently lose its admin binding.
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_LEDGERS);
    }

    /// Current admin address. Panics when the contract is not initialized.
    /// Exposed so deployment tooling can verify who actually controls a
    /// deployed contract (for example that the Royalty admin is the Factory).
    pub fn get_admin(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&RoyaltyKey::Admin)
            .unwrap_or_else(|| panic_with_error!(&env, RoyaltyError::NotInitialized))
    }

    /// Returns `true` once `initialize` has succeeded.
    pub fn is_initialized(env: Env) -> bool {
        env.storage().instance().has(&RoyaltyKey::Admin)
    }

    /// Stored schema version (`0` before the constructor runs).
    pub fn version(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&RoyaltyKey::Version)
            .unwrap_or(0)
    }

    /// Advance the stored schema version after an in-place `upgrade`.
    /// Admin-only.
    ///
    /// `from_version` must equal what is actually stored, so a migration cannot
    /// be replayed or run against the wrong starting point. This is deliberately
    /// the only mutating function exempt from `assert_version`: it is the step
    /// that repairs a mismatch.
    pub fn migrate(env: Env, from_version: u32) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&RoyaltyKey::Admin)
            .unwrap_or_else(|| panic_with_error!(&env, RoyaltyError::NotInitialized));
        admin.require_auth();

        let stored: u32 = env
            .storage()
            .instance()
            .get(&RoyaltyKey::Version)
            .unwrap_or(0);
        if stored != from_version {
            panic_with_error!(&env, RoyaltyError::StoredVersionMismatch);
        }
        if from_version == STORAGE_VERSION {
            panic_with_error!(&env, RoyaltyError::AlreadyAtCurrentVersion);
        }

        env.storage()
            .instance()
            .set(&RoyaltyKey::Version, &STORAGE_VERSION);
        emit(&env, RoyaltyEvent::Migrated(from_version, STORAGE_VERSION));
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_LEDGERS);
    }

    /// Replace the contract code with a newly deployed wasm hash. Admin-only.
    /// The canonical Soroban upgrade path: the admin deploys the new wasm,
    /// then calls this with its hash to swap the code in place, preserving all
    /// storage. There is no downgrade protection beyond the admin key itself,
    /// so the admin key must be held by the platform's operational key.
    pub fn upgrade(env: Env, new_wasm_hash: BytesN<32>) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&RoyaltyKey::Admin)
            .unwrap_or_else(|| panic_with_error!(&env, RoyaltyError::NotInitialized));
        admin.require_auth();

        env.deployer().update_current_contract_wasm(new_wasm_hash);
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_LEDGERS);
    }

    /// Transfer the admin role. Only the current admin may call. Deployment
    /// uses this to hand the role to the Factory once contracts are wired: the
    /// Factory's cross-contract `configure_royalty` calls authenticate as the
    /// admin, so without this transfer the flagship mint-with-royalty flow can
    /// only ever be authorized by a human deployer who is never present.
    pub fn set_admin(env: Env, new_admin: Address) {
        assert_version(&env);
        let admin: Address = env
            .storage()
            .instance()
            .get(&RoyaltyKey::Admin)
            .unwrap_or_else(|| panic_with_error!(&env, RoyaltyError::NotInitialized));
        admin.require_auth();

        // `set_contracts` on the Factory rejects the zero account before calling
        // this, but the Royalty admin can also call `set_admin` directly, so the
        // check cannot live only in the caller: a zero admin here would make the
        // contract permanently un-upgradable with no recovery path.
        if new_admin == Address::from_str(&env, ZERO_ADDRESS) {
            panic_with_error!(&env, RoyaltyError::AdminZeroAddress);
        }

        env.storage().instance().set(&RoyaltyKey::Admin, &new_admin);
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_LEDGERS);

        emit(&env, RoyaltyEvent::AdminChanged(new_admin));
    }

    /// Create the royalty terms for a target. Callable only by the royalty
    /// admin (in deployment that is the Factory), exactly once per target.
    ///
    /// `creator` is the account the terms belong to. It is recorded, not
    /// authenticated: the Factory configures royalties on behalf of the account
    /// that authorized the mint, and the admin is trusted to name it accurately.
    pub fn configure_royalty(
        env: Env,
        creator: Address,
        target_id: u64,
        basis_points: u32,
        recipients: Map<Address, u32>,
        is_collection: bool,
    ) {
        assert_version(&env);
        let admin: Address = env
            .storage()
            .instance()
            .get(&RoyaltyKey::Admin)
            .unwrap_or_else(|| panic_with_error!(&env, RoyaltyError::NotInitialized));
        admin.require_auth();

        if !Self::validate_basis_points(basis_points) {
            panic_with_error!(&env, RoyaltyError::BasisPointsTooHigh);
        }
        Self::validate_recipients(&env, &recipients);

        let key = if is_collection {
            RoyaltyKey::ConfigCollection(target_id)
        } else {
            RoyaltyKey::ConfigNft(target_id)
        };

        // `configure_royalty` creates terms; it must never silently overwrite
        // them. Before this guard a frozen config could be replaced outright,
        // which made `freeze_royalty` advisory rather than binding, and a live
        // config could be swapped without any `Updated` event being emitted.
        if env.storage().persistent().has(&key) {
            panic_with_error!(&env, RoyaltyError::ConfigAlreadyExists);
        }

        let config = RoyaltyConfig {
            creator,
            basis_points,
            recipients,
            is_frozen: false,
            set_at: env.ledger().timestamp(),
        };

        env.storage().persistent().set(&key, &config);
        bump_ttl(&env, &key);
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_LEDGERS);

        emit(&env, RoyaltyEvent::Configured(target_id, basis_points));
    }

    /// Amend existing terms.
    ///
    /// Authorization: the recorded creator of the terms may update them (which
    /// is the whole point of storing `creator`), as may the royalty admin for
    /// operational recovery. Freezing remains admin-only. Before this only the
    /// deployer could ever change a creator's royalty, which is exactly the
    /// centralization a creator-first platform must avoid.
    pub fn update_royalty(
        env: Env,
        caller: Address,
        target_id: u64,
        basis_points: u32,
        recipients: Map<Address, u32>,
        is_collection: bool,
    ) {
        assert_version(&env);
        caller.require_auth();

        let admin: Address = env
            .storage()
            .instance()
            .get(&RoyaltyKey::Admin)
            .unwrap_or_else(|| panic_with_error!(&env, RoyaltyError::NotInitialized));

        let key = if is_collection {
            RoyaltyKey::ConfigCollection(target_id)
        } else {
            RoyaltyKey::ConfigNft(target_id)
        };

        let mut config: RoyaltyConfig = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, RoyaltyError::NoConfig));

        if caller != admin && caller != config.creator {
            panic_with_error!(&env, RoyaltyError::CallerCannotUpdate);
        }
        if config.is_frozen {
            panic_with_error!(&env, RoyaltyError::ConfigFrozen);
        }
        if !Self::validate_basis_points(basis_points) {
            panic_with_error!(&env, RoyaltyError::BasisPointsTooHigh);
        }
        Self::validate_recipients(&env, &recipients);

        config.basis_points = basis_points;
        config.recipients = recipients;
        config.set_at = env.ledger().timestamp();

        env.storage().persistent().set(&key, &config);
        bump_ttl(&env, &key);

        emit(&env, RoyaltyEvent::Updated(target_id, basis_points));
    }

    /// Delete a target's royalty terms. Admin-only. Used to clean up terms
    /// that can no longer matter (a burned NFT, an abandoned collection).
    ///
    /// Refused while the config is frozen: freezing is the creator's guarantee
    /// that their terms cannot change, and deletion would be the ultimate
    /// change, so a frozen config is permanent by construction.
    pub fn remove_royalty(env: Env, target_id: u64, is_collection: bool) {
        assert_version(&env);
        let admin: Address = env
            .storage()
            .instance()
            .get(&RoyaltyKey::Admin)
            .unwrap_or_else(|| panic_with_error!(&env, RoyaltyError::NotInitialized));
        admin.require_auth();

        let key = if is_collection {
            RoyaltyKey::ConfigCollection(target_id)
        } else {
            RoyaltyKey::ConfigNft(target_id)
        };

        let config: RoyaltyConfig = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, RoyaltyError::NoConfig));
        if config.is_frozen {
            panic_with_error!(&env, RoyaltyError::ConfigFrozen);
        }

        env.storage().persistent().remove(&key);
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_LEDGERS);

        emit(&env, RoyaltyEvent::Removed(target_id));
    }

    /// Permanently lock the terms for a target. Admin-only, and irreversible:
    /// once frozen, neither the creator nor the admin can amend them.
    pub fn freeze_royalty(env: Env, target_id: u64, is_collection: bool) {
        assert_version(&env);
        let admin: Address = env
            .storage()
            .instance()
            .get(&RoyaltyKey::Admin)
            .unwrap_or_else(|| panic_with_error!(&env, RoyaltyError::NotInitialized));
        admin.require_auth();

        let key = if is_collection {
            RoyaltyKey::ConfigCollection(target_id)
        } else {
            RoyaltyKey::ConfigNft(target_id)
        };

        let mut config: RoyaltyConfig = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, RoyaltyError::NoConfig));

        config.is_frozen = true;
        env.storage().persistent().set(&key, &config);
        bump_ttl(&env, &key);

        emit(&env, RoyaltyEvent::Frozen(target_id));
    }

    // ── Queries ─────────────────────────────────────────────

    pub fn validate_basis_points(basis_points: u32) -> bool {
        basis_points <= MAX_BASIS_POINTS
    }

    /// Compute who is owed what when a token sells for `sale_price`.
    ///
    /// This is the piece a marketplace needs and the piece that was missing: a
    /// [`RoyaltyConfig`] records the *rate* and the split, but nothing turned
    /// that into concrete amounts, so "royalties" was a claim the platform could
    /// not actually settle. A bare NFT `transfer` carries no payment, so there is
    /// nothing for the contracts to hook; settlement therefore stays a
    /// marketplace responsibility, and this makes the obligation unambiguous,
    /// deterministic and testable instead of something each integrator guesses
    /// at.
    ///
    /// Returns an empty vector when nothing is owed: a zero rate, a zero sale
    /// price, or a rate so small relative to the price that it rounds to zero.
    /// An empty recipient map means the documented default of 100% to the
    /// config's creator.
    ///
    /// Rounding is exact: every recipient except the last receives the floor of
    /// its share of the royalty total, and the last recipient absorbs the
    /// remainder, so the returned amounts always sum to that total and no stroop
    /// is created or lost.
    pub fn quote_royalty(
        env: Env,
        target_id: u64,
        is_collection: bool,
        sale_price: i128,
    ) -> Vec<RoyaltyPayout> {
        if sale_price < 0 {
            panic_with_error!(&env, RoyaltyError::SalePriceNegative);
        }

        let config = Self::get_royalty(env.clone(), target_id, is_collection);
        let total = sale_price
            .checked_mul(config.basis_points as i128)
            .unwrap_or_else(|| panic_with_error!(&env, RoyaltyError::SalePriceTooLarge))
            / (MAX_BASIS_POINTS as i128);

        let mut payouts = Vec::new(&env);
        if total <= 0 {
            return payouts;
        }

        if config.recipients.is_empty() {
            payouts.push_back(RoyaltyPayout {
                recipient: config.creator,
                amount: total,
            });
            return payouts;
        }

        // `validate_recipients` guarantees the shares sum to TOTAL_SHARE, so the
        // floor shares cannot exceed `total`; only the rounding remainder is left
        // over, and the last recipient takes it.
        let count = config.recipients.len();
        let mut index = 0;
        let mut distributed: i128 = 0;
        for (recipient, share) in config.recipients.iter() {
            index += 1;
            let amount = if index == count {
                total - distributed
            } else {
                total * (share as i128) / (TOTAL_SHARE as i128)
            };
            distributed += amount;
            payouts.push_back(RoyaltyPayout { recipient, amount });
        }
        payouts
    }

    /// Settle a sale in a Stellar asset, paying each recipient its configured
    /// share.
    ///
    /// `asset` is the Stellar Asset Contract address of the settlement
    /// currency: the native XLM SAC (`env.register_stellar_asset_contract_v2`
    /// on the network gives its address), or an issued asset's SAC -- USDC, for
    /// instance -- because a token address is a token address. `payer`
    /// authorizes the whole invocation, which is what lets the asset contract's
    /// own `transfer` check succeed for each leg.
    ///
    /// This is the entry point the contract was missing. [`Self::quote_royalty`]
    /// computed exact per-recipient amounts and then handed the obligation to a
    /// marketplace that did not exist, which left the platform's promise to
    /// creators enforced by nothing.
    ///
    /// Ordering and failure: every transfer is made inside the one invocation,
    /// so a failure in any leg rolls all of them back. There is no partial
    /// payout to reconcile and no escrow to hold -- the only state this function
    /// writes is the event.
    ///
    /// Reentrancy: `asset` is supplied by the caller, so a hostile asset
    /// contract could call back into this one. The royalty config is read once,
    /// before any transfer, and the payouts that decision produced are the ones
    /// paid, so a reentrant call cannot change what is owed or cause a second
    /// payout of the same sale. Callers who care should pass the SAC they
    /// expect, and can verify it from the emitted event.
    pub fn pay_royalty(
        env: Env,
        target_id: u64,
        is_collection: bool,
        asset: Address,
        payer: Address,
        sale_price: i128,
    ) -> Vec<RoyaltyPayout> {
        assert_version(&env);
        payer.require_auth();

        if sale_price <= 0 {
            panic_with_error!(&env, RoyaltyError::SalePriceNotPositive);
        }
        if asset == Address::from_str(&env, ZERO_ADDRESS) {
            panic_with_error!(&env, RoyaltyError::AssetZeroAddress);
        }

        // Reads the config, so terms that do not exist fail here rather than
        // after the first transfer.
        let payouts = Self::quote_royalty(env.clone(), target_id, is_collection, sale_price);

        let token = TokenClient::new(&env, &asset);
        let mut paid: i128 = 0;
        for payout in payouts.iter() {
            // A zero-share recipient is impossible to configure, but a payout
            // can round to zero on a small sale. Skipping it saves a
            // cross-contract call and a ledger write that would move nothing.
            if payout.amount <= 0 {
                continue;
            }
            token.transfer(&payer, &payout.recipient, &payout.amount);
            paid += payout.amount;
        }

        emit(&env, RoyaltyEvent::Paid(target_id, asset, payer, paid));
        payouts
    }

    /// Validate a split map so the declared shares can actually be paid out.
    ///
    /// An empty map is valid and means "100% to the creator", which is the
    /// documented default. A non-empty map must contain at most
    /// [`MAX_RECIPIENTS`] entries, every share must be non-zero, and the shares
    /// must sum to exactly [`TOTAL_SHARE`]. Without this a config could promise
    /// 250% of a sale (impossible, so every payout would underflow or the
    /// listed recipients would silently receive less than configured) or 40%
    /// (leaving the remainder unaccounted for).
    fn validate_recipients(env: &Env, recipients: &Map<Address, u32>) {
        if recipients.is_empty() {
            return;
        }

        if recipients.len() > MAX_RECIPIENTS {
            panic_with_error!(env, RoyaltyError::TooManyRecipients);
        }

        let mut total: u32 = 0;
        for (_, share) in recipients.iter() {
            if share == 0 {
                panic_with_error!(env, RoyaltyError::ZeroShare);
            }
            total = total.saturating_add(share);
        }

        if total != TOTAL_SHARE {
            panic_with_error!(env, RoyaltyError::SharesMustSumToTotal);
        }
    }

    pub fn get_royalty(env: Env, target_id: u64, is_collection: bool) -> RoyaltyConfig {
        let key = if is_collection {
            RoyaltyKey::ConfigCollection(target_id)
        } else {
            RoyaltyKey::ConfigNft(target_id)
        };

        match env
            .storage()
            .persistent()
            .get::<RoyaltyKey, RoyaltyConfig>(&key)
        {
            Some(config) => {
                bump_ttl(&env, &key);
                config
            }
            None => panic_with_error!(&env, RoyaltyError::NoConfig),
        }
    }

    pub fn is_frozen(env: Env, target_id: u64, is_collection: bool) -> bool {
        let key = if is_collection {
            RoyaltyKey::ConfigCollection(target_id)
        } else {
            RoyaltyKey::ConfigNft(target_id)
        };

        env.storage()
            .persistent()
            .get::<RoyaltyKey, RoyaltyConfig>(&key)
            .map(|c| c.is_frozen)
            .unwrap_or(false)
    }
}

#[cfg(test)]
mod test;
