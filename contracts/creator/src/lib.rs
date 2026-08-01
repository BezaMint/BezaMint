#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, String, Vec};

/// Creator profile information
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct CreatorProfile {
    pub address: Address,
    pub display_name: String,
    pub bio: String,
    pub avatar_uri: String,
    pub banner_uri: String,
    pub social_links: Vec<SocialLink>,
    pub created_at: u64,
    pub is_verified: bool,
}

/// Social link for a creator profile
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct SocialLink {
    pub platform: String,
    pub url: String,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum CreatorStorageKey {
    Admin,
    Profile(Address),
    Counter,
}

#[contract]
pub struct BezaMintCreator;

#[contractimpl]
impl BezaMintCreator {
    /// Initialize registry
    pub fn initialize(env: Env, admin: Address) -> u32 {
        admin.require_auth();
        env.storage()
            .instance()
            .set(&CreatorStorageKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&CreatorStorageKey::Counter, &0u64);
        0
    }

    /// Get total registered creators
    pub fn total_creators(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&CreatorStorageKey::Counter)
            .unwrap_or(0)
    }
}

#[cfg(test)]
mod test;
