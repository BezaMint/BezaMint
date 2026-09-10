#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, Address, Env, IntoVal, Map, String, Symbol,
    Val,
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
    NftBurned(u64, Address),
    CollectionCreated(u64, Address),
}

/// State-expiration (TTL) policy. Soroban instance data and contract code are
/// archived once their TTL elapses; the Factory's entire state lives in
/// instance storage (admin plus the four contract pointers), so a dormant
/// contract would silently lose its wiring and every cross-contract call would
/// panic with "contract not set". Every write refreshes instance + code to the
/// network maximum ([`TTL_LEDGERS`] = Stellar's `MAXIMUM_ENTRY_TTL_LEDGERS`,
/// ~1 year at 5s per ledger).
const TTL_LEDGERS: u32 = 6_312_000;
const TTL_THRESHOLD: u32 = TTL_LEDGERS / 2;

fn emit(env: &Env, event: FactoryEvent) {
    env.events().publish((symbol_short!("factory"),), event);
}

#[contract]
pub struct BezaMintFactory;

#[contractimpl]
impl BezaMintFactory {
    pub fn initialize(env: Env, admin: Address) {
        if Self::is_initialized(env.clone()) {
            panic!("Factory: already initialized");
        }
        admin.require_auth();
        env.storage().instance().set(&FactoryKey::Admin, &admin);
        env.storage().instance().set(&FactoryKey::Version, &1u32);
        // Instance data and contract code share one TTL; refresh both up front
        // so a long-dormant contract does not silently lose its admin binding.
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_LEDGERS);
    }

    /// Returns `true` once `initialize` has succeeded.
    pub fn is_initialized(env: Env) -> bool {
        env.storage().instance().has(&FactoryKey::Admin)
    }

    /// Wire the four platform contracts. Admin-only: authorization comes from
    /// the stored admin, not from any caller-supplied address. The previous
    /// signature accepted a leading `_admin: Address` that was ignored in
    /// favour of the stored admin, which misled callers into believing their
    /// own address authorized the call.
    pub fn set_contracts(
        env: Env,
        nft: Address,
        collection: Address,
        royalty: Address,
        creator: Address,
    ) {
        let stored_admin: Address = env
            .storage()
            .instance()
            .get(&FactoryKey::Admin)
            .unwrap_or_else(|| panic!("Factory: not initialized"));
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
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_LEDGERS);

        // Seize the Royalty admin role. `configure_royalty` requires the
        // Royalty admin's auth, and every mint goes through this contract, so
        // the Factory must hold that role for the flagship mint-with-royalty
        // flow to authenticate in production. The deployer (current admin)
        // authorizes this call and the sub-invoke in one transaction; after
        // this, only the Factory can change the Royalty admin again.
        let set_admin_args = soroban_sdk::vec![&env, env.current_contract_address().into_val(&env)];
        env.invoke_contract::<()>(&royalty, &Symbol::new(&env, "set_admin"), set_admin_args);

        emit(
            &env,
            FactoryEvent::ContractsSet(nft, collection, royalty, creator),
        );
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

        let nft_addr: Address = env
            .storage()
            .instance()
            .get(&FactoryKey::NftContract)
            .unwrap_or_else(|| panic!("Factory: NFT contract not set"));
        let collection_addr: Address = env
            .storage()
            .instance()
            .get(&FactoryKey::CollectionContract)
            .unwrap_or_else(|| panic!("Factory: Collection contract not set"));
        let royalty_addr: Address = env
            .storage()
            .instance()
            .get(&FactoryKey::RoyaltyContract)
            .unwrap_or_else(|| panic!("Factory: Royalty contract not set"));

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

        // Cross-contract call 2: link the new NFT to its collection. The
        // Collection contract enforces creator auth (the caller must own the
        // collection) plus its archived/full/duplicate guards, so a mint into a
        // collection the caller does not control fails atomically together with
        // the mint. Before this the Factory never registered membership, so
        // `get_nfts_in_collection` stayed empty and `get_collection_for_nft`
        // always returned 0 for every minted NFT.
        let add_args =
            soroban_sdk::vec![&env, collection_id.into_val(&env), token_id.into_val(&env),];
        env.invoke_contract::<()>(&collection_addr, &Symbol::new(&env, "add_nft"), add_args);

        // Cross-contract call 3: configure royalty on the new NFT, recording
        // `caller` as the creator so they can amend their own terms later.
        let empty_recipients: Map<Address, u32> = Map::new(&env);
        let royalty_args = soroban_sdk::vec![
            &env,
            caller.clone().into_val(&env),
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
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_LEDGERS);

        emit(&env, FactoryEvent::NftMinted(token_id, caller));

        token_id
    }

    /// Atomic burn + collection unlink.
    ///
    /// Burning through the NFT contract directly leaves the token's collection
    /// membership behind: `nft_count` stays inflated and `get_nfts_in_collection`
    /// lists a token that no longer exists. This wrapper burns the NFT and
    /// removes it from its collection in one invocation. The NFT contract
    /// enforces owner auth on `burn` and the Collection contract enforces
    /// creator auth on `remove_nft`, so in the platform's own flow (a creator
    /// burning an NFT they minted into their own collection) both checks pass
    /// with the caller's signatures; a mismatched owner/creator fails
    /// atomically with nothing burned.
    pub fn burn_nft(env: Env, caller: Address, collection_id: u64, token_id: u64) {
        caller.require_auth();

        let nft_addr: Address = env
            .storage()
            .instance()
            .get(&FactoryKey::NftContract)
            .unwrap_or_else(|| panic!("Factory: NFT contract not set"));
        let collection_addr: Address = env
            .storage()
            .instance()
            .get(&FactoryKey::CollectionContract)
            .unwrap_or_else(|| panic!("Factory: Collection contract not set"));

        // Cross-contract call 1: burn the NFT (owner auth enforced there).
        let burn_args = soroban_sdk::vec![&env, token_id.into_val(&env)];
        env.invoke_contract::<()>(&nft_addr, &Symbol::new(&env, "burn"), burn_args);

        // Cross-contract call 2: drop the collection membership (creator auth
        // enforced there). Idempotent, so re-burning is a no-op.
        let remove_args =
            soroban_sdk::vec![&env, collection_id.into_val(&env), token_id.into_val(&env),];
        env.invoke_contract::<()>(
            &collection_addr,
            &Symbol::new(&env, "remove_nft"),
            remove_args,
        );
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_LEDGERS);

        emit(&env, FactoryEvent::NftBurned(token_id, caller));
    }

    /// Cross-contract: create collection + auto-register creator
    pub fn create_collection_for_creator(env: Env, caller: Address, metadata_uri: String) -> u64 {
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
            .unwrap_or_else(|| panic!("Factory: Creator contract not set"));

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
        let check_args = soroban_sdk::vec![&env, caller.clone().into_val(&env)];
        let is_registered: Val = env.invoke_contract(
            &creator_addr,
            &Symbol::new(&env, "is_registered"),
            check_args,
        );
        let registered: bool = is_registered.into_val(&env);

        // Cross-contract call 3: register creator if not already
        if !registered {
            let empty: String = String::from_str(&env, "");
            // register() requires a non-empty display name, so pass a default.
            let default_name: String = String::from_str(&env, "Creator");
            let reg_args = soroban_sdk::vec![
                &env,
                caller.clone().into_val(&env),
                default_name.into_val(&env),
                empty.clone().into_val(&env),
                empty.clone().into_val(&env),
                empty.clone().into_val(&env),
            ];
            env.invoke_contract::<()>(&creator_addr, &Symbol::new(&env, "register"), reg_args);
        }
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_LEDGERS);

        emit(&env, FactoryEvent::CollectionCreated(collection_id, caller));

        collection_id
    }

    // ── Queries ─────────────────────────────────────────────

    pub fn get_nft_contract(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&FactoryKey::NftContract)
            .unwrap()
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

#[cfg(test)]
mod test;
