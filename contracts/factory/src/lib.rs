#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, String, Vec};

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct MintRequest {
    pub to: Address,
    pub collection_id: u64,
    pub metadata_uri: String,
    pub royalty_bps: u32,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum FactoryKey {
    Admin,
    NftContract,
    CollectionContract,
    RoyaltyContract,
    CreatorContract,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum FactoryEvent {
    ContractsSet {
        nft: Address,
        collection: Address,
        royalty: Address,
        creator: Address,
    },
    NftMinted {
        token_id: u64,
        by: Address,
    },
}

fn emit(env: &Env, event: FactoryEvent) {
    env.events().publish((symbol_short!("factory"),), event);
}

#[contract]
pub struct BezaMintFactory;

#[contractimpl]
impl BezaMintFactory {
    pub fn initialize(env: Env, admin: Address) {
        admin.require_auth();
        env.storage().instance().set(&FactoryKey::Admin, &admin);
    }

    /// Set the addresses of all four child contracts
    pub fn set_contracts(
        env: Env,
        admin: Address,
        nft: Address,
        collection: Address,
        royalty: Address,
        creator: Address,
    ) {
        let stored_admin: Address = env.storage().instance().get(&FactoryKey::Admin).unwrap();
        stored_admin.require_auth();

        env.storage().instance().set(&FactoryKey::NftContract, &nft);
        env.storage().instance().set(&FactoryKey::CollectionContract, &collection);
        env.storage().instance().set(&FactoryKey::RoyaltyContract, &royalty);
        env.storage().instance().set(&FactoryKey::CreatorContract, &creator);

        emit(&env, FactoryEvent::ContractsSet { nft, collection, royalty, creator });
    }

    // ── Queries ─────────────────────────────────────────────

    pub fn get_nft_contract(env: Env) -> Address {
        env.storage().instance().get(&FactoryKey::NftContract).unwrap()
    }

    pub fn get_collection_contract(env: Env) -> Address {
        env.storage().instance().get(&FactoryKey::CollectionContract).unwrap()
    }

    pub fn get_royalty_contract(env: Env) -> Address {
        env.storage().instance().get(&FactoryKey::RoyaltyContract).unwrap()
    }

    pub fn get_creator_contract(env: Env) -> Address {
        env.storage().instance().get(&FactoryKey::CreatorContract).unwrap()
    }
}

#[cfg(test)]
mod test;
