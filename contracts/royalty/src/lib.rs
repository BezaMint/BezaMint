#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, Map, String};

/// Royalty configuration for an NFT or collection
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct RoyaltyConfig {
    pub basis_points: u32,   // Royalty in basis points (e.g., 500 = 5%)
    pub recipients: Map<Address, u32>, // Recipient -> share percentage
    pub is_frozen: bool,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum RoyaltyStorageKey {
    Admin,
    Config(u64), // token_id or collection_id -> RoyaltyConfig
}

#[contract]
pub struct BezaMintRoyalty;

#[contractimpl]
impl BezaMintRoyalty {
    /// Initialize with admin
    pub fn initialize(env: Env, admin: Address) -> u32 {
        admin.require_auth();
        env.storage()
            .instance()
            .set(&RoyaltyStorageKey::Admin, &admin);
        0
    }

    /// Validate royalty basis points (0-10000, max 100%)
    pub fn validate_basis_points(env: Env, basis_points: u32) -> bool {
        basis_points <= 10000
    }
}

#[cfg(test)]
mod test;
