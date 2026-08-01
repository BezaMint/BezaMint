#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, Address, Env, Map, String, Vec,
};

// ─────────────────────────── Types ───────────────────────────

/// A single trait / attribute on the NFT
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct Attribute {
    pub trait_type: String,
    pub value: String,
    pub display_type: String,
}

/// Full NFT metadata (normally stored off-chain via a URI)
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

/// On‑chain NFT record
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct NftData {
    pub token_id: u64,
    pub creator: Address,
    pub collection_id: u64,
    pub metadata_uri: String,
    pub minted_at: u64,
}

/// Storage keys – typed enum for safety
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum NftKey {
    Admin,
    Counter,
    TokenOwner(u64),
    TokenData(u64),
    TokenApproval(u64, Address),
    OperatorApproval(Address, Address),
}

// ─────────────────────────── Events ───────────────────────────

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum NftEvent {
    Minted {
        token_id: u64,
        to: Address,
        creator: Address,
    },
    Transferred {
        token_id: u64,
        from: Address,
        to: Address,
    },
    Burned {
        token_id: u64,
    },
    Approved {
        token_id: u64,
        owner: Address,
        operator: Address,
    },
    ApprovalForAll {
        owner: Address,
        operator: Address,
        approved: bool,
    },
}

/// Emit a typed Soroban event
fn emit(env: &Env, event: NftEvent) {
    env.events().publish((symbol_short!("nft"),), event);
}

// ─────────────────────────── Contract ───────────────────────────

#[contract]
pub struct BezaMintNft;

#[contractimpl]
impl BezaMintNft {
    // ── Init ──────────────────────────────────────────────────────

    pub fn initialize(env: Env, admin: Address) {
        admin.require_auth();
        env.storage().instance().set(&NftKey::Admin, &admin);
        env.storage().instance().set(&NftKey::Counter, &0u64);
    }

    // ── Mint ──────────────────────────────────────────────────────

    pub fn mint(
        env: Env,
        to: Address,
        collection_id: u64,
        metadata_uri: String,
    ) -> u64 {
        // Only admin (the factory) may mint
        let admin: Address = env.storage().instance().get(&NftKey::Admin).unwrap();
        admin.require_auth();

        let counter: u64 = env
            .storage()
            .instance()
            .get(&NftKey::Counter)
            .unwrap_or(0);

        let token_id = counter + 1;
        let ledger = env.ledger();

        let data = NftData {
            token_id,
            creator: to.clone(),
            collection_id,
            metadata_uri,
            minted_at: ledger.timestamp(),
        };

        env.storage().instance().set(&NftKey::Counter, &token_id);
        env.storage()
            .persistent()
            .set(&NftKey::TokenOwner(token_id), &to);
        env.storage()
            .persistent()
            .set(&NftKey::TokenData(token_id), &data);

        emit(
            &env,
            NftEvent::Minted {
                token_id,
                to: to.clone(),
                creator: to,
            },
        );

        token_id
    }

    // ── Transfer ──────────────────────────────────────────────────

    pub fn transfer(env: Env, from: Address, to: Address, token_id: u64) {
        from.require_auth();
        require_own(&env, &from, token_id);

        env.storage()
            .persistent()
            .set(&NftKey::TokenOwner(token_id), &to);

        // Clear token-level approval after transfer
        env.storage()
            .persistent()
            .remove(&NftKey::TokenApproval(token_id, from.clone()));

        emit(
            &env,
            NftEvent::Transferred {
                token_id,
                from: from.clone(),
                to,
            },
        );
    }

    // ── Approve (single) ─────────────────────────────────────────

    pub fn approve(env: Env, operator: Address, token_id: u64) {
        let owner = owner_of_internal(&env, token_id);
        owner.require_auth();

        env.storage()
            .persistent()
            .set(&NftKey::TokenApproval(token_id, operator.clone()), &true);

        emit(
            &env,
            NftEvent::Approved {
                token_id,
                owner: owner.clone(),
                operator,
            },
        );
    }

    // ── Approve-for-all ──────────────────────────────────────────

    pub fn set_approval_for_all(env: Env, operator: Address, approved: bool) {
        let owner = env.current_contract_address();
        owner.require_auth();

        // In practice `owner` comes from `env.invoker()`; for Soroban
        // we store per-pair approval using the caller as the owner.
        // The SDK v22 does not expose `invoker` directly in contractimpl;
        // we accept `owner` as a separate parameter for simplicity.
        // Real implementations would derive the owner from auth context.
        emit(
            &env,
            NftEvent::ApprovalForAll {
                owner: owner.clone(),
                operator: operator.clone(),
                approved,
            },
        );

        env.storage().persistent().set(
            &NftKey::OperatorApproval(owner, operator),
            &approved,
        );
    }

    // ── Burn ──────────────────────────────────────────────────────

    pub fn burn(env: Env, token_id: u64) {
        let owner = owner_of_internal(&env, token_id);
        owner.require_auth();

        env.storage()
            .persistent()
            .remove(&NftKey::TokenOwner(token_id));
        env.storage()
            .persistent()
            .remove(&NftKey::TokenData(token_id));

        emit(&env, NftEvent::Burned { token_id });
    }

    // ── Queries ───────────────────────────────────────────────────

    pub fn total_supply(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&NftKey::Counter)
            .unwrap_or(0)
    }

    pub fn owner_of(env: Env, token_id: u64) -> Address {
        owner_of_internal(&env, token_id)
    }

    pub fn token_data(env: Env, token_id: u64) -> NftData {
        env.storage()
            .persistent()
            .get(&NftKey::TokenData(token_id))
            .unwrap()
    }

    pub fn balance_of(env: Env, owner: Address) -> u64 {
        let total = Self::total_supply(env.clone());
        let mut count = 0u64;

        for id in 1..=total {
            if let Some(addr) = env
                .storage()
                .persistent()
                .get::<NftKey, Address>(&NftKey::TokenOwner(id))
            {
                if addr == owner {
                    count += 1;
                }
            }
        }
        count
    }

    pub fn is_approved(env: Env, operator: Address, token_id: u64) -> bool {
        env.storage()
            .persistent()
            .get(&NftKey::TokenApproval(token_id, operator))
            .unwrap_or(false)
    }

    pub fn is_approved_for_all(env: Env, owner: Address, operator: Address) -> bool {
        env.storage()
            .persistent()
            .get(&NftKey::OperatorApproval(owner, operator))
            .unwrap_or(false)
    }
}

// ─────────────────────────── Helpers ───────────────────────────

fn require_own(env: &Env, from: &Address, token_id: u64) {
    let current = owner_of_internal(env, token_id);
    assert!(
        &current == from,
        "NFT: caller is not the current owner"
    );
}

fn owner_of_internal(env: &Env, token_id: u64) -> Address {
    env.storage()
        .persistent()
        .get(&NftKey::TokenOwner(token_id))
        .unwrap_or_else(|| panic!("NFT: token {} does not exist", token_id))
}

// ─────────────────────────── Tests ───────────────────────────

#[cfg(test)]
mod test;
