use soroban_sdk::{
    testutils::{Address as _, Ledger},
    Address, Env, Map,
};

use crate::{BezaMintRoyalty, BezaMintRoyaltyClient};

fn setup() -> (Env, Address, BezaMintRoyaltyClient<'static>) {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let contract_id = env.register(BezaMintRoyalty, ());
    let client = BezaMintRoyaltyClient::new(&env, &contract_id);
    client.initialize(&admin);
    (env, admin, client)
}

#[test]
fn test_is_initialized_reflects_state() {
    let (_, _, client) = setup();
    assert!(client.is_initialized());
}

#[test]
#[should_panic(expected = "already initialized")]
fn test_initialize_rejects_double_init() {
    let (env, _, client) = setup();
    let attacker = Address::generate(&env);
    client.initialize(&attacker);
}

fn empty_recipients(env: &Env) -> Map<Address, u32> {
    Map::new(env)
}

fn recipients(env: &Env, entries: &[(Address, u32)]) -> Map<Address, u32> {
    let mut map = Map::new(env);
    for (address, share) in entries {
        map.set(address.clone(), *share);
    }
    map
}

#[test]
fn test_recipients_summing_to_100_are_accepted() {
    let (env, _, client) = setup();
    let creator = Address::generate(&env);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    let split = recipients(&env, &[(alice.clone(), 60), (bob.clone(), 40)]);

    client.configure_royalty(&creator, &1, &500, &split, &false);

    let config = client.get_royalty(&1, &false);
    assert_eq!(config.recipients.len(), 2);
    assert_eq!(config.recipients.get(alice).unwrap(), 60);
    assert_eq!(config.recipients.get(bob).unwrap(), 40);
}

#[test]
fn test_empty_recipients_means_full_share_to_creator() {
    let (env, _, client) = setup();
    let creator = Address::generate(&env);
    client.configure_royalty(&creator, &1, &500, &empty_recipients(&env), &false);
    assert_eq!(client.get_royalty(&1, &false).recipients.len(), 0);
}

#[test]
#[should_panic(expected = "must sum to 100")]
fn test_recipients_summing_to_99_are_rejected() {
    let (env, _, client) = setup();
    let creator = Address::generate(&env);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    let split = recipients(&env, &[(alice, 59), (bob, 40)]);
    client.configure_royalty(&creator, &1, &500, &split, &false);
}

#[test]
#[should_panic(expected = "must sum to 100")]
fn test_recipients_summing_over_100_are_rejected() {
    let (env, _, client) = setup();
    let creator = Address::generate(&env);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    let split = recipients(&env, &[(alice, 150), (bob, 100)]);
    client.configure_royalty(&creator, &1, &500, &split, &false);
}

#[test]
#[should_panic(expected = "greater than zero")]
fn test_zero_share_recipient_is_rejected() {
    let (env, _, client) = setup();
    let creator = Address::generate(&env);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    let split = recipients(&env, &[(alice, 100), (bob, 0)]);
    client.configure_royalty(&creator, &1, &500, &split, &false);
}

#[test]
#[should_panic(expected = "at most 10 recipients")]
fn test_too_many_recipients_are_rejected() {
    let (env, _, client) = setup();
    let creator = Address::generate(&env);
    let mut map = Map::new(&env);
    for _ in 0..11 {
        map.set(Address::generate(&env), 9u32);
    }
    client.configure_royalty(&creator, &1, &500, &map, &false);
}

#[test]
#[should_panic(expected = "must sum to 100")]
fn test_update_royalty_validates_recipients() {
    let (env, _, client) = setup();
    let creator = Address::generate(&env);
    client.configure_royalty(&creator, &1, &500, &empty_recipients(&env), &false);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    let split = recipients(&env, &[(alice, 10), (bob, 10)]);
    client.update_royalty(&creator, &1, &500, &split, &false);
}

#[test]
fn test_basis_point_ceiling_is_10000() {
    let (env, _, client) = setup();
    let creator = Address::generate(&env);
    client.configure_royalty(&creator, &1, &10000, &empty_recipients(&env), &false);
    assert_eq!(client.get_royalty(&1, &false).basis_points, 10000);
}

#[test]
fn test_validate_basis_points() {
    let (_, _, client) = setup();
    assert!(client.validate_basis_points(&500));
    assert!(client.validate_basis_points(&10000));
    assert!(!client.validate_basis_points(&10001));
    assert!(client.validate_basis_points(&0));
}

#[test]
fn test_configure_royalty_for_nft() {
    let (env, _, client) = setup();
    let creator = Address::generate(&env);
    env.ledger().with_mut(|l| l.timestamp = 12345);

    client.configure_royalty(&creator, &1, &500, &empty_recipients(&env), &false);

    let config = client.get_royalty(&1, &false);
    assert_eq!(config.basis_points, 500);
    assert!(!config.is_frozen);
    assert!(config.set_at > 0);
}

#[test]
fn test_configure_royalty_for_collection() {
    let (env, _, client) = setup();
    let creator = Address::generate(&env);
    env.ledger().with_mut(|l| l.timestamp = 12345);

    client.configure_royalty(&creator, &42, &750, &empty_recipients(&env), &true);

    let config = client.get_royalty(&42, &true);
    assert_eq!(config.basis_points, 750);
    assert!(!client.is_frozen(&42, &true));
}

#[test]
#[should_panic(expected = "basis points must be")]
fn test_configure_invalid_basis_points_fails() {
    let (env, _, client) = setup();
    let creator = Address::generate(&env);
    client.configure_royalty(&creator, &1, &15000, &empty_recipients(&env), &false);
}

/// A frozen configuration must not be replaceable through `configure_royalty`.
#[test]
#[should_panic(expected = "config already exists")]
fn test_configure_royalty_cannot_overwrite_frozen_config() {
    let (env, _, client) = setup();
    let creator = Address::generate(&env);
    client.configure_royalty(&creator, &1, &500, &empty_recipients(&env), &false);
    client.freeze_royalty(&1, &false);
    client.configure_royalty(&creator, &1, &100, &empty_recipients(&env), &false);
}

/// Even an unfrozen configuration is created once; changing it is the job of
/// `update_royalty`, which emits a distinct `Updated` event.
#[test]
#[should_panic(expected = "config already exists")]
fn test_configure_royalty_cannot_overwrite_live_config() {
    let (env, _, client) = setup();
    let creator = Address::generate(&env);
    client.configure_royalty(&creator, &1, &500, &empty_recipients(&env), &false);
    client.configure_royalty(&creator, &1, &600, &empty_recipients(&env), &false);
}

/// The NFT and collection namespaces are independent, so creating one must not
/// block creating the other for the same numeric id.
#[test]
fn test_configure_royalty_namespaces_are_independent() {
    let (env, _, client) = setup();
    let creator = Address::generate(&env);
    client.configure_royalty(&creator, &1, &300, &empty_recipients(&env), &false);
    client.configure_royalty(&creator, &1, &700, &empty_recipients(&env), &true);
    client.update_royalty(&creator, &1, &400, &empty_recipients(&env), &false);
    assert_eq!(client.get_royalty(&1, &false).basis_points, 400);
    assert_eq!(client.get_royalty(&1, &true).basis_points, 700);
}

#[test]
fn test_update_royalty() {
    let (env, _, client) = setup();
    let creator = Address::generate(&env);
    env.ledger().with_mut(|l| l.timestamp = 12345);

    client.configure_royalty(&creator, &1, &500, &empty_recipients(&env), &false);
    client.update_royalty(&creator, &1, &1000, &empty_recipients(&env), &false);

    let config = client.get_royalty(&1, &false);
    assert_eq!(config.basis_points, 1000);
}

/// The creator of a config owns its terms: they may amend them without the
/// deployer's admin key. This is the property that makes per-creator royalties
/// decentralized rather than admin-controlled.
#[test]
fn test_creator_can_update_own_royalty() {
    let (env, _, client) = setup();
    let creator = Address::generate(&env);
    client.configure_royalty(&creator, &1, &500, &empty_recipients(&env), &false);
    client.update_royalty(&creator, &1, &2000, &empty_recipients(&env), &false);
    assert_eq!(client.get_royalty(&1, &false).basis_points, 2000);
}

/// A stranger who is neither the recorded creator nor the admin must not be
/// able to amend someone else's terms.
#[test]
#[should_panic(expected = "caller cannot update")]
fn test_stranger_cannot_update_royalty() {
    let (env, _, client) = setup();
    let creator = Address::generate(&env);
    let stranger = Address::generate(&env);
    client.configure_royalty(&creator, &1, &500, &empty_recipients(&env), &false);
    client.update_royalty(&stranger, &1, &1000, &empty_recipients(&env), &false);
}

/// The admin retains operational control and can amend terms even though they
/// are not the recorded creator.
#[test]
fn test_admin_can_update_royalty() {
    let (env, admin, client) = setup();
    let creator = Address::generate(&env);
    client.configure_royalty(&creator, &1, &500, &empty_recipients(&env), &false);
    client.update_royalty(&admin, &1, &1500, &empty_recipients(&env), &false);
    assert_eq!(client.get_royalty(&1, &false).basis_points, 1500);
}

#[test]
fn test_freeze_prevents_updates() {
    let (env, _, client) = setup();
    let creator = Address::generate(&env);
    env.ledger().with_mut(|l| l.timestamp = 12345);

    client.configure_royalty(&creator, &1, &500, &empty_recipients(&env), &false);
    client.freeze_royalty(&1, &false);

    assert!(client.is_frozen(&1, &false));
}

#[test]
#[should_panic(expected = "frozen")]
fn test_update_frozen_royalty_fails() {
    let (env, _, client) = setup();
    let creator = Address::generate(&env);
    env.ledger().with_mut(|l| l.timestamp = 12345);

    client.configure_royalty(&creator, &1, &500, &empty_recipients(&env), &false);
    client.freeze_royalty(&1, &false);
    client.update_royalty(&creator, &1, &1000, &empty_recipients(&env), &false);
}

#[test]
#[should_panic(expected = "no config")]
fn test_get_nonexistent_royalty_panics() {
    let (_, _, client) = setup();
    client.get_royalty(&999, &false);
}

#[test]
fn test_nft_and_collection_royalties_are_separate() {
    let (env, _, client) = setup();
    let creator = Address::generate(&env);
    env.ledger().with_mut(|l| l.timestamp = 12345);

    client.configure_royalty(&creator, &1, &300, &empty_recipients(&env), &false);
    client.configure_royalty(&creator, &1, &700, &empty_recipients(&env), &true);

    assert_eq!(client.get_royalty(&1, &false).basis_points, 300);
    assert_eq!(client.get_royalty(&1, &true).basis_points, 700);
}

#[test]
fn test_freeze_royalty() {
    let (env, _, client) = setup();
    let creator = Address::generate(&env);
    env.ledger().with_mut(|l| l.timestamp = 12345);

    client.configure_royalty(&creator, &1, &500, &empty_recipients(&env), &false);
    client.freeze_royalty(&1, &false);
    assert!(client.is_frozen(&1, &false));
}

#[test]
#[should_panic(expected = "frozen")]
fn test_royalty_update_blocked_when_frozen() {
    let (env, _, client) = setup();
    let creator = Address::generate(&env);
    env.ledger().with_mut(|l| l.timestamp = 12345);

    client.configure_royalty(&creator, &1, &500, &empty_recipients(&env), &false);
    client.freeze_royalty(&1, &false);
    client.update_royalty(&creator, &1, &1000, &empty_recipients(&env), &false);
}

#[test]
fn test_get_royalty_returns_config() {
    let (env, _, client) = setup();
    let creator = Address::generate(&env);
    env.ledger().with_mut(|l| l.timestamp = 12345);

    client.configure_royalty(&creator, &1, &750, &empty_recipients(&env), &false);
    let config = client.get_royalty(&1, &false);
    assert_eq!(config.basis_points, 750);
    assert!(!config.is_frozen);
}

#[test]
#[should_panic(expected = "basis points must be")]
fn test_validate_basis_points_limit() {
    let (env, _, client) = setup();
    let creator = Address::generate(&env);
    client.configure_royalty(&creator, &1, &10001, &empty_recipients(&env), &false);
}
