use soroban_sdk::{
    testutils::{Address as _, MockAuth, MockAuthInvoke},
    Address, Env, IntoVal,
};

use crate::{BezaMintFactory, BezaMintFactoryClient};

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
