use soroban_sdk::{testutils::Address as _, Address, Env};

use crate::{BezaMintRoyalty, BezaMintRoyaltyClient};

#[test]
fn test_initialize() {
    let env = Env::default();
    let admin = Address::generate(&env);

    let contract_id = env.register(BezaMintRoyalty, ());
    let client = BezaMintRoyaltyClient::new(&env, &contract_id);

    client.initialize(&admin);
}

#[test]
fn test_validate_basis_points() {
    let env = Env::default();
    let admin = Address::generate(&env);

    let contract_id = env.register(BezaMintRoyalty, ());
    let client = BezaMintRoyaltyClient::new(&env, &contract_id);

    client.initialize(&admin);
    assert!(client.validate_basis_points(&500));
    assert!(client.validate_basis_points(&10000));
    assert!(!client.validate_basis_points(&10001));
}
