use soroban_sdk::{
    testutils::{Address as _, Events, MockAuth, MockAuthInvoke},
    Address, Env, IntoVal, String, Symbol, TryFromVal,
};

use crate::{BezaMintFactory, BezaMintFactoryClient, FactoryEvent};

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

#[test]
fn test_is_initialized_reflects_state() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let client = BezaMintFactoryClient::new(&env, &env.register(BezaMintFactory, ()));
    assert!(!client.is_initialized());
    client.initialize(&admin);
    assert!(client.is_initialized());
}

#[test]
#[should_panic(expected = "already initialized")]
fn test_initialize_rejects_double_init() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let attacker = Address::generate(&env);
    let client = BezaMintFactoryClient::new(&env, &env.register(BezaMintFactory, ()));
    client.initialize(&admin);
    client.initialize(&attacker);
}

#[test]
fn test_initialize_and_set_contracts() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let contract_id = env.register(BezaMintFactory, ());
    let client = BezaMintFactoryClient::new(&env, &contract_id);

    client.initialize(&admin);

    let nft = Address::generate(&env);
    let collection = Address::generate(&env);
    // set_contracts seizes the Royalty admin role, so it must receive a real,
    // initialized Royalty contract rather than a bare address.
    let royalty_id = env.register(BezaMintRoyalty, ());
    let royalty = BezaMintRoyaltyClient::new(&env, &royalty_id);
    royalty.initialize(&admin);
    let creator = Address::generate(&env);

    client.set_contracts(&nft, &collection, &royalty_id, &creator);

    assert_eq!(client.get_nft_contract(), nft);
    assert_eq!(client.get_collection_contract(), collection);
    assert_eq!(client.get_royalty_contract(), royalty_id);
    assert_eq!(client.get_creator_contract(), creator);
}

#[test]
#[should_panic]
fn test_unauthorized_set_contracts() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let contract_id = env.register(BezaMintFactory, ());
    let client = BezaMintFactoryClient::new(&env, &contract_id);

    // Authorize only the admin's `initialize` call; the attacker's
    // `set_contracts` must still be rejected by require_auth().
    let auth = MockAuth {
        address: &admin,
        invoke: &MockAuthInvoke {
            contract: &contract_id,
            fn_name: "initialize",
            args: (&admin,).into_val(&env),
            sub_invokes: &[],
        },
    };
    env.mock_auths(&[auth]);

    client.initialize(&admin);

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
    let roy_id = env.register(BezaMintRoyalty, ());
    let roy = BezaMintRoyaltyClient::new(&env, &roy_id);
    roy.initialize(&admin);
    let cre = Address::generate(&env);
    let contract = BezaMintFactoryClient::new(&env, &env.register(BezaMintFactory, ()));
    contract.initialize(&admin);
    contract.set_contracts(&nft, &col, &roy_id, &cre);
    assert_eq!(contract.get_nft_contract(), nft);
    assert_eq!(contract.get_collection_contract(), col);
}

#[test]
fn test_mint_with_royalty_returns_token() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let nft_addr = Address::generate(&env);
    let royalty_id = env.register(BezaMintRoyalty, ());
    let royalty = BezaMintRoyaltyClient::new(&env, &royalty_id);
    royalty.initialize(&admin);
    let factory = BezaMintFactoryClient::new(&env, &env.register(BezaMintFactory, ()));
    factory.initialize(&admin);
    // set_contracts requires a live Royalty contract (it seizes the admin role).
    factory.set_contracts(&nft_addr, &nft_addr, &royalty_id, &nft_addr);
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

    let factory_id = env.register(BezaMintFactory, ());
    let factory = BezaMintFactoryClient::new(&env, &factory_id);

    env.mock_all_auths();
    let nft = BezaMintNftClient::new(&env, &env.register(BezaMintNft, ()));
    nft.initialize(&admin);
    let collection = BezaMintCollectionClient::new(&env, &env.register(BezaMintCollection, ()));
    collection.initialize(&admin);
    // The deployer initializes Royalty; set_contracts transfers admin to the
    // Factory so it can manage royalties on behalf of users.
    let royalty = BezaMintRoyaltyClient::new(&env, &env.register(BezaMintRoyalty, ()));
    royalty.initialize(&admin);
    let creator = BezaMintCreatorClient::new(&env, &env.register(BezaMintCreator, ()));
    creator.initialize(&admin);

    factory.initialize(&admin);
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
                    args: (user.clone(), 1u64, metadata.clone()).into_val(&env),
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

/// The Factory's public events (contracts set, NFT minted, NFT burned,
/// collection created) must fire with the right payloads even during
/// cross-contract flows.
#[test]
fn test_events_cover_factory_mutations() {
    let env = Env::default();

    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    env.mock_all_auths();
    let nft = BezaMintNftClient::new(&env, &env.register(BezaMintNft, ()));
    nft.initialize(&admin);
    let collection = BezaMintCollectionClient::new(&env, &env.register(BezaMintCollection, ()));
    collection.initialize(&admin);
    let royalty = BezaMintRoyaltyClient::new(&env, &env.register(BezaMintRoyalty, ()));
    royalty.initialize(&admin);
    let creator = BezaMintCreatorClient::new(&env, &env.register(BezaMintCreator, ()));
    creator.initialize(&admin);

    let factory_id = env.register(BezaMintFactory, ());
    let factory = BezaMintFactoryClient::new(&env, &factory_id);
    factory.initialize(&admin);

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
    let nft = BezaMintNftClient::new(&env, &env.register(BezaMintNft, ()));
    nft.initialize(&admin);
    let collection = BezaMintCollectionClient::new(&env, &env.register(BezaMintCollection, ()));
    collection.initialize(&admin);
    let royalty = BezaMintRoyaltyClient::new(&env, &env.register(BezaMintRoyalty, ()));
    royalty.initialize(&admin);
    let creator = BezaMintCreatorClient::new(&env, &env.register(BezaMintCreator, ()));
    creator.initialize(&admin);

    let factory_id = env.register(BezaMintFactory, ());
    let factory = BezaMintFactoryClient::new(&env, &factory_id);
    factory.initialize(&admin);
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
#[should_panic(expected = "not found")]
fn test_mint_into_missing_collection_fails() {
    let env = Env::default();

    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    env.mock_all_auths();
    let nft = BezaMintNftClient::new(&env, &env.register(BezaMintNft, ()));
    nft.initialize(&admin);
    let collection = BezaMintCollectionClient::new(&env, &env.register(BezaMintCollection, ()));
    collection.initialize(&admin);
    let royalty = BezaMintRoyaltyClient::new(&env, &env.register(BezaMintRoyalty, ()));
    royalty.initialize(&admin);
    let creator = BezaMintCreatorClient::new(&env, &env.register(BezaMintCreator, ()));
    creator.initialize(&admin);

    let factory_id = env.register(BezaMintFactory, ());
    let factory = BezaMintFactoryClient::new(&env, &factory_id);
    factory.initialize(&admin);
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
    let nft = BezaMintNftClient::new(&env, &env.register(BezaMintNft, ()));
    nft.initialize(&admin);
    let collection = BezaMintCollectionClient::new(&env, &env.register(BezaMintCollection, ()));
    collection.initialize(&admin);
    let royalty = BezaMintRoyaltyClient::new(&env, &env.register(BezaMintRoyalty, ()));
    royalty.initialize(&admin);
    let creator = BezaMintCreatorClient::new(&env, &env.register(BezaMintCreator, ()));
    creator.initialize(&admin);

    let factory_id = env.register(BezaMintFactory, ());
    let factory = BezaMintFactoryClient::new(&env, &factory_id);
    factory.initialize(&admin);
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
    let nft = BezaMintNftClient::new(&env, &env.register(BezaMintNft, ()));
    nft.initialize(&admin);
    let collection = BezaMintCollectionClient::new(&env, &env.register(BezaMintCollection, ()));
    collection.initialize(&admin);
    let royalty = BezaMintRoyaltyClient::new(&env, &env.register(BezaMintRoyalty, ()));
    royalty.initialize(&admin);
    let creator = BezaMintCreatorClient::new(&env, &env.register(BezaMintCreator, ()));
    creator.initialize(&admin);

    let factory_id = env.register(BezaMintFactory, ());
    let factory = BezaMintFactoryClient::new(&env, &factory_id);
    factory.initialize(&admin);
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
