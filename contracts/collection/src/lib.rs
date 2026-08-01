#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, String, Vec};

/// Metadata for a collection
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct CollectionMetadata {
    pub name: String,
    pub description: String,
    pub image_uri: String,
    pub external_url: String,
    pub category: String,
    pub creator: Address,
}

/// Collection data stored on-chain
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct CollectionData {
    pub id: u64,
    pub creator: Address,
    pub metadata_uri: String,
    pub nft_count: u64,
    pub created_at: u64,
    pub is_archived: bool,
}

#[contract]
pub struct BezaMintCollection;

#[contractimpl]
impl BezaMintCollection {
    /// Initialize with admin address
    pub fn initialize(env: Env, admin: Address) -> u32 {
        admin.require_auth();
        env.storage().instance().set(&symbol!("admin"), &admin);
        env.storage().instance().set(&symbol!("counter"), &0u64);
        0
    }

    /// Get total number of collections
    pub fn total_collections(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&symbol!("counter"))
            .unwrap_or(0)
    }
}

#[cfg(test)]
mod test;
