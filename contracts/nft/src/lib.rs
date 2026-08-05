#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, String, Vec};

// ── Storage ────────────────────────────────────────────────────

const COUNTER: &str = "counter";
const ADMIN: &str = "admin";
const OWNER: &str = "owner";
const DATA: &str = "data";
const APPROVAL: &str = "approval";
const OP_APPROVAL: &str = "op_approv";

// ── Types ──────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct Attribute {
    pub trait_type: String,
    pub value: String,
    pub display_type: String,
}

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

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct NftData {
    pub token_id: u64,
    pub creator: Address,
    pub collection_id: u64,
    pub metadata_uri: String,
    pub minted_at: u64,
}

// ── Contract ───────────────────────────────────────────────────


#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum NftEvent {
    Minted(u64, Address),
    Transferred(u64, Address, Address),
    Burned(u64, Address),
    Approved(u64, Address),
}

fn emit_nft(env: &Env, event: NftEvent) {
    env.events().publish((symbol_short!("nft"),), event);
}

#[contract]
pub struct BezaMintNft;

#[contractimpl]
impl BezaMintNft {
    pub fn initialize(env: Env, admin: Address) {
        admin.require_auth();
        env.storage().instance().set(&String::from_str(&env, ADMIN), &admin);
        env.storage().instance().set(&String::from_str(&env, COUNTER), &0u64);
    }

    pub fn mint(env: Env, to: Address, collection_id: u64, metadata_uri: String) -> u64 {
        let admin: Address = env.storage().instance().get(&String::from_str(&env, ADMIN)).unwrap_or_else(|| panic!("NFT: not initialized"));
        admin.require_auth();

        let counter: u64 = env.storage().instance().get(&String::from_str(&env, COUNTER)).unwrap_or(0);
        let token_id = counter + 1;
        let ledger = env.ledger();

        let data = NftData {
            token_id,
            creator: to.clone(),
            collection_id,
            metadata_uri,
            minted_at: ledger.timestamp(),
        };

        env.storage().instance().set(&String::from_str(&env, COUNTER), &token_id);
        env.storage().persistent().set(&(String::from_str(&env, OWNER), token_id), &to);
        env.storage().persistent().set(&(String::from_str(&env, DATA), token_id), &data);

        emit_nft(&env, NftEvent::Minted(token_id, to.clone()));

        token_id
    }

    pub fn transfer(env: Env, from: Address, to: Address, token_id: u64) {
        from.require_auth();
        let current: Address = env.storage().persistent()
            .get(&(String::from_str(&env, OWNER), token_id))
            .unwrap_or_else(|| panic!("NFT: token {} does not exist", token_id));
        assert!(&current == &from, "NFT: caller not owner");

        env.storage().persistent().set(&(String::from_str(&env, OWNER), token_id), &to);
        env.storage().persistent().remove(&(String::from_str(&env, APPROVAL), token_id, from));

        emit_nft(&env, NftEvent::Transferred(token_id, from.clone(), to.clone()));
    }

    pub fn approve(env: Env, operator: Address, token_id: u64) {
        let owner: Address = env.storage().persistent()
            .get(&(String::from_str(&env, OWNER), token_id)).unwrap();
        owner.require_auth();
        env.storage().persistent().set(&(String::from_str(&env, APPROVAL), token_id, operator.clone()), &true);
    }

    pub fn set_approval_for_all(env: Env, owner_addr: Address, operator: Address, approved: bool) {
        owner_addr.require_auth();
        env.storage().persistent().set(&(String::from_str(&env, OP_APPROVAL), owner_addr, operator), &approved);
    }

    pub fn burn(env: Env, token_id: u64) {
        let owner: Address = env.storage().persistent()
            .get(&(String::from_str(&env, OWNER), token_id)).unwrap();
        owner.require_auth();
        env.storage().persistent().remove(&(String::from_str(&env, OWNER), token_id));
        env.storage().persistent().remove(&(String::from_str(&env, DATA), token_id));

        emit_nft(&env, NftEvent::Burned(token_id, owner));
    }

    pub fn total_supply(env: Env) -> u64 {
        env.storage().instance().get(&String::from_str(&env, COUNTER)).unwrap_or(0)
    }

    pub fn owner_of(env: Env, token_id: u64) -> Address {
        env.storage().persistent().get(&(String::from_str(&env, OWNER), token_id)).unwrap()
    }

    pub fn token_data(env: Env, token_id: u64) -> NftData {
        env.storage().persistent().get(&(String::from_str(&env, DATA), token_id)).unwrap()
    }

    pub fn balance_of(env: Env, owner: Address) -> u64 {
        let total = Self::total_supply(env.clone());
        let mut count = 0u64;
        for id in 1..=total {
            if let Some(addr) = env.storage().persistent()
                .get::<(String, u64), Address>(&(String::from_str(&env, OWNER), id)) {
                if addr == owner { count += 1; }
            }
        }
        count
    }

    pub fn is_approved(env: Env, operator: Address, token_id: u64) -> bool {
        env.storage().persistent().get(&(String::from_str(&env, APPROVAL), token_id, operator)).unwrap_or(false)
    }

    pub fn is_approved_for_all(env: Env, owner: Address, operator: Address) -> bool {
        env.storage().persistent().get(&(String::from_str(&env, OP_APPROVAL), owner, operator)).unwrap_or(false)
    }
}

#[cfg(test)]
mod test;
