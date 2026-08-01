#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, Address, Env, Map,
};

// ─────────────────────────── Types ───────────────────────────

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct RoyaltyConfig {
    pub basis_points: u32,
    pub recipients: Map<Address, u32>,
    pub is_frozen: bool,
    pub set_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum RoyaltyKey {
    Admin,
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
}

fn emit(env: &Env, event: RoyaltyEvent) {
    env.events().publish((symbol_short!("royalty"),), event);
}

// ─────────────────────────── Contract ───────────────────────────

#[contract]
pub struct BezaMintRoyalty;

#[contractimpl]
impl BezaMintRoyalty {
    pub fn initialize(env: Env, admin: Address) {
        admin.require_auth();
        env.storage().instance().set(&RoyaltyKey::Admin, &admin);
    }

    pub fn configure_royalty(
        env: Env,
        target_id: u64,
        basis_points: u32,
        recipients: Map<Address, u32>,
        is_collection: bool,
    ) {
        let admin: Address = env.storage().instance().get(&RoyaltyKey::Admin).unwrap();
        admin.require_auth();

        assert!(
            Self::validate_basis_points(basis_points),
            "Royalty: basis points must be <= 10000"
        );

        let config = RoyaltyConfig {
            basis_points,
            recipients,
            is_frozen: false,
            set_at: env.ledger().timestamp(),
        };

        let key = if is_collection {
            RoyaltyKey::ConfigCollection(target_id)
        } else {
            RoyaltyKey::ConfigNft(target_id)
        };

        env.storage().persistent().set(&key, &config);

        emit(&env, RoyaltyEvent::Configured(target_id, basis_points));
    }

    pub fn update_royalty(
        env: Env,
        target_id: u64,
        basis_points: u32,
        recipients: Map<Address, u32>,
        is_collection: bool,
    ) {
        let admin: Address = env.storage().instance().get(&RoyaltyKey::Admin).unwrap();
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

        assert!(!config.is_frozen, "Royalty: config is frozen for {}", target_id);
        assert!(
            Self::validate_basis_points(basis_points),
            "Royalty: basis points must be <= 10000"
        );

        config.basis_points = basis_points;
        config.recipients = recipients;
        config.set_at = env.ledger().timestamp();

        env.storage().persistent().set(&key, &config);

        emit(&env, RoyaltyEvent::Updated(target_id, basis_points));
    }

    pub fn freeze_royalty(env: Env, target_id: u64, is_collection: bool) {
        let admin: Address = env.storage().instance().get(&RoyaltyKey::Admin).unwrap();
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

        emit(&env, RoyaltyEvent::Frozen(target_id));
    }

    // ── Queries ─────────────────────────────────────────────

    pub fn validate_basis_points(basis_points: u32) -> bool {
        basis_points <= 10000
    }

    pub fn get_royalty(env: Env, target_id: u64, is_collection: bool) -> RoyaltyConfig {
        let key = if is_collection {
            RoyaltyKey::ConfigCollection(target_id)
        } else {
            RoyaltyKey::ConfigNft(target_id)
        };

        env.storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic!("Royalty: no config for target {}", target_id))
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
