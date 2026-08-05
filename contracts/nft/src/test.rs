use soroban_sdk::{testutils::Address as _, Address, Env, String};

use crate::{BezaMintNft, BezaMintNftClient};

fn mint_one(client: &BezaMintNftClient, to: &Address, collection_id: u64) -> u64 {
    client.mint(to, &collection_id, &String::from_str(&client.env, "ipfs://meta/1"))
}

#[test]
fn test_initialize_sets_admin_and_counter() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let contract_id = env.register(BezaMintNft, ());
    let client = BezaMintNftClient::new(&env, &contract_id);
    client.initialize(&admin);
    assert_eq!(client.total_supply(), 0);
}

#[test]
fn test_mint_increases_counter_and_sets_owner() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let contract_id = env.register(BezaMintNft, ());
    let client = BezaMintNftClient::new(&env, &contract_id);
    client.initialize(&admin);

    let token_id = mint_one(&client, &user, 0);
    assert_eq!(token_id, 1);
    assert_eq!(client.total_supply(), 1);
    assert_eq!(client.owner_of(&token_id), user);
    let data = client.token_data(&token_id);
    assert_eq!(data.token_id, 1);
    assert_eq!(data.creator, user);
}

#[test]
fn test_mint_multiple_tokens() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let contract_id = env.register(BezaMintNft, ());
    let client = BezaMintNftClient::new(&env, &contract_id);
    client.initialize(&admin);

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
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let new_owner = Address::generate(&env);
    let contract_id = env.register(BezaMintNft, ());
    let client = BezaMintNftClient::new(&env, &contract_id);
    client.initialize(&admin);

    let token_id = mint_one(&client, &user, 0);
    client.transfer(&user, &new_owner, &token_id);
    assert_eq!(client.owner_of(&token_id), new_owner);
    assert_eq!(client.balance_of(&user), 0);
    assert_eq!(client.balance_of(&new_owner), 1);
}

#[test]
#[should_panic(expected = "caller not owner")]
fn test_transfer_fails_if_not_owner() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let attacker = Address::generate(&env);
    let target = Address::generate(&env);
    let contract_id = env.register(BezaMintNft, ());
    let client = BezaMintNftClient::new(&env, &contract_id);
    client.initialize(&admin);

    let token_id = mint_one(&client, &user, 0);
    client.transfer(&attacker, &target, &token_id);
}

#[test]
fn test_approve_and_is_approved() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let operator = Address::generate(&env);
    let contract_id = env.register(BezaMintNft, ());
    let client = BezaMintNftClient::new(&env, &contract_id);
    client.initialize(&admin);

    let token_id = mint_one(&client, &user, 0);
    assert!(!client.is_approved(&operator, &token_id));
    client.approve(&operator, &token_id);
    assert!(client.is_approved(&operator, &token_id));
}

#[test]
fn test_approval_for_all() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let operator = Address::generate(&env);
    let contract_id = env.register(BezaMintNft, ());
    let client = BezaMintNftClient::new(&env, &contract_id);
    client.initialize(&admin);

    mint_one(&client, &user, 0);
    assert!(!client.is_approved_for_all(&user, &operator));
    client.set_approval_for_all(&user, &operator, &true);
    assert!(client.is_approved_for_all(&user, &operator));
    client.set_approval_for_all(&user, &operator, &false);
    assert!(!client.is_approved_for_all(&user, &operator));
}

#[test]
fn test_burn_removes_ownership() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let contract_id = env.register(BezaMintNft, ());
    let client = BezaMintNftClient::new(&env, &contract_id);
    client.initialize(&admin);

    let token_id = mint_one(&client, &user, 0);
    client.burn(&token_id);
    assert_eq!(client.balance_of(&user), 0);
}

#[test]
#[should_panic]
fn test_burn_fails_for_nonexistent_token() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let contract_id = env.register(BezaMintNft, ());
    let client = BezaMintNftClient::new(&env, &contract_id);
    client.initialize(&admin);
    client.burn(&999);
}

#[test]
fn test_balance_of_multiple_owners() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let user2 = Address::generate(&env);
    let contract_id = env.register(BezaMintNft, ());
    let client = BezaMintNftClient::new(&env, &contract_id);
    client.initialize(&admin);

    mint_one(&client, &user, 0);
    mint_one(&client, &user, 0);
    mint_one(&client, &user2, 1);
    assert_eq!(client.balance_of(&user), 2);
    assert_eq!(client.balance_of(&user2), 1);
}

#[test]
#[should_panic]
fn test_owner_of_nonexistent_panics() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let contract_id = env.register(BezaMintNft, ());
    let client = BezaMintNftClient::new(&env, &contract_id);
    client.initialize(&admin);
    client.owner_of(&42);
}

#[test]
fn test_token_data_stores_correct_info() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let contract_id = env.register(BezaMintNft, ());
    let client = BezaMintNftClient::new(&env, &contract_id);
    client.initialize(&admin);

    let token_id = client.mint(&user, &5, &String::from_str(&env, "ipfs://col-5/nft-1"));
    let data = client.token_data(&token_id);
    assert_eq!(data.token_id, 1);
    assert_eq!(data.collection_id, 5);
    assert_eq!(data.creator, user);
}

#[test]
fn test_mint_emits_event() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let to = Address::generate(&env);
    let contract = BezaMintNftClient::new(&env, &env.register(BezaMintNft, ()));
    contract.initialize(&admin);
    let token_id = contract.mint(&to, &0, &String::from_str(&env, "ipfs://test"));
    assert_eq!(token_id, 1);
}

#[test]
fn test_transfer_emits_event() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    let contract = BezaMintNftClient::new(&env, &env.register(BezaMintNft, ()));
    contract.initialize(&admin);
    contract.mint(&alice, &0, &String::from_str(&env, "ipfs://test"));
    contract.transfer(&alice, &bob, &1);
    let new_owner = contract.owner_of(&1);
    assert_eq!(new_owner, bob);
}

#[test]
fn test_balance_of_multiple_tokens() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let alice = Address::generate(&env);
    let contract = BezaMintNftClient::new(&env, &env.register(BezaMintNft, ()));
    contract.initialize(&admin);
    contract.mint(&alice, &0, &String::from_str(&env, "ipfs://1"));
    contract.mint(&alice, &0, &String::from_str(&env, "ipfs://2"));
    contract.mint(&alice, &0, &String::from_str(&env, "ipfs://3"));
    assert_eq!(contract.balance_of(&alice), 3);
}

#[test]
fn test_burn_event_emission() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let contract = BezaMintNftClient::new(&env, &env.register(BezaMintNft, ()));
    contract.initialize(&admin);
    contract.mint(&user, &0, &String::from_str(&env, "ipfs://burn"));
    contract.burn(&1);
    assert_eq!(contract.total_supply(), 1);
}
