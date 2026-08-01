#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, Map, String, Vec, Val};

// ── Types ──────────────────────────────────────────────────────

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
    CollectionCreated {
        collection_id: u64,
        by: Address,
    },
}

fn emit(env: &Env, event: FactoryEvent) {
    env.events().publish((symbol_short!("factory"),), event);
}

// ── Contract ───────────────────────────────────────────────────

#[contract]
pub struct BezaMintFactory;

#[contractimpl]
impl BezaMintFactory {
    pub fn initialize(env: Env, admin: Address) {
        admin.require_auth();
        env.storage().instance().set(&FactoryKey::Admin, &admin);
    }

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

    /// Cross-contract call: mint an NFT then configure royalty in one workflow
    pub fn mint_with_royalty(
        env: Env,
        caller: Address,
        to: Address,
        collection_id: u64,
        metadata_uri: String,
        basis_points: u32,
    ) -> u64 {
        caller.require_auth();

        let nft_addr: Address = env.storage().instance().get(&FactoryKey::NftContract).unwrap();
        let royalty_addr: Address = env.storage().instance().get(&FactoryKey::RoyaltyContract).unwrap();

        // Cross-contract call 1: mint the NFT via env.invoke_contract
        let mint_args = Vec::from_array(
            &env,
            [
                soroban_sdk::val!(env, to.clone()),
                soroban_sdk::val!(env, collection_id),
                soroban_sdk::val!(env, metadata_uri),
            ],
        );
        let raw_token_id: Val =
            env.invoke_contract(&nft_addr, &symbol_short!("mint"), mint_args);
        let token_id: u64 = raw_token_id.try_into_val(&env).unwrap_or(0);

        // Cross-contract call 2: configure royalty on the newly minted NFT
        let empty_recipients: Map<Address, u32> = Map::new(&env);
        let royalty_args = Vec::from_array(
            &env,
            [
                soroban_sdk::val!(env, token_id),
                soroban_sdk::val!(env, basis_points),
                soroban_sdk::val!(env, empty_recipients),
                soroban_sdk::val!(env, false), // is_collection
            ],
        );
        env.invoke_contract(&royalty_addr, &symbol_short!("configure_royalty"), royalty_args);

        emit(&env, FactoryEvent::NftMinted { token_id, by: caller });

        token_id
    }

    /// Cross-contract call: create collection then auto-register creator if needed
    pub fn create_collection_for_creator(
        env: Env,
        caller: Address,
        metadata_uri: String,
    ) -> u64 {
        caller.require_auth();

        let collection_addr: Address = env.storage().instance().get(&FactoryKey::CollectionContract).unwrap();
        let creator_addr: Address = env.storage().instance().get(&FactoryKey::CreatorContract).unwrap();

        // Cross-contract call 1: create the collection
        let col_args = Vec::from_array(
            &env,
            [
                soroban_sdk::val!(env, caller.clone()),
                soroban_sdk::val!(env, metadata_uri),
            ],
        );
        let raw_id: Val =
            env.invoke_contract(&collection_addr, &symbol_short!("create_collection"), col_args);
        let collection_id: u64 = raw_id.try_into_val(&env).unwrap_or(0);

        // Cross-contract call 2: check if creator is registered
        let check_args = Vec::from_array(&env, [soroban_sdk::val!(env, caller.clone())]);
        let is_registered: Val =
            env.invoke_contract(&creator_addr, &symbol_short!("is_registered"), check_args);
        let registered: bool = is_registered.try_into_val(&env).unwrap_or(false);

        // Cross-contract call 3: register creator if not already
        if !registered {
            let reg_args = Vec::from_array(
                &env,
                [
                    soroban_sdk::val!(env, caller.clone()),
                    soroban_sdk::val!(env, String::from_str(&env, "")),
                    soroban_sdk::val!(env, String::from_str(&env, "")),
                    soroban_sdk::val!(env, String::from_str(&env, "")),
                    soroban_sdk::val!(env, String::from_str(&env, "")),
                ],
            );
            env.invoke_contract(&creator_addr, &symbol_short!("register"), reg_args);
        }

        emit(&env, FactoryEvent::CollectionCreated { collection_id, by: caller });

        collection_id
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
