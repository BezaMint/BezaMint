use soroban_sdk::{
    testutils::{Address as _, Ledger},
    Address, Env, String,
};

use crate::{BezaMintCollection, BezaMintCollectionClient};

fn setup() -> (Env, Address, BezaMintCollectionClient<'static>) {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);

    let contract_id = env.register(BezaMintCollection, ());
    let client = BezaMintCollectionClient::new(&env, &contract_id);

    client.initialize(&admin);
    (env, admin, client)
}

#[test]
fn test_initialize() {
    let (_, _, client) = setup();
    assert_eq!(client.total_collections(), 0);
}

#[test]
fn test_create_collection() {
    let (env, _admin, client) = setup();
    env.ledger().with_mut(|l| l.timestamp = 12345);
    let creator = Address::generate(&env);

    let id = client.create_collection(&creator, &String::from_str(&env, "ipfs://col-meta/1"));
    assert_eq!(id, 1);
    assert_eq!(client.total_collections(), 1);

    let data = client.get_collection(&id);
    assert_eq!(data.id, 1);
    assert_eq!(data.creator, creator);
    assert_eq!(data.nft_count, 0);
    assert!(!data.is_archived);
}

#[test]
fn test_create_multiple_collections() {
    let (env, _admin, client) = setup();
    env.ledger().with_mut(|l| l.timestamp = 12345);
    let c1 = Address::generate(&env);
    let c2 = Address::generate(&env);

    let id1 = client.create_collection(&c1, &String::from_str(&env, "meta1"));
    let id2 = client.create_collection(&c2, &String::from_str(&env, "meta2"));

    assert_eq!(id1, 1);
    assert_eq!(id2, 2);
    assert_eq!(client.total_collections(), 2);
}

#[test]
fn test_update_collection_metadata() {
    let (env, _admin, client) = setup();
    env.ledger().with_mut(|l| l.timestamp = 12345);
    let creator = Address::generate(&env);

    let id = client.create_collection(&creator, &String::from_str(&env, "old-meta"));
    client.update_collection(&creator, &id, &String::from_str(&env, "new-meta"));

    let data = client.get_collection(&id);
    assert_eq!(data.metadata_uri, String::from_str(&env, "new-meta"));
}

#[test]
#[should_panic(expected = "is archived")]
fn test_update_archived_collection_fails() {
    let (env, _admin, client) = setup();
    env.ledger().with_mut(|l| l.timestamp = 12345);
    let creator = Address::generate(&env);

    let id = client.create_collection(&creator, &String::from_str(&env, "meta"));
    client.archive_collection(&creator, &id);
    client.update_collection(&creator, &id, &String::from_str(&env, "should-fail"));
}

#[test]
fn test_archive_collection() {
    let (env, _admin, client) = setup();
    env.ledger().with_mut(|l| l.timestamp = 12345);
    let creator = Address::generate(&env);

    let id = client.create_collection(&creator, &String::from_str(&env, "meta"));
    client.archive_collection(&creator, &id);

    let data = client.get_collection(&id);
    assert!(data.is_archived);
}

#[test]
fn test_add_nft_to_collection() {
    let (env, admin, client) = setup();
    env.ledger().with_mut(|l| l.timestamp = 12345);
    let creator = Address::generate(&env);

    let id = client.create_collection(&creator, &String::from_str(&env, "meta"));
    client.add_nft(&admin, &id, &100);
    client.add_nft(&admin, &id, &101);
    client.add_nft(&admin, &id, &102);

    let data = client.get_collection(&id);
    assert_eq!(data.nft_count, 3);

    let nfts = client.get_nfts_in_collection(&id);
    assert_eq!(nfts.len(), 3);
}

#[test]
fn test_get_collection_for_nft() {
    let (env, admin, client) = setup();
    env.ledger().with_mut(|l| l.timestamp = 12345);
    let creator = Address::generate(&env);

    let id = client.create_collection(&creator, &String::from_str(&env, "meta"));
    client.add_nft(&admin, &id, &42);

    assert_eq!(client.get_collection_for_nft(&42), 1);
}

#[test]
fn test_remove_nft_from_collection() {
    let (env, admin, client) = setup();
    env.ledger().with_mut(|l| l.timestamp = 12345);
    let creator = Address::generate(&env);

    let id = client.create_collection(&creator, &String::from_str(&env, "meta"));
    client.add_nft(&admin, &id, &100);
    client.add_nft(&admin, &id, &101);

    client.remove_nft(&admin, &id, &101);

    let data = client.get_collection(&id);
    assert_eq!(data.nft_count, 1);

    let nfts = client.get_nfts_in_collection(&id);
    assert_eq!(nfts.len(), 1);

    // Removed NFT no longer belongs to a collection
    assert_eq!(client.get_collection_for_nft(&101), 0);
}

#[test]
fn test_get_collections_by_creator() {
    let (env, _admin, client) = setup();
    env.ledger().with_mut(|l| l.timestamp = 12345);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);

    client.create_collection(&alice, &String::from_str(&env, "a1"));
    client.create_collection(&alice, &String::from_str(&env, "a2"));
    client.create_collection(&bob, &String::from_str(&env, "b1"));

    let alice_cols = client.get_collections_by_creator(&alice);
    assert_eq!(alice_cols.len(), 2);

    let bob_cols = client.get_collections_by_creator(&bob);
    assert_eq!(bob_cols.len(), 1);
}

#[test]
#[should_panic(expected = "not found")]
fn test_get_nonexistent_collection_panics() {
    let (_, _, client) = setup();
    client.get_collection(&999);
}

#[test]
fn test_collection_version_tracking() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let creator = Address::generate(&env);
    let contract = BezaMintCollectionClient::new(&env, &env.register(BezaMintCollection, ()));
    contract.initialize(&admin);
    let id = contract.create_collection(&creator, &String::from_str(&env, "ipfs://col"));
    assert_eq!(id, 1);
    let col = contract.get_collection(&id);
    assert_eq!(col.nft_count, 0);
}

#[test]
fn test_collection_archive() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let creator = Address::generate(&env);
    let contract = BezaMintCollectionClient::new(&env, &env.register(BezaMintCollection, ()));
    contract.initialize(&admin);
    let id = contract.create_collection(&creator, &String::from_str(&env, "ipfs://col"));
    contract.archive_collection(&creator, &id);
    let col = contract.get_collection(&id);
    assert!(col.is_archived);
}

