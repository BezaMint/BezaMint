#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, Address, Env, IntoVal, Map, String,
    Symbol, Val,
};

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum FactoryKey {
    Admin,
    Version,
    NftContract,
    CollectionContract,
    RoyaltyContract,
    CreatorContract,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum FactoryEvent {
    ContractsSet(Address, Address, Address, Address),
    NftMinted(u64, Address),
    CollectionCreated(u64, Address),
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
        env.storage().instance().set(&FactoryKey::Version, &1u32);
    }

    pub fn set_contracts(
        env: Env,
        _admin: Address,
        nft: Address,
        collection: Address,
        royalty: Address,
        creator: Address,
    ) {
        let stored_admin: Address = env.storage().instance().get(&FactoryKey::Admin).unwrap_or_else(|| panic!("Factory: not initialized"));
        stored_admin.require_auth();

        env.storage().instance().set(&FactoryKey::NftContract, &nft);
        env.storage().instance().set(&FactoryKey::CollectionContract, &collection);
        env.storage().instance().set(&FactoryKey::RoyaltyContract, &royalty);
        env.storage().instance().set(&FactoryKey::CreatorContract, &creator);

        emit(&env, FactoryEvent::ContractsSet(nft, collection, royalty, creator));
    }

    /// Cross-contract: mint NFT then configure royalty atomically
    /// Uses Symbol::new() for function names > 9 chars (symbol_short! limit)
    pub fn mint_with_royalty(
        env: Env,
        caller: Address,
        to: Address,
        collection_id: u64,
        metadata_uri: String,
        basis_points: u32,
    ) -> u64 {
        caller.require_auth();

        let nft_addr: Address = env.storage().instance().get(&FactoryKey::NftContract).unwrap_or_else(|| panic!("Factory: NFT contract not set"));
        let royalty_addr: Address = env.storage().instance().get(&FactoryKey::RoyaltyContract).unwrap_or_else(|| panic!("Factory: Royalty contract not set"));

        // Cross-contract call 1: mint the NFT
        let mint_args = soroban_sdk::vec![
            &env,
            to.into_val(&env),
            collection_id.into_val(&env),
            metadata_uri.into_val(&env),
        ];
        let raw_token_id: Val =
            env.invoke_contract(&nft_addr, &Symbol::new(&env, "mint"), mint_args);
        let token_id: u64 = raw_token_id.into_val(&env);

        // Cross-contract call 2: configure royalty on the new NFT
        let empty_recipients: Map<Address, u32> = Map::new(&env);
        let royalty_args = soroban_sdk::vec![
            &env,
            token_id.into_val(&env),
            basis_points.into_val(&env),
            empty_recipients.into_val(&env),
            false.into_val(&env),
        ];
        env.invoke_contract::<()>(
            &royalty_addr,
            &Symbol::new(&env, "configure_royalty"),
            royalty_args,
        );

        emit(&env, FactoryEvent::NftMinted(token_id, caller));

        token_id
    }

    /// Cross-contract: create collection + auto-register creator
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
            .unwrap_or_else(|| panic!("Factory: Collection contract not set"));
        let creator_addr: Address = env
            .storage()
            .instance()
            .get(&FactoryKey::CreatorContract)
            .unwrap();

        // Cross-contract call 1: create the collection
        let col_args = soroban_sdk::vec![
            &env,
            caller.clone().into_val(&env),
            metadata_uri.into_val(&env),
        ];
        let raw_id: Val = env.invoke_contract(
            &collection_addr,
            &Symbol::new(&env, "create_collection"),
            col_args,
        );
        let collection_id: u64 = raw_id.into_val(&env);

        // Cross-contract call 2: check if creator is registered
        let check_args =
            soroban_sdk::vec![&env, caller.clone().into_val(&env)];
        let is_registered: Val = env.invoke_contract(
            &creator_addr,
            &Symbol::new(&env, "is_registered"),
            check_args,
        );
        let registered: bool = is_registered.into_val(&env);

        // Cross-contract call 3: register creator if not already
        if !registered {
            let empty: String = String::from_str(&env, "");
            let reg_args = soroban_sdk::vec![
                &env,
                caller.clone().into_val(&env),
                empty.clone().into_val(&env),
                empty.clone().into_val(&env),
                empty.clone().into_val(&env),
                empty.clone().into_val(&env),
            ];
            env.invoke_contract::<()>(
                &creator_addr,
                &Symbol::new(&env, "register"),
                reg_args,
            );
        }

        emit(
            &env,
            FactoryEvent::CollectionCreated(collection_id, caller),
        );

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
