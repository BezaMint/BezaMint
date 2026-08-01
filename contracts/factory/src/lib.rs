#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, String, Vec};

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
}

fn emit(env: &Env, event: FactoryEvent) {
    env.events().publish((symbol_short!("factory"),), event);
}

// ── NFT Contract Interface (client generated) ──────────────────

mod nft_client {
    soroban_sdk::contractimport!(
        file = "../nft/target/wasm32-unknown-unknown/release/bezamint_nft.wasm"
    );
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
        env.storage()
            .instance()
            .set(&FactoryKey::CollectionContract, &collection);
        env.storage()
            .instance()
            .set(&FactoryKey::RoyaltyContract, &royalty);
        env.storage()
            .instance()
            .set(&FactoryKey::CreatorContract, &creator);

        emit(&env, FactoryEvent::ContractsSet { nft, collection, royalty, creator });
    }

    /// Cross-contract call: mint an NFT AND configure its royalty in one workflow.
    /// Returns the newly minted token_id.
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
        let royalty_addr: Address = env
            .storage()
            .instance()
            .get(&FactoryKey::RoyaltyContract)
            .unwrap();

        // ── Cross-contract call 1: mint the NFT ──────────────────
        let nft_client = nft_client::Client::new(&env, &nft_addr);
        let token_id: u64 = nft_client.mint(&to, &collection_id, &metadata_uri);

        // ── Cross-contract call 2: configure royalty ─────────────
        // Build empty recipients map (creator gets 100% by default)
        let recipients = soroban_sdk::Map::<Address, u32>::new(&env);

        // Invoke royalty contract: configure_royalty(target_id, bps, recipients, is_collection=false)
        let royalty_args: Vec<soroban_sdk::Val> = Vec::from_array(
            &env,
            [
                soroban_sdk::val!(env, token_id),
                soroban_sdk::val!(env, basis_points),
                soroban_sdk::val!(env, recipients),
                soroban_sdk::val!(env, false), // is_collection = false
            ],
        );
        env.invoke_contract(
            &royalty_addr,
            &symbol_short!("configure_royalty"),
            royalty_args,
        );

        emit(&env, FactoryEvent::NftMinted { token_id, by: caller });

        token_id
    }

    /// Cross-contract call: create a collection AND register the creator if not already registered.
    pub fn create_collection_for_creator(
        env: Env,
        caller: Address,
        metadata_uri: String,
    ) -> u64 {
        caller.require_auth();

        let collection_addr: Address = env
            .storage()
            .instance()
            .get(&FactoryKey::CollectionContract)
            .unwrap();
        let creator_addr: Address = env
            .storage()
            .instance()
            .get(&FactoryKey::CreatorContract)
            .unwrap();

        // ── Cross-contract call 1: create collection ─────────────
        let col_args = Vec::from_array(
            &env,
            [
                soroban_sdk::val!(env, caller.clone()),
                soroban_sdk::val!(env, metadata_uri),
            ],
        );
        let raw_collection_id: soroban_sdk::Val =
            env.invoke_contract(&collection_addr, &symbol_short!("create_collection"), col_args);
        let collection_id: u64 = raw_collection_id.try_into_val(&env).unwrap_or(0);

        // ── Cross-contract call 2: register creator if not already ──
        let is_registered = Self::is_creator_registered_internal(
            &env,
            &creator_addr,
            &caller,
        );
        if !is_registered {
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

        collection_id
    }

    // ── Queries ─────────────────────────────────────────────

    pub fn get_nft_contract(env: Env) -> Address {
        env.storage().instance().get(&FactoryKey::NftContract).unwrap()
    }

    pub fn get_collection_contract(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&FactoryKey::CollectionContract)
            .unwrap()
    }

    pub fn get_royalty_contract(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&FactoryKey::RoyaltyContract)
            .unwrap()
    }

    pub fn get_creator_contract(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&FactoryKey::CreatorContract)
            .unwrap()
    }
}

// ── Helpers ────────────────────────────────────────────────

impl BezaMintFactory {
    fn is_creator_registered_internal(env: &Env, creator_addr: &Address, caller: &Address) -> bool {
        let args = Vec::from_array(env, [soroban_sdk::val!(env, caller.clone())]);
        let result: soroban_sdk::Val =
            env.invoke_contract(creator_addr, &symbol_short!("is_registered"), args);
        result.try_into_val(env).unwrap_or(false)
    }
}

// ── Tests ──────────────────────────────────────────────────

#[cfg(test)]
mod test;
