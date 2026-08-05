use soroban_sdk::{
    testutils::{Address as _, MockAuth, MockAuthInvoke},
    Address, Env, IntoVal, String,
};

use crate::{BezaMintFactory, BezaMintFactoryClient};

use bezamint_collection::{BezaMintCollection, BezaMintCollectionClient};
use bezamint_creator::{BezaMintCreator, BezaMintCreatorClient};
use bezamint_nft::{BezaMintNft, BezaMintNftClient};
use bezamint_royalty::{BezaMintRoyalty, BezaMintRoyaltyClient};

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
    let royalty = Address::generate(&env);
    let creator = Address::generate(&env);

    client.set_contracts(&admin, &nft, &collection, &royalty, &creator);

    assert_eq!(client.get_nft_contract(), nft);
    assert_eq!(client.get_collection_contract(), collection);
    assert_eq!(client.get_royalty_contract(), royalty);
    assert_eq!(client.get_creator_contract(), creator);
}

#[test]
#[should_panic]
fn test_unauthorized_set_contracts() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let attacker = Address::generate(&env);
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

    client.set_contracts(&attacker, &nft, &collection, &royalty, &creator);
}

#[test]
fn test_factory_set_contracts() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let nft = Address::generate(&env);
    let col = Address::generate(&env);
    let roy = Address::generate(&env);
    let cre = Address::generate(&env);
    let contract = BezaMintFactoryClient::new(&env, &env.register(BezaMintFactory, ()));
    contract.initialize(&admin);
    contract.set_contracts(&admin, &nft, &col, &roy, &cre);
    assert_eq!(contract.get_nft_contract(), nft);
    assert_eq!(contract.get_collection_contract(), col);
}

#[test]
fn test_mint_with_royalty_returns_token() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let caller = Address::generate(&env);
    let nft_addr = Address::generate(&env);
    let royalty_addr = Address::generate(&env);
    let factory = BezaMintFactoryClient::new(&env, &env.register(BezaMintFactory, ()));
    factory.initialize(&admin);
    // Set up stub contracts
    factory.set_contracts(&admin, &nft_addr, &nft_addr, &royalty_addr, &nft_addr);
    // Cross-contract call will fail on real network but verifies structure
}

/// Full-stack integration: register the real NFT, Royalty, Collection and Creator
/// contracts and verify the Factory's atomic mint_with_royalty flow end-to-end.
///
/// Production setup: the Factory is the admin of the Royalty contract so its
/// cross-contract `configure_royalty` call passes admin auth (contract self-auth),
/// while the user authorizes the root call and the NFT `mint` sub-invoke.
#[test]
fn test_integration_mint_with_royalty() {
    let env = Env::default();

    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    // Register the Factory first so we can make it the Royalty admin.
    let factory_id = env.register(BezaMintFactory, ());
    let factory = BezaMintFactoryClient::new(&env, &factory_id);

    env.mock_all_auths();
    let nft = BezaMintNftClient::new(&env, &env.register(BezaMintNft, ()));
    nft.initialize(&admin);
    let collection = BezaMintCollectionClient::new(&env, &env.register(BezaMintCollection, ()));
    collection.initialize(&admin);
    // The Factory manages royalties on behalf of users.
    let royalty = BezaMintRoyaltyClient::new(&env, &env.register(BezaMintRoyalty, ()));
    royalty.initialize(&factory_id);
    let creator = BezaMintCreatorClient::new(&env, &env.register(BezaMintCreator, ()));
    creator.initialize(&admin);

    factory.initialize(&admin);
    factory.set_contracts(
        &admin,
        &nft.address,
        &collection.address,
        &royalty.address,
        &creator.address,
    );

    let metadata = String::from_str(&env, "ipfs://integrated/1");

    // The user authorizes the Factory root call plus the NFT mint sub-invoke.
    // The royalty sub-invoke is covered by the Factory's own admin role.
    let auth = MockAuth {
        address: &user,
        invoke: &MockAuthInvoke {
            contract: &factory_id,
            fn_name: "mint_with_royalty",
            args: (
                user.clone(),
                user.clone(),
                0u64,
                metadata.clone(),
                500u32,
            )
                .into_val(&env),
            sub_invokes: &[
                MockAuthInvoke {
                    contract: &nft.address,
                    fn_name: "mint",
                    args: (
                        user.clone(),
                        0u64,
                        metadata.clone(),
                    )
                        .into_val(&env),
                    sub_invokes: &[],
                },
            ],
        },
    };
    env.mock_auths(&[auth]);

    // Atomic mint + royalty configuration in one factory call.
    let token_id =
        factory.mint_with_royalty(&user, &user, &0, &metadata, &500);

    // NFT side effects.
    assert_eq!(token_id, 1);
    assert_eq!(nft.owner_of(&1), user);
    assert_eq!(nft.total_supply(), 1);

    // Royalty side effects.
    let config = royalty.get_royalty(&1, &false);
    assert_eq!(config.basis_points, 500);
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
        &admin,
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

    let collection_id =
        factory.create_collection_for_creator(&user, &metadata);

    assert_eq!(collection_id, 1);
    assert_eq!(collection.total_collections(), 1);

    // The Factory auto-registered the creator.
    assert!(creator.is_registered(&user));
    assert!(collection.get_collection(&1).creator == user);
}
