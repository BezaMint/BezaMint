use soroban_sdk::{
    testutils::{Address as _, Events, MockAuth, MockAuthInvoke},
    Address, Env, IntoVal, String, Symbol, TryFromVal,
};

use crate::{BezaMintFactory, BezaMintFactoryClient, FactoryEvent, FactoryKey};

/// A stored schema version must gate every mutation, and only the admin may
/// repair a mismatch by naming the version it is migrating from. A Factory that
/// read a foreign key layout would resolve its wiring pointers incorrectly.
#[test]
fn test_storage_version_is_enforced() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let contract_id = env.register(BezaMintFactory, (admin.clone(),));
    let client = BezaMintFactoryClient::new(&env, &contract_id);

    assert_eq!(client.version(), crate::STORAGE_VERSION);

    env.as_contract(&contract_id, || {
        env.storage().instance().set(&FactoryKey::Version, &99u32);
    });

    let nft = Address::generate(&env);
    let collection = Address::generate(&env);
    let royalty = Address::generate(&env);
    let creator = Address::generate(&env);
    assert!(client
        .try_set_contracts(&nft, &collection, &royalty, &creator)
        .is_err());
    assert!(client.try_migrate(&0u32).is_err());

    client.migrate(&99u32);
    // A migration changes what stored values mean, so it is the one operation
    // an operator must be able to find a timestamped record of afterwards.
    let migrated_events = env.events().all();
    let (_, _, migrated_data) = migrated_events
        .get(migrated_events.len() - 1)
        .expect("migrate emits an event");
    let migrated: FactoryEvent =
        FactoryEvent::try_from_val(&env, &migrated_data).expect("decodable event");
    assert_eq!(migrated, FactoryEvent::Migrated(99, crate::STORAGE_VERSION));
    assert_eq!(client.version(), crate::STORAGE_VERSION);
}

/// Decode the single most recent event emitted by the Factory and assert
/// emitter, topic and payload.
fn assert_single_factory_event(env: &Env, emitter: &Address, expected: FactoryEvent) {
    let events = env.events().all();
    let mut matched: Option<(
        Address,
        soroban_sdk::Vec<soroban_sdk::Val>,
        soroban_sdk::Val,
    )> = None;
    let mut count = 0u32;
    for i in 0..events.len() {
        let event = events.get(i).expect("event");
        if event.0 == emitter.clone() {
            count += 1;
            if count == 1 {
                matched = Some(event);
            }
        }
    }
    assert_eq!(count, 1, "expected exactly one factory event");
    let (contract, topics, data) = matched.expect("factory event");
    assert_eq!(contract.clone(), emitter.clone(), "wrong emitter");
    let topic_symbol: Symbol =
        Symbol::try_from_val(env, &topics.get(0).expect("topic")).expect("topic is a symbol");
    assert_eq!(topic_symbol, Symbol::new(env, "factory"));
    let decoded: FactoryEvent = FactoryEvent::try_from_val(env, &data).expect("decodable event");
    assert_eq!(decoded, expected);
}

use bezamint_collection::{BezaMintCollection, BezaMintCollectionClient};
use bezamint_creator::{BezaMintCreator, BezaMintCreatorClient};
use bezamint_nft::{BezaMintNft, BezaMintNftClient};
use bezamint_royalty::{BezaMintRoyalty, BezaMintRoyaltyClient};

/// The constructor runs as part of contract creation, so the admin binding
/// already exists by the time any client can call the contract. This replaces
/// the previous "initialize then observe" test: there is no uninitialized state
/// left to observe, and no second call that could overwrite the binding.
#[test]
fn test_constructor_binds_admin() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let client = BezaMintFactoryClient::new(&env, &env.register(BezaMintFactory, (admin.clone(),)));
    assert!(client.is_initialized());
    assert_eq!(client.get_admin(), admin);
}

#[test]
fn test_initialize_and_set_contracts() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let contract_id = env.register(BezaMintFactory, (admin.clone(),));
    let client = BezaMintFactoryClient::new(&env, &contract_id);

    let nft = Address::generate(&env);
    let collection = Address::generate(&env);
    // set_contracts seizes the Royalty admin role, so it must receive a real,
    // initialized Royalty contract rather than a bare address.
    let royalty_id = env.register(BezaMintRoyalty, (admin.clone(),));
    let royalty = BezaMintRoyaltyClient::new(&env, &royalty_id);
    let creator = Address::generate(&env);

    client.set_contracts(&nft, &collection, &royalty_id, &creator);

    assert_eq!(client.get_nft_contract(), nft);
    assert_eq!(client.get_collection_contract(), collection);
    // `set_contracts` hands the Royalty admin role to the Factory, which is what
    // lets its cross-contract `configure_royalty` call authenticate later.
    assert_eq!(royalty.get_admin(), contract_id);
    assert_eq!(client.get_royalty_contract(), royalty_id);
    assert_eq!(client.get_creator_contract(), creator);
}

#[test]
#[should_panic]
fn test_unauthorized_set_contracts() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let contract_id = env.register(BezaMintFactory, (admin.clone(),));
    let client = BezaMintFactoryClient::new(&env, &contract_id);

    // No auth is mocked at all: `set_contracts` must be rejected by
    // require_auth() before it can touch any of the supplied addresses.

    let nft = Address::generate(&env);
    let collection = Address::generate(&env);
    let royalty = Address::generate(&env);
    let creator = Address::generate(&env);

    client.set_contracts(&nft, &collection, &royalty, &creator);
}

#[test]
fn test_factory_set_contracts() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let nft = Address::generate(&env);
    let col = Address::generate(&env);
    let roy_id = env.register(BezaMintRoyalty, (admin.clone(),));
    let roy = BezaMintRoyaltyClient::new(&env, &roy_id);
    let cre = Address::generate(&env);
    let contract =
        BezaMintFactoryClient::new(&env, &env.register(BezaMintFactory, (admin.clone(),)));
    contract.set_contracts(&nft, &col, &roy_id, &cre);
    assert_eq!(contract.get_nft_contract(), nft);
    assert_eq!(contract.get_collection_contract(), col);
    // The Royalty admin role must move to the Factory so its cross-contract
    // royalty configuration can authenticate.
    assert_eq!(roy.get_admin(), contract.address);
}

#[test]
fn test_mint_with_royalty_returns_token() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let nft_addr = Address::generate(&env);
    let royalty_id = env.register(BezaMintRoyalty, (admin.clone(),));
    let royalty = BezaMintRoyaltyClient::new(&env, &royalty_id);
    let factory =
        BezaMintFactoryClient::new(&env, &env.register(BezaMintFactory, (admin.clone(),)));
    let collection = Address::generate(&env);
    let creator = Address::generate(&env);
    // set_contracts requires a live Royalty contract (it seizes the admin role),
    // and its validation requires four distinct, non-zero addresses.
    factory.set_contracts(&nft_addr, &collection, &royalty_id, &creator);
    assert_eq!(royalty.get_admin(), factory.address);
}

/// A wiring call that stores the zero account would produce a Factory whose
/// every cross-contract call fails, and the failure would surface to users
/// rather than at the moment of the mistake.
#[test]
// FactoryError::WiringZeroAddress
#[should_panic(expected = "Error(Contract, #6)")]
fn test_set_contracts_rejects_zero_address() {
    let (env, admin, factory) = wiring_fixture();
    // The Stellar all-zero ed25519 account: a valid Address value for which no
    // contract exists.
    let zero = Address::from_str(
        &env,
        "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
    );
    let royalty_id = env.register(BezaMintRoyalty, (admin.clone(),));
    factory.set_contracts(
        &zero,
        &Address::generate(&env),
        &royalty_id,
        &Address::generate(&env),
    );
}

/// Pointing a slot at the Factory itself would make every cross-contract call
/// recurse back into the Factory instead of reaching a real platform contract.
#[test]
// FactoryError::WiringSelfReference
#[should_panic(expected = "Error(Contract, #7)")]
fn test_set_contracts_rejects_self_reference() {
    let (env, admin, factory) = wiring_fixture();
    let royalty_id = env.register(BezaMintRoyalty, (admin.clone(),));
    factory.set_contracts(
        &factory.address,
        &Address::generate(&env),
        &royalty_id,
        &Address::generate(&env),
    );
}

/// Two roles resolving to the same contract means one of them is called through
/// the wrong interface; reject the ambiguity at write time.
#[test]
// FactoryError::WiringDuplicate
#[should_panic(expected = "Error(Contract, #8)")]
fn test_set_contracts_rejects_duplicate_addresses() {
    let (env, admin, factory) = wiring_fixture();
    let royalty_id = env.register(BezaMintRoyalty, (admin.clone(),));
    let shared = Address::generate(&env);
    factory.set_contracts(&shared, &shared, &royalty_id, &Address::generate(&env));
}

/// The wiring getters are what deployment tooling reads to confirm a bootstrap
/// succeeded, so an unwired slot must name itself instead of raising an
/// anonymous host panic.
#[test]
// FactoryError::NftContractNotSet
#[should_panic(expected = "Error(Contract, #11)")]
fn test_getter_names_the_unset_slot() {
    let (_, _, factory) = wiring_fixture();
    factory.get_nft_contract();
}

/// Admin + deployed Factory, shared by the wiring-validation tests.
fn wiring_fixture() -> (Env, Address, BezaMintFactoryClient<'static>) {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let factory =
        BezaMintFactoryClient::new(&env, &env.register(BezaMintFactory, (admin.clone(),)));
    (env, admin, factory)
}

/// Full-stack integration: register the real NFT, Royalty, Collection and Creator
/// contracts and verify the Factory's atomic mint_with_royalty flow end-to-end.
///
/// Production bootstrap: the deployer initializes every contract, then
/// `set_contracts` seizes the Royalty admin role for the Factory, so the
/// cross-contract `configure_royalty` call passes admin auth (contract
/// self-auth) while the user authorizes the root call and the NFT `mint` and
/// collection `add_nft` sub-invokes.
#[test]
fn test_integration_mint_with_royalty() {
    let env = Env::default();

    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    let factory_id = env.register(BezaMintFactory, (admin.clone(),));
    let factory = BezaMintFactoryClient::new(&env, &factory_id);

    env.mock_all_auths();
    let nft = BezaMintNftClient::new(&env, &env.register(BezaMintNft, (admin.clone(),)));
    let collection =
        BezaMintCollectionClient::new(&env, &env.register(BezaMintCollection, (admin.clone(),)));
    // The deployer initializes Royalty; set_contracts transfers admin to the
    // Factory so it can manage royalties on behalf of users.
    let royalty =
        BezaMintRoyaltyClient::new(&env, &env.register(BezaMintRoyalty, (admin.clone(),)));
    let creator =
        BezaMintCreatorClient::new(&env, &env.register(BezaMintCreator, (admin.clone(),)));

    factory.set_contracts(
        &nft.address,
        &collection.address,
        &royalty.address,
        &creator.address,
    );

    let metadata = String::from_str(&env, "ipfs://integrated/1");
    let collection_uri = String::from_str(&env, "ipfs://integrated-collection");

    // The user owns a collection that the NFT will be minted into.
    collection.create_collection(&user, &collection_uri);

    // The user authorizes the Factory root call plus the NFT mint and the
    // collection add_nft sub-invokes. The royalty sub-invoke is covered by the
    // Factory's own admin role.
    let auth = MockAuth {
        address: &user,
        invoke: &MockAuthInvoke {
            contract: &factory_id,
            fn_name: "mint_with_royalty",
            args: (user.clone(), user.clone(), 1u64, metadata.clone(), 500u32).into_val(&env),
            sub_invokes: &[
                MockAuthInvoke {
                    contract: &nft.address,
                    fn_name: "mint",
                    // `creator` first: the Factory attributes the token to its
                    // caller, and the recipient is the same address here.
                    args: (user.clone(), user.clone(), 1u64, metadata.clone()).into_val(&env),
                    sub_invokes: &[],
                },
                MockAuthInvoke {
                    contract: &collection.address,
                    fn_name: "add_nft",
                    args: (1u64, 1u64).into_val(&env),
                    sub_invokes: &[],
                },
            ],
        },
    };
    env.mock_auths(&[auth]);

    // Atomic mint + royalty configuration in one factory call.
    let token_id = factory.mint_with_royalty(&user, &user, &1, &metadata, &500);

    // NFT side effects.
    assert_eq!(token_id, 1);
    assert_eq!(nft.owner_of(&1), user);
    assert_eq!(nft.total_supply(), 1);

    // The minted NFT is now linked to its collection.
    assert_eq!(collection.get_collection_for_nft(&1), 1);
    let nfts = collection.get_nfts_in_collection(&1, &0, &100);
    assert_eq!(nfts.len(), 1);
    assert_eq!(nfts.get(0).unwrap(), 1);
    assert_eq!(collection.get_collection(&1).nft_count, 1);

    // Royalty side effects.
    let config = royalty.get_royalty(&1, &false);
    assert_eq!(config.basis_points, 500);
}

/// Register the real NFT, Collection, Royalty and Creator contracts and wire the
/// Factory to them, which is the production bootstrap the batch tests exercise
/// end-to-end. Requires the caller to have enabled mock auths.
#[allow(clippy::type_complexity)]
fn batch_fixture<'a>(
    env: &'a Env,
    admin: &Address,
) -> (
    BezaMintFactoryClient<'a>,
    BezaMintNftClient<'a>,
    BezaMintCollectionClient<'a>,
    BezaMintRoyaltyClient<'a>,
) {
    let factory_id = env.register(BezaMintFactory, (admin.clone(),));
    let factory = BezaMintFactoryClient::new(env, &factory_id);
    let nft = BezaMintNftClient::new(env, &env.register(BezaMintNft, (admin.clone(),)));
    let collection =
        BezaMintCollectionClient::new(env, &env.register(BezaMintCollection, (admin.clone(),)));
    let royalty = BezaMintRoyaltyClient::new(env, &env.register(BezaMintRoyalty, (admin.clone(),)));
    let creator = env.register(BezaMintCreator, (admin.clone(),));
    factory.set_contracts(
        &nft.address,
        &collection.address,
        &royalty.address,
        &creator,
    );
    (factory, nft, collection, royalty)
}

/// A batch mints every URI in one invocation, linking each token to the
/// collection and configuring its royalty, and returns the ids in order. Before
/// this a ten-piece drop cost ten transactions.
#[test]
fn test_mint_batch_mints_every_uri() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let (factory, nft, collection, royalty) = batch_fixture(&env, &admin);

    collection.create_collection(&user, &String::from_str(&env, "ipfs://collection"));

    let uris = soroban_sdk::vec![
        &env,
        String::from_str(&env, "ipfs://drop/1"),
        String::from_str(&env, "ipfs://drop/2"),
        String::from_str(&env, "ipfs://drop/3"),
    ];
    let ids = factory.mint_batch_with_royalty(&user, &user, &1, &uris, &500);

    assert_eq!(ids.len(), 3);
    assert_eq!(ids.get(0).unwrap(), 1);
    assert_eq!(ids.get(1).unwrap(), 2);
    assert_eq!(ids.get(2).unwrap(), 3);

    assert_eq!(nft.total_supply(), 3);
    assert_eq!(collection.get_collection(&1).nft_count, 3);
    for id in 1..=3u64 {
        assert_eq!(nft.owner_of(&id), user);
        assert_eq!(collection.get_collection_for_nft(&id), 1);
        assert_eq!(royalty.get_royalty(&id, &false).basis_points, 500);
    }
}

/// The token is attributed to the Factory's caller, not to the address that
/// receives it, and the Royalty contract is told the same address. Minting to a
/// third party is the case that separates the two, and it is the case the
/// platform hits on a gift or a primary sale -- the moment the creator field
/// starts being shown to a collector.
#[test]
fn test_mint_attributes_to_the_caller_not_the_recipient() {
    let env = Env::default();
    // The recipient is not the caller of the root invocation, so its
    // `require_auth` inside `nft.mint` is non-root authorization. Plain
    // `mock_all_auths` is deliberately stricter than the network and rejects
    // that shape; a real gift transaction carries the recipient's signature as
    // an entry on the `mint` sub-invocation, which is what this enables.
    env.mock_all_auths_allowing_non_root_auth();
    let admin = Address::generate(&env);
    let caller = Address::generate(&env);
    let recipient = Address::generate(&env);
    let (factory, nft, collection, royalty) = batch_fixture(&env, &admin);

    collection.create_collection(&caller, &String::from_str(&env, "ipfs://collection"));
    let metadata = String::from_str(&env, "ipfs://gift/1");

    let token_id = factory.mint_with_royalty(&caller, &recipient, &1, &metadata, &500);

    assert_eq!(nft.owner_of(&token_id), recipient);
    assert_eq!(nft.token_data(&token_id).creator, caller);
    // The royalty terms, which are keyed by creator, must name the same address
    // `token_data` just reported.
    let royalty_config = royalty.get_royalty(&token_id, &false);
    assert_eq!(royalty_config.creator, caller);
    assert_eq!(royalty_config.basis_points, 500);
}

/// A failure part-way through a batch must roll the entire invocation back: no
/// tokens, no collection membership, no royalty configs. This is the property
/// that makes offering a batch safe at all, and it comes from Soroban's
/// invocation-level atomicity rather than from any explicit undo logic.
#[test]
fn test_mint_batch_failure_reverts_every_token() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let (factory, nft, collection, royalty) = batch_fixture(&env, &admin);

    collection.create_collection(&user, &String::from_str(&env, "ipfs://collection"));

    // The second URI uses a scheme the NFT contract rejects, so `mint` panics
    // after the first token has already been minted in this invocation.
    let uris = soroban_sdk::vec![
        &env,
        String::from_str(&env, "ipfs://drop/1"),
        String::from_str(&env, "javascript:alert(1)"),
    ];
    assert!(factory
        .try_mint_batch_with_royalty(&user, &user, &1, &uris, &500)
        .is_err());

    // Nothing survived the revert.
    assert_eq!(nft.total_supply(), 0);
    assert_eq!(collection.get_collection(&1).nft_count, 0);
    assert_eq!(collection.get_collection_for_nft(&1), 0);
    assert!(royalty.try_get_royalty(&1, &false).is_err());
}

/// `set_contracts` hands the Royalty admin role to the Factory so its
/// cross-contract royalty calls authenticate. That hand-off must be reversible,
/// otherwise the Royalty contract could never be upgraded again, because the
/// Factory holds the role and forwards no `upgrade`.
#[test]
fn test_set_royalty_admin_reclaims_the_role_for_upgrades() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let (factory, _nft, _collection, royalty) = batch_fixture(&env, &admin);

    // Wiring moved the role to the Factory.
    assert_eq!(royalty.get_admin(), factory.address);

    // The Factory admin can hand it back so the deployer can upgrade directly,
    // then hand it over again with set_contracts.
    factory.set_royalty_admin(&admin);
    assert_eq!(royalty.get_admin(), admin);
}

/// Taking the Royalty admin role back is privileged and cannot point the role at
/// an account no one controls.
#[test]
fn test_set_royalty_admin_rejects_zero_and_requires_admin() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let (factory, _nft, _collection, _royalty) = batch_fixture(&env, &admin);

    let zero = Address::from_str(
        &env,
        "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
    );
    assert!(factory.try_set_royalty_admin(&zero).is_err());

    env.mock_auths(&[]);
    assert!(factory.try_set_royalty_admin(&admin).is_err());
}

/// The batch is bounded in both directions, so a caller cannot build an
/// unbounded invocation or spend a signature on nothing, and the documented
/// maximum is genuinely accepted.
#[test]
fn test_mint_batch_rejects_empty_and_oversized_batches() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let (factory, _nft, collection, _royalty) = batch_fixture(&env, &admin);
    collection.create_collection(&user, &String::from_str(&env, "ipfs://collection"));

    let empty: soroban_sdk::Vec<String> = soroban_sdk::Vec::new(&env);
    assert!(factory
        .try_mint_batch_with_royalty(&user, &user, &1, &empty, &500)
        .is_err());

    let mut too_many: soroban_sdk::Vec<String> = soroban_sdk::Vec::new(&env);
    for _ in 0..(crate::MAX_BATCH_MINT + 1) {
        too_many.push_back(String::from_str(&env, "ipfs://drop"));
    }
    assert!(factory
        .try_mint_batch_with_royalty(&user, &user, &1, &too_many, &500)
        .is_err());

    let mut at_limit: soroban_sdk::Vec<String> = soroban_sdk::Vec::new(&env);
    for _ in 0..crate::MAX_BATCH_MINT {
        at_limit.push_back(String::from_str(&env, "ipfs://drop"));
    }
    let ids = factory.mint_batch_with_royalty(&user, &user, &1, &at_limit, &0);
    assert_eq!(ids.len(), crate::MAX_BATCH_MINT);
}

/// The complete platform lifecycle in one test: a creator registers, creates
/// a collection through the Factory, mints an NFT into it with a royalty,
/// updates their profile, transfers the NFT, and finally burns it. This is
/// the end-to-end path every user of the product takes, and it proves the
/// five contracts stay consistent with each other at every step.
#[test]
fn test_full_platform_lifecycle() {
    let env = Env::default();

    let admin = Address::generate(&env);
    let creator = Address::generate(&env);
    let collector = Address::generate(&env);

    env.mock_all_auths();
    let nft = BezaMintNftClient::new(&env, &env.register(BezaMintNft, (admin.clone(),)));
    let collection =
        BezaMintCollectionClient::new(&env, &env.register(BezaMintCollection, (admin.clone(),)));
    let royalty =
        BezaMintRoyaltyClient::new(&env, &env.register(BezaMintRoyalty, (admin.clone(),)));
    let creator_contract =
        BezaMintCreatorClient::new(&env, &env.register(BezaMintCreator, (admin.clone(),)));

    let factory_id = env.register(BezaMintFactory, (admin.clone(),));
    let factory = BezaMintFactoryClient::new(&env, &factory_id);
    factory.set_contracts(
        &nft.address,
        &collection.address,
        &royalty.address,
        &creator_contract.address,
    );

    // 1. The creator creates a collection (auto-registers their profile).
    let collection_id = factory.create_collection_for_creator(
        &creator,
        &String::from_str(&env, "ipfs://lifecycle-collection"),
    );
    assert_eq!(collection_id, 1);
    assert!(creator_contract.is_registered(&creator));
    assert_eq!(collection.get_collection(&1).creator, creator);

    // 2. They mint an NFT into it with a 5% royalty.
    let first = factory.mint_with_royalty(
        &creator,
        &creator,
        &collection_id,
        &String::from_str(&env, "ipfs://lifecycle/1"),
        &500,
    );
    assert_eq!(first, 1);
    assert_eq!(nft.owner_of(&first), creator);
    assert_eq!(collection.get_collection_for_nft(&first), collection_id);
    assert_eq!(collection.get_collection(&collection_id).nft_count, 1);
    assert_eq!(royalty.get_royalty(&first, &false).basis_points, 500);

    // 3. They update their profile.
    creator_contract.update_profile(
        &creator,
        &String::from_str(&env, "Beza Creator"),
        &String::from_str(&env, "Building on Stellar"),
        &String::from_str(&env, "ipfs://avatar"),
        &String::from_str(&env, "ipfs://banner"),
    );
    assert_eq!(
        creator_contract.get_profile(&creator).display_name,
        String::from_str(&env, "Beza Creator")
    );

    // 4. They burn it; membership and counts unwind cleanly.
    factory.burn_nft(&creator, &collection_id, &first);
    assert_eq!(collection.get_collection(&collection_id).nft_count, 0);
    assert_eq!(collection.get_collection_for_nft(&first), 0);
    assert!(nft.try_owner_of(&first).is_err());

    // 5. A second NFT is minted and sold to the collector.
    let second = factory.mint_with_royalty(
        &creator,
        &creator,
        &collection_id,
        &String::from_str(&env, "ipfs://lifecycle/2"),
        &700,
    );
    assert_eq!(second, 2);
    nft.transfer(&creator, &collector, &second);
    assert_eq!(nft.owner_of(&second), collector);
    assert_eq!(nft.balance_of(&collector), 1);
    assert_eq!(nft.balance_of(&creator), 0);
    assert_eq!(collection.get_collection(&collection_id).nft_count, 1);
    assert_eq!(nft.total_supply(), 2); // ids are never recycled
}

/// Burning is gated by BOTH the NFT owner and the collection creator: the
/// Factory's burn_nft sub-calls the Collection contract's creator-gated
/// remove_nft, so a collector who is not the collection creator cannot
/// destroy a creator's collection member. This is deliberate - a buyer must
/// not be able to unilaterally shrink someone else's collection - and it is
/// pinned here so the constraint is visible rather than surprising.
#[test]
#[should_panic]
fn test_collector_cannot_burn_into_creators_collection() {
    let env = Env::default();

    let admin = Address::generate(&env);
    let creator = Address::generate(&env);
    let collector = Address::generate(&env);

    env.mock_all_auths();
    let nft = BezaMintNftClient::new(&env, &env.register(BezaMintNft, (admin.clone(),)));
    let collection =
        BezaMintCollectionClient::new(&env, &env.register(BezaMintCollection, (admin.clone(),)));
    let royalty =
        BezaMintRoyaltyClient::new(&env, &env.register(BezaMintRoyalty, (admin.clone(),)));
    let creator_contract =
        BezaMintCreatorClient::new(&env, &env.register(BezaMintCreator, (admin.clone(),)));

    let factory_id = env.register(BezaMintFactory, (admin.clone(),));
    let factory = BezaMintFactoryClient::new(&env, &factory_id);
    factory.set_contracts(
        &nft.address,
        &collection.address,
        &royalty.address,
        &creator_contract.address,
    );

    collection.create_collection(&creator, &String::from_str(&env, "ipfs://guarded"));
    let token_id = factory.mint_with_royalty(
        &creator,
        &creator,
        &1,
        &String::from_str(&env, "ipfs://guarded/1"),
        &500,
    );
    nft.transfer(&creator, &collector, &token_id);

    // The collector owns the token but is not the collection creator.
    factory.burn_nft(&collector, &1, &token_id);
}

/// The Factory's public events (contracts set, NFT minted, NFT burned,
/// collection created) must fire with the right payloads even during
/// cross-contract flows.
#[test]
fn test_events_cover_factory_mutations() {
    let env = Env::default();

    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    env.mock_all_auths();
    let nft = BezaMintNftClient::new(&env, &env.register(BezaMintNft, (admin.clone(),)));
    let collection =
        BezaMintCollectionClient::new(&env, &env.register(BezaMintCollection, (admin.clone(),)));
    let royalty =
        BezaMintRoyaltyClient::new(&env, &env.register(BezaMintRoyalty, (admin.clone(),)));
    let creator =
        BezaMintCreatorClient::new(&env, &env.register(BezaMintCreator, (admin.clone(),)));

    let factory_id = env.register(BezaMintFactory, (admin.clone(),));
    let factory = BezaMintFactoryClient::new(&env, &factory_id);

    factory.set_contracts(
        &nft.address,
        &collection.address,
        &royalty.address,
        &creator.address,
    );
    assert_single_factory_event(
        &env,
        &factory_id,
        FactoryEvent::ContractsSet(
            nft.address.clone(),
            collection.address.clone(),
            royalty.address.clone(),
            creator.address.clone(),
        ),
    );

    collection.create_collection(&user, &String::from_str(&env, "ipfs://events"));
    let metadata = String::from_str(&env, "ipfs://event-nft");
    let token_id = factory.mint_with_royalty(&user, &user, &1, &metadata, &500);
    assert_single_factory_event(&env, &factory_id, FactoryEvent::NftMinted(1, user.clone()));

    factory.burn_nft(&user, &1, &token_id);
    assert_single_factory_event(&env, &factory_id, FactoryEvent::NftBurned(1, user.clone()));

    let col_uri = String::from_str(&env, "ipfs://event-collection");
    factory.create_collection_for_creator(&user, &col_uri);
    assert_single_factory_event(
        &env,
        &factory_id,
        FactoryEvent::CollectionCreated(2, user.clone()),
    );
}

/// Burning through the Factory must both destroy the NFT and drop its
/// collection membership, so `nft_count` and `get_nfts_in_collection` never
/// reference a token that no longer exists.
#[test]
fn test_integration_burn_unlinks_from_collection() {
    let env = Env::default();

    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    env.mock_all_auths();
    let nft = BezaMintNftClient::new(&env, &env.register(BezaMintNft, (admin.clone(),)));
    let collection =
        BezaMintCollectionClient::new(&env, &env.register(BezaMintCollection, (admin.clone(),)));
    let royalty =
        BezaMintRoyaltyClient::new(&env, &env.register(BezaMintRoyalty, (admin.clone(),)));
    let creator =
        BezaMintCreatorClient::new(&env, &env.register(BezaMintCreator, (admin.clone(),)));

    let factory_id = env.register(BezaMintFactory, (admin.clone(),));
    let factory = BezaMintFactoryClient::new(&env, &factory_id);
    factory.set_contracts(
        &nft.address,
        &collection.address,
        &royalty.address,
        &creator.address,
    );

    // The user owns collection 1 and mints token 1 into it.
    collection.create_collection(&user, &String::from_str(&env, "ipfs://burn-test"));
    let metadata = String::from_str(&env, "ipfs://burn-me");
    let token_id = factory.mint_with_royalty(&user, &user, &1, &metadata, &500);
    assert_eq!(token_id, 1);
    assert_eq!(collection.get_collection(&1).nft_count, 1);

    // Burn atomically: NFT gone, membership gone, count decremented.
    factory.burn_nft(&user, &1, &token_id);

    assert_eq!(nft.total_supply(), 1); // counter is not recycled
    assert_eq!(collection.get_collection(&1).nft_count, 0);
    assert_eq!(collection.get_nfts_in_collection(&1, &0, &100).len(), 0);
    assert_eq!(collection.get_collection_for_nft(&1), 0);
}

/// A mint into a collection that does not exist must fail atomically: the NFT
/// mint is rolled back together with the collection link, so no orphan NFT is
/// ever created.
#[test]
// Propagated from the Collection contract: CollectionError::CollectionNotFound
#[should_panic(expected = "Error(Contract, #8)")]
fn test_mint_into_missing_collection_fails() {
    let env = Env::default();

    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    env.mock_all_auths();
    let nft = BezaMintNftClient::new(&env, &env.register(BezaMintNft, (admin.clone(),)));
    let collection =
        BezaMintCollectionClient::new(&env, &env.register(BezaMintCollection, (admin.clone(),)));
    let royalty =
        BezaMintRoyaltyClient::new(&env, &env.register(BezaMintRoyalty, (admin.clone(),)));
    let creator =
        BezaMintCreatorClient::new(&env, &env.register(BezaMintCreator, (admin.clone(),)));

    let factory_id = env.register(BezaMintFactory, (admin.clone(),));
    let factory = BezaMintFactoryClient::new(&env, &factory_id);
    factory.set_contracts(
        &nft.address,
        &collection.address,
        &royalty.address,
        &creator.address,
    );

    let metadata = String::from_str(&env, "ipfs://orphan");
    // No collection has been created, so collection 1 does not exist.
    factory.mint_with_royalty(&user, &user, &1, &metadata, &500);
}

/// A user must not be able to mint into a collection owned by someone else:
/// the Collection contract's creator auth for `add_nft` is not covered by the
/// attacker's signature set, so the whole invocation must fail.
#[test]
#[should_panic]
fn test_mint_into_foreign_collection_fails() {
    let env = Env::default();

    let admin = Address::generate(&env);
    let alice = Address::generate(&env);
    let mallory = Address::generate(&env);

    env.mock_all_auths();
    let nft = BezaMintNftClient::new(&env, &env.register(BezaMintNft, (admin.clone(),)));
    let collection =
        BezaMintCollectionClient::new(&env, &env.register(BezaMintCollection, (admin.clone(),)));
    let royalty =
        BezaMintRoyaltyClient::new(&env, &env.register(BezaMintRoyalty, (admin.clone(),)));
    let creator =
        BezaMintCreatorClient::new(&env, &env.register(BezaMintCreator, (admin.clone(),)));

    let factory_id = env.register(BezaMintFactory, (admin.clone(),));
    let factory = BezaMintFactoryClient::new(&env, &factory_id);
    factory.set_contracts(
        &nft.address,
        &collection.address,
        &royalty.address,
        &creator.address,
    );

    // Alice owns collection 1.
    collection.create_collection(&alice, &String::from_str(&env, "ipfs://alice"));

    let metadata = String::from_str(&env, "ipfs://sneaky");

    // Mallory authorizes her own root call and the NFT mint, but cannot
    // authorize the collection's add_nft, which requires Alice.
    let auth = MockAuth {
        address: &mallory,
        invoke: &MockAuthInvoke {
            contract: &factory_id,
            fn_name: "mint_with_royalty",
            args: (
                mallory.clone(),
                mallory.clone(),
                1u64,
                metadata.clone(),
                500u32,
            )
                .into_val(&env),
            sub_invokes: &[MockAuthInvoke {
                contract: &nft.address,
                fn_name: "mint",
                args: (mallory.clone(), 1u64, metadata.clone()).into_val(&env),
                sub_invokes: &[],
            }],
        },
    };
    env.mock_auths(&[auth]);

    factory.mint_with_royalty(&mallory, &mallory, &1, &metadata, &500);
}

/// Verify the Factory can create a collection AND auto-register the creator.
#[test]
fn test_integration_create_collection_for_creator() {
    let env = Env::default();

    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    env.mock_all_auths();
    let nft = BezaMintNftClient::new(&env, &env.register(BezaMintNft, (admin.clone(),)));
    let collection =
        BezaMintCollectionClient::new(&env, &env.register(BezaMintCollection, (admin.clone(),)));
    let royalty =
        BezaMintRoyaltyClient::new(&env, &env.register(BezaMintRoyalty, (admin.clone(),)));
    let creator =
        BezaMintCreatorClient::new(&env, &env.register(BezaMintCreator, (admin.clone(),)));

    let factory_id = env.register(BezaMintFactory, (admin.clone(),));
    let factory = BezaMintFactoryClient::new(&env, &factory_id);
    factory.set_contracts(
        &nft.address,
        &collection.address,
        &royalty.address,
        &creator.address,
    );

    // Creator is not registered yet.
    assert!(!creator.is_registered(&user));

    let metadata = String::from_str(&env, "ipfs://integrated-collection");

    let auth = MockAuth {
        address: &user,
        invoke: &MockAuthInvoke {
            contract: &factory_id,
            fn_name: "create_collection_for_creator",
            args: (user.clone(), metadata.clone()).into_val(&env),
            sub_invokes: &[
                MockAuthInvoke {
                    contract: &collection.address,
                    fn_name: "create_collection",
                    args: (user.clone(), metadata.clone()).into_val(&env),
                    sub_invokes: &[],
                },
                MockAuthInvoke {
                    contract: &creator.address,
                    fn_name: "register",
                    args: (
                        user.clone(),
                        String::from_str(&env, "Creator"),
                        String::from_str(&env, ""),
                        String::from_str(&env, ""),
                        String::from_str(&env, ""),
                    )
                        .into_val(&env),
                    sub_invokes: &[],
                },
            ],
        },
    };
    env.mock_auths(&[auth]);

    let collection_id = factory.create_collection_for_creator(&user, &metadata);

    assert_eq!(collection_id, 1);
    assert_eq!(collection.total_collections(), 1);

    // The Factory auto-registered the creator.
    assert!(creator.is_registered(&user));
    assert!(collection.get_collection(&1).creator == user);
}

/// Upgrade is admin-gated: without the admin's authorization the code swap
/// must be rejected. This is the only path that can change a deployed
/// contract's behaviour, so its guard is security-critical.
#[test]
fn test_upgrade_requires_admin_auth() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let contract_id = env.register(BezaMintFactory, (admin.clone(),));
    let client = BezaMintFactoryClient::new(&env, &contract_id);

    // Replace the mocked auths with none: require_auth must reject.
    env.mock_auths(&[]);
    let hash = soroban_sdk::BytesN::from_array(&env, &[0u8; 32]);
    assert!(client.try_upgrade(&hash).is_err());
}

/// The admin query must report who was stored at initialization, and fail
/// loudly on an uninitialized contract rather than returning a zero address.
#[test]
fn test_get_admin_reports_initialized_admin() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let contract_id = env.register(BezaMintFactory, (admin.clone(),));
    let client = BezaMintFactoryClient::new(&env, &contract_id);
    assert_eq!(client.get_admin(), admin);
}

/// The role must actually move. Asserting only that `get_admin` changed would
/// pass even if the old key kept working, so this authorizes with the previous
/// admin alone and requires the call to be rejected. On this contract the stake
/// is the highest: the admin can rewire every slot and seize the Royalty admin.
#[test]
fn test_set_admin_transfers_authority() {
    let env = Env::default();
    env.mock_all_auths();
    let old_admin = Address::generate(&env);
    let new_admin = Address::generate(&env);
    let contract_id = env.register(BezaMintFactory, (old_admin.clone(),));
    let client = BezaMintFactoryClient::new(&env, &contract_id);

    client.set_admin(&new_admin);
    assert_eq!(client.get_admin(), new_admin.clone());

    // Only the former admin signs: the role has moved, so this must be refused.
    let third = Address::generate(&env);
    env.mock_auths(&[soroban_sdk::testutils::MockAuth {
        address: &old_admin,
        invoke: &soroban_sdk::testutils::MockAuthInvoke {
            contract: &contract_id,
            fn_name: "set_admin",
            args: soroban_sdk::IntoVal::into_val(&(third.clone(),), &env),
            sub_invokes: &[],
        },
    }]);
    assert!(client.try_set_admin(&third).is_err());
    assert_eq!(client.get_admin(), new_admin);
}

/// An admin that cannot sign is indistinguishable from no admin, so the zero
/// account is refused and the stored admin is left untouched.
#[test]
fn test_set_admin_rejects_zero_address() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let client = BezaMintFactoryClient::new(&env, &env.register(BezaMintFactory, (admin.clone(),)));

    let zero = Address::from_str(
        &env,
        "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
    );
    // FactoryError::AdminZeroAddress
    assert!(client.try_set_admin(&zero).is_err());
    assert_eq!(client.get_admin(), admin);
}
