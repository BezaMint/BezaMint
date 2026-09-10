#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, Map};

// ─────────────────────────── Constants ───────────────────────────

/// Royalty rates are expressed in basis points, where 10,000 bp == 100%.
const MAX_BASIS_POINTS: u32 = 10_000;

/// Recipient shares are expressed as whole percentages that must sum to 100.
const TOTAL_SHARE: u32 = 100;

/// Bound on the number of split recipients, so a config cannot be used to
/// create an unbounded payout fan-out.
const MAX_RECIPIENTS: u32 = 10;

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
    AdminChanged(Address),
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

// ─────────────────────────── Contract ───────────────────────────

#[contract]
pub struct BezaMintRoyalty;

#[contractimpl]
impl BezaMintRoyalty {
    pub fn initialize(env: Env, admin: Address) {
        if Self::is_initialized(env.clone()) {
            panic!("Royalty: already initialized");
        }
        admin.require_auth();
        env.storage().instance().set(&RoyaltyKey::Admin, &admin);
        env.storage().instance().set(&RoyaltyKey::Version, &1u32);
        // Instance data and contract code share one TTL; refresh both up front
        // so a long-dormant contract does not silently lose its admin binding.
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_LEDGERS);
    }

    /// Returns `true` once `initialize` has succeeded.
    pub fn is_initialized(env: Env) -> bool {
        env.storage().instance().has(&RoyaltyKey::Admin)
    }

    /// Transfer the admin role. Only the current admin may call. Deployment
    /// uses this to hand the role to the Factory once contracts are wired: the
    /// Factory's cross-contract `configure_royalty` calls authenticate as the
    /// admin, so without this transfer the flagship mint-with-royalty flow can
    /// only ever be authorized by a human deployer who is never present.
    pub fn set_admin(env: Env, new_admin: Address) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&RoyaltyKey::Admin)
            .unwrap_or_else(|| panic!("Royalty: not initialized"));
        admin.require_auth();

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
        let admin: Address = env
            .storage()
            .instance()
            .get(&RoyaltyKey::Admin)
            .unwrap_or_else(|| panic!("Royalty: not initialized"));
        admin.require_auth();

        assert!(
            Self::validate_basis_points(basis_points),
            "Royalty: basis points must be <= {MAX_BASIS_POINTS}"
        );
        Self::validate_recipients(&recipients);

        let key = if is_collection {
            RoyaltyKey::ConfigCollection(target_id)
        } else {
            RoyaltyKey::ConfigNft(target_id)
        };

        // `configure_royalty` creates terms; it must never silently overwrite
        // them. Before this guard a frozen config could be replaced outright,
        // which made `freeze_royalty` advisory rather than binding, and a live
        // config could be swapped without any `Updated` event being emitted.
        assert!(
            !env.storage().persistent().has(&key),
            "Royalty: config already exists for target {target_id}; use update_royalty"
        );

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
        caller.require_auth();

        let admin: Address = env
            .storage()
            .instance()
            .get(&RoyaltyKey::Admin)
            .unwrap_or_else(|| panic!("Royalty: not initialized"));

        let key = if is_collection {
            RoyaltyKey::ConfigCollection(target_id)
        } else {
            RoyaltyKey::ConfigNft(target_id)
        };

        let mut config: RoyaltyConfig = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic!("Royalty: no config for target {}", target_id));

        assert!(
            caller == admin || caller == config.creator,
            "Royalty: caller cannot update this config"
        );
        assert!(
            !config.is_frozen,
            "Royalty: config is frozen for {target_id}"
        );
        assert!(
            Self::validate_basis_points(basis_points),
            "Royalty: basis points must be <= {MAX_BASIS_POINTS}"
        );
        Self::validate_recipients(&recipients);

        config.basis_points = basis_points;
        config.recipients = recipients;
        config.set_at = env.ledger().timestamp();

        env.storage().persistent().set(&key, &config);
        bump_ttl(&env, &key);

        emit(&env, RoyaltyEvent::Updated(target_id, basis_points));
    }

    /// Permanently lock the terms for a target. Admin-only, and irreversible:
    /// once frozen, neither the creator nor the admin can amend them.
    pub fn freeze_royalty(env: Env, target_id: u64, is_collection: bool) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&RoyaltyKey::Admin)
            .unwrap_or_else(|| panic!("Royalty: not initialized"));
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
            .unwrap_or_else(|| panic!("Royalty: no config for target {}", target_id));

        config.is_frozen = true;
        env.storage().persistent().set(&key, &config);
        bump_ttl(&env, &key);

        emit(&env, RoyaltyEvent::Frozen(target_id));
    }

    // ── Queries ─────────────────────────────────────────────

    pub fn validate_basis_points(basis_points: u32) -> bool {
        basis_points <= MAX_BASIS_POINTS
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
    fn validate_recipients(recipients: &Map<Address, u32>) {
        if recipients.is_empty() {
            return;
        }

        assert!(
            recipients.len() <= MAX_RECIPIENTS,
            "Royalty: at most {MAX_RECIPIENTS} recipients are allowed"
        );

        let mut total: u32 = 0;
        for (_, share) in recipients.iter() {
            assert!(
                share > 0,
                "Royalty: every recipient share must be greater than zero"
            );
            total = total.saturating_add(share);
        }

        assert!(
            total == TOTAL_SHARE,
            "Royalty: recipient shares must sum to {TOTAL_SHARE}"
        );
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
            None => panic!("Royalty: no config for target {target_id}"),
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
