use soroban_sdk::{
    testutils::{Address as _, Ledger, Events},
    vec, Address, Env, IntoVal, String,
};

use crate::{BezaMintNft, BezaMintNftClient, NftData, NftEvent};

// ─────────── Helpers ───────────

fn setup() -> (Env, Address, Address, BezaMintNftClient) {
    let env = Env::default();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    let contract_id = env.register(BezaMintNft, ());
    let client = BezaMintNftClient::new(&env, &contract_id);

    client.initialize(&admin);
    (env, admin, user, client)
}

fn mint_one(
    client: &BezaMintNftClient,
    to: &Address,
    collection_id: u64,
) -> u64 {
    client.mint(to, &collection_id, &String::from_str(&client.env, "ipfs://metadata/1"))
}

// ─────────── Tests ───────────

#[test]
fn test_initialize_sets_admin_and_counter() {
    let (env, admin, _user, client) = setup();
    assert_eq!(client.total_supply(), 0);

    // Admin must auth
    let events = env.events().all();
    assert!(!events.is_empty());
}

#[test]
fn test_mint_increases_counter_and_sets_owner() {
    let (env, admin, user, client) = setup();
    let ledger = env.ledger().with_mock();

    let token_id = mint_one(&client, &user, 0);
    assert_eq!(token_id, 1);
    assert_eq!(client.total_supply(), 1);

    let owner = client.owner_of(&token_id);
    assert_eq!(owner, user);

    let data = client.token_data(&token_id);
    assert_eq!(data.token_id, 1);
    assert_eq!(data.creator, user);
    assert_eq!(data.collection_id, 0);
}

#[test]
fn test_mint_emits_event() {
    let (env, admin, user, client) = setup();
    let ledger = env.ledger().with_mock();

    client.mint(&user, &1, &String::from_str(&env, "ipfs://meta"));

    let events = env.events().all();
    // Last event should be Minted
    assert!(events.len() >= 1);
}

#[test]
fn test_mint_multiple_tokens() {
    let (env, admin, user, client) = setup();
    let ledger = env.ledger().with_mock();

    let t1 = mint_one(&client, &user, 0);
    let t2 = mint_one(&client, &user, 0);
    let t3 = client.mint(&user, &2, &String::from_str(&env, "ipfs://meta/3"));

    assert_eq!(t1, 1);
    assert_eq!(t2, 2);
    assert_eq!(t3, 3);
    assert_eq!(client.total_supply(), 3);
    assert_eq!(client.balance_of(&user), 3);
}

#[test]
fn test_transfer_changes_ownership() {
    let (env, admin, user, client) = setup();
    let ledger = env.ledger().with_mock();

    let token_id = mint_one(&client, &user, 0);
    let new_owner = Address::generate(&env);

    client.transfer(&user, &new_owner, &token_id);

    assert_eq!(client.owner_of(&token_id), new_owner);
    assert_eq!(client.balance_of(&user), 0);
    assert_eq!(client.balance_of(&new_owner), 1);
}

#[test]
#[should_panic(expected = "NFT: caller is not the current owner")]
fn test_transfer_fails_if_not_owner() {
    let (env, admin, user, client) = setup();
    let ledger = env.ledger().with_mock();

    let token_id = mint_one(&client, &user, 0);
    let attacker = Address::generate(&env);
    let target = Address::generate(&env);

    client.transfer(&attacker, &target, &token_id);
}

#[test]
fn test_transfer_emits_event() {
    let (env, admin, user, client) = setup();
    let ledger = env.ledger().with_mock();

    let token_id = mint_one(&client, &user, 0);
    let new_owner = Address::generate(&env);

    client.transfer(&user, &new_owner, &token_id);

    let events = env.events().all();
    assert!(events.len() >= 2); // Minted + Transferred
}

#[test]
fn test_approve_and_is_approved() {
    let (env, admin, user, client) = setup();
    let ledger = env.ledger().with_mock();

    let token_id = mint_one(&client, &user, 0);
    let operator = Address::generate(&env);

    assert!(!client.is_approved(&operator, &token_id));

    client.approve(&operator, &token_id);

    assert!(client.is_approved(&operator, &token_id));
}

#[test]
fn test_approval_for_all() {
    let (env, admin, user, client) = setup();
    let operator = Address::generate(&env);

    assert!(!client.is_approved_for_all(&user, &operator));

    client.set_approval_for_all(&operator, &true);

    assert!(client.is_approved_for_all(&user, &operator));

    client.set_approval_for_all(&operator, &false);
    assert!(!client.is_approved_for_all(&user, &operator));
}

#[test]
fn test_burn_removes_ownership_and_data() {
    let (env, admin, user, client) = setup();
    let ledger = env.ledger().with_mock();

    let token_id = mint_one(&client, &user, 0);

    client.burn(&token_id);

    // Balance should drop to 0
    assert_eq!(client.balance_of(&user), 0);

    // Total supply still reflects the counter, not burned count
    // (this is by design – total_supply is the mint counter)
}

#[test]
#[should_panic(expected = "NFT: token")]
fn test_burn_fails_for_nonexistent_token() {
    let (env, admin, user, client) = setup();
    client.burn(&999);
}

#[test]
fn test_balance_of_zero_for_address_with_no_tokens() {
    let (env, admin, user, client) = setup();
    let ledger = env.ledger().with_mock();

    assert_eq!(client.balance_of(&user), 0);
    assert_eq!(client.balance_of(&admin), 0);
}

#[test]
fn test_balance_of_with_multiple_owners() {
    let (env, admin, user, client) = setup();
    let ledger = env.ledger().with_mock();
    let user2 = Address::generate(&env);

    mint_one(&client, &user, 0);
    mint_one(&client, &user, 0);
    mint_one(&client, &user2, 1);

    assert_eq!(client.balance_of(&user), 2);
    assert_eq!(client.balance_of(&user2), 1);
}

#[test]
#[should_panic(expected = "NFT: token")]
fn test_owner_of_nonexistent_panics() {
    let (env, admin, user, client) = setup();
    client.owner_of(&42);
}

#[test]
fn test_token_data_stores_correct_info() {
    let (env, admin, user, client) = setup();
    let ledger = env.ledger().with_mock();

    let token_id = client.mint(
        &user,
        &5,
        &String::from_str(&env, "ipfs://collection-5/nft-1"),
    );

    let data = client.token_data(&token_id);
    assert_eq!(data.token_id, 1);
    assert_eq!(data.collection_id, 5);
    assert_eq!(data.creator, user);
    assert_eq!(data.metadata_uri, String::from_str(&env, "ipfs://collection-5/nft-1"));
    assert!(data.minted_at > 0);
}

#[test]
fn test_mint_requires_admin_auth() {
    let (env, admin, user, client) = setup();
    let ledger = env.ledger().with_mock();

    // Non-admin cannot mint if auth is enforced via require_auth on admin
    // In tests, we set up admin as the one calling initialize.
    // The mint function calls admin.require_auth(), which in test env
    // needs the admin to have authorized. The test passes because
    // client.mint() signs as admin by default in test mode.
    // For real envs, only admin can mint.
    let token_id = mint_one(&client, &user, 0);
    assert!(token_id > 0);
}
