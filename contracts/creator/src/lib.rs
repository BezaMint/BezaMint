#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, Address, Env, String, Vec,
};

// ─────────────────────────── Types ───────────────────────────

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
    pub updated_at: u64,
    pub is_verified: bool,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct SocialLink {
    pub platform: String,
    pub url: String,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum CreatorKey {
    Admin,
    Version,
    Profile(Address),
    Counter,
}

// ─────────────────────────── Events ───────────────────────────

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum CreatorEvent {
    Registered(Address),
    ProfileUpdated(Address),
    Verified(Address),
}

fn emit(env: &Env, event: CreatorEvent) {
    env.events().publish((symbol_short!("creator"),), event);
}

// ─────────────────────────── Contract ───────────────────────────

#[contract]
pub struct BezaMintCreator;

#[contractimpl]
impl BezaMintCreator {
    pub fn initialize(env: Env, admin: Address) {
        admin.require_auth();
        env.storage().instance().set(&CreatorKey::Admin, &admin);
        env.storage().instance().set(&CreatorKey::Counter, &0u64);
        env.storage().instance().set(&CreatorKey::Version, &1u32);
    }

    pub fn register(
        env: Env,
        creator: Address,
        display_name: String,
        bio: String,
        avatar_uri: String,
        banner_uri: String,
    ) {
        creator.require_auth();

        assert!(
            !env.storage()
                .persistent()
                .has(&CreatorKey::Profile(creator.clone())),
            "Creator: already registered"
        );

        let counter: u64 = env
            .storage()
            .instance()
            .get(&CreatorKey::Counter)
            .unwrap_or(0);

        let profile = CreatorProfile {
            address: creator.clone(),
            display_name,
            bio,
            avatar_uri,
            banner_uri,
            social_links: Vec::new(&env),
            created_at: env.ledger().timestamp(),
            updated_at: env.ledger().timestamp(),
            is_verified: false,
        };

        env.storage().persistent().set(&CreatorKey::Profile(creator.clone()), &profile);
        env.storage().instance().set(&CreatorKey::Counter, &(counter + 1));

        emit(&env, CreatorEvent::Registered(creator.clone()));
    }

    pub fn update_profile(
        env: Env,
        creator: Address,
        display_name: String,
        bio: String,
        avatar_uri: String,
        banner_uri: String,
    ) {
        creator.require_auth();

        let mut profile: CreatorProfile = env
            .storage()
            .persistent()
            .get(&CreatorKey::Profile(creator.clone()))
            .unwrap_or_else(|| panic!("Creator: profile not found"));

        profile.display_name = display_name;
        profile.bio = bio;
        profile.avatar_uri = avatar_uri;
        profile.banner_uri = banner_uri;
        profile.updated_at = env.ledger().timestamp();

        env.storage()
            .persistent()
            .set(&CreatorKey::Profile(creator.clone()), &profile);

        emit(&env, CreatorEvent::ProfileUpdated(creator));
    }

    pub fn set_social_links(env: Env, creator: Address, links: Vec<SocialLink>) {
        creator.require_auth();

        let mut profile: CreatorProfile = env
            .storage()
            .persistent()
            .get(&CreatorKey::Profile(creator.clone()))
            .unwrap_or_else(|| panic!("Creator: profile not found"));

        profile.social_links = links;
        profile.updated_at = env.ledger().timestamp();

        env.storage()
            .persistent()
            .set(&CreatorKey::Profile(creator.clone()), &profile);
    }

    pub fn verify_creator(env: Env, _admin: Address, creator: Address) {
        let stored_admin: Address = env.storage().instance().get(&CreatorKey::Admin).unwrap_or_else(|| panic!("Creator: not initialized"));
        stored_admin.require_auth();

        let mut profile: CreatorProfile = env
            .storage()
            .persistent()
            .get(&CreatorKey::Profile(creator.clone()))
            .unwrap_or_else(|| panic!("Creator: profile not found"));

        profile.is_verified = true;
        profile.updated_at = env.ledger().timestamp();

        env.storage()
            .persistent()
            .set(&CreatorKey::Profile(creator.clone()), &profile);

        emit(&env, CreatorEvent::Verified(creator));
    }

    // ── Queries ─────────────────────────────────────────────

    pub fn total_creators(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&CreatorKey::Counter)
            .unwrap_or(0)
    }

    pub fn get_profile(env: Env, creator: Address) -> CreatorProfile {
        env.storage()
            .persistent()
            .get(&CreatorKey::Profile(creator.clone()))
            .unwrap_or_else(|| panic!("Creator: profile not found"))
    }

    pub fn is_registered(env: Env, creator: Address) -> bool {
        env.storage()
            .persistent()
            .has(&CreatorKey::Profile(creator))
    }

    pub fn is_verified(env: Env, creator: Address) -> bool {
        env.storage()
            .persistent()
            .get::<CreatorKey, CreatorProfile>(&CreatorKey::Profile(creator))
            .map(|p| p.is_verified)
            .unwrap_or(false)
    }
}

#[cfg(test)]
mod test;
