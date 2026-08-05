use soroban_sdk::{
    testutils::{Address as _, Ledger},
    Address, Env, Map,
};

use crate::{BezaMintRoyalty, BezaMintRoyaltyClient};

fn setup() -> (Env, BezaMintRoyaltyClient<'static>) {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let contract_id = env.register(BezaMintRoyalty, ());
    let client = BezaMintRoyaltyClient::new(&env, &contract_id);
    client.initialize(&admin);
    (env, client)
}

fn empty_recipients(env: &Env) -> Map<Address, u32> {
    Map::new(env)
}

#[test]
fn test_validate_basis_points() {
    let (_, client) = setup();
    assert!(client.validate_basis_points(&500));
    assert!(client.validate_basis_points(&10000));
    assert!(!client.validate_basis_points(&10001));
    assert!(client.validate_basis_points(&0));
}

#[test]
fn test_configure_royalty_for_nft() {
    let (env, client) = setup();
    env.ledger().with_mut(|l| l.timestamp = 12345);

    client.configure_royalty(&1, &500, &empty_recipients(&env), &false);

    let config = client.get_royalty(&1, &false);
    assert_eq!(config.basis_points, 500);
    assert!(!config.is_frozen);
    assert!(config.set_at > 0);
}

#[test]
fn test_configure_royalty_for_collection() {
    let (env, client) = setup();
    env.ledger().with_mut(|l| l.timestamp = 12345);

    client.configure_royalty(&42, &750, &empty_recipients(&env), &true);

    let config = client.get_royalty(&42, &true);
    assert_eq!(config.basis_points, 750);
    assert!(!client.is_frozen(&42, &true));
}

#[test]
#[should_panic(expected = "basis points must be")]
fn test_configure_invalid_basis_points_fails() {
    let (env, client) = setup();
    client.configure_royalty(&1, &15000, &empty_recipients(&env), &false);
}

#[test]
fn test_update_royalty() {
    let (env, client) = setup();
    env.ledger().with_mut(|l| l.timestamp = 12345);

    client.configure_royalty(&1, &500, &empty_recipients(&env), &false);
    client.update_royalty(&1, &1000, &empty_recipients(&env), &false);

    let config = client.get_royalty(&1, &false);
    assert_eq!(config.basis_points, 1000);
}

#[test]
fn test_freeze_prevents_updates() {
    let (env, client) = setup();
    env.ledger().with_mut(|l| l.timestamp = 12345);

    client.configure_royalty(&1, &500, &empty_recipients(&env), &false);
    client.freeze_royalty(&1, &false);

    assert!(client.is_frozen(&1, &false));
}

#[test]
#[should_panic(expected = "frozen")]
fn test_update_frozen_royalty_fails() {
    let (env, client) = setup();
    env.ledger().with_mut(|l| l.timestamp = 12345);

    client.configure_royalty(&1, &500, &empty_recipients(&env), &false);
    client.freeze_royalty(&1, &false);
    client.update_royalty(&1, &1000, &empty_recipients(&env), &false);
}

#[test]
#[should_panic(expected = "no config")]
fn test_get_nonexistent_royalty_panics() {
    let (_, client) = setup();
    client.get_royalty(&999, &false);
}

#[test]
fn test_nft_and_collection_royalties_are_separate() {
    let (env, client) = setup();
    env.ledger().with_mut(|l| l.timestamp = 12345);

    client.configure_royalty(&1, &300, &empty_recipients(&env), &false);
    client.configure_royalty(&1, &700, &empty_recipients(&env), &true);

    assert_eq!(client.get_royalty(&1, &false).basis_points, 300);
    assert_eq!(client.get_royalty(&1, &true).basis_points, 700);
}

#[test]
fn test_freeze_royalty() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let contract = BezaMintRoyaltyClient::new(&env, &env.register(BezaMintRoyalty, ()));
    contract.initialize(&admin);
    let recipients = Map::new(&env);
    contract.configure_royalty(&1, &500, &recipients, &false);
    contract.freeze_royalty(&1, &false);
    assert!(contract.is_frozen(&1, &false));
}

#[test]
fn test_royalty_update_blocked_when_frozen() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let contract = BezaMintRoyaltyClient::new(&env, &env.register(BezaMintRoyalty, ()));
    contract.initialize(&admin);
    let recipients = Map::new(&env);
    contract.configure_royalty(&1, &500, &recipients, &false);
    contract.freeze_royalty(&1, &false);
    // Update should panic when frozen
    let result = std::panic::catch_unwind(|| {
        contract.update_royalty(&1, &1000, &recipients, &false);
    });
    assert!(result.is_err());
}

#[test]
fn test_get_royalty_returns_config() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let contract = BezaMintRoyaltyClient::new(&env, &env.register(BezaMintRoyalty, ()));
    contract.initialize(&admin);
    let recipients = Map::new(&env);
    contract.configure_royalty(&1, &750, &recipients, &false);
    let config = contract.get_royalty(&1, &false);
    assert_eq!(config.basis_points, 750);
    assert!(!config.is_frozen);
}

#[test]
fn test_validate_basis_points_limit() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let contract = BezaMintRoyaltyClient::new(&env, &env.register(BezaMintRoyalty, ()));
    contract.initialize(&admin);
    let recipients = Map::new(&env);
    // 10001 bps should panic (over 100%)
    let result = std::panic::catch_unwind(|| {
        contract.configure_royalty(&1, &10001, &recipients, &false);
    });
    assert!(result.is_err());
}
