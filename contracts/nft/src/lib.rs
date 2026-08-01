#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, String, Vec};

/// Represents the metadata structure for an NFT
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct NftMetadata {
    pub name: String,
    pub description: String,
    pub image_uri: String,
    pub animation_uri: String,
    pub external_url: String,
    pub attributes: Vec<Attribute>,
}

/// Represents an attribute/trait of an NFT
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct Attribute {
    pub trait_type: String,
    pub value: String,
    pub display_type: String,
}

/// Data associated with a minted NFT
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct NftData {
    pub owner: Address,
    pub creator: Address,
    pub token_id: u64,
    pub metadata_uri: String,
    pub collection_id: u64,
    pub minted_at: u64,
}

#[contract]
pub struct BezaMintNft;

#[contractimpl]
impl BezaMintNft {
    /// Initialize the NFT contract with admin
    pub fn initialize(env: Env, admin: Address) -> u32 {
        admin.require_auth();
        env.storage().instance().set(&symbol!("admin"), &admin);
        env.storage().instance().set(&symbol!("counter"), &0u64);
        0
    }

    /// Get the total number of minted NFTs
    pub fn total_supply(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&symbol!("counter"))
            .unwrap_or(0)
    }
}

#[cfg(test)]
mod test;
