use soroban_sdk::{
    testutils::{Address as _, Ledger, MockAuth, MockAuthInvoke},
    Address, Env, IntoVal, String,
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

    let id1 = client.create_collection(&c1, &String::from_str(&env, "ipfs://meta1"));
    let id2 = client.create_collection(&c2, &String::from_str(&env, "ipfs://meta2"));

    assert_eq!(id1, 1);
    assert_eq!(id2, 2);
    assert_eq!(client.total_collections(), 2);
}

#[test]
fn test_update_collection_metadata() {
    let (env, _admin, client) = setup();
    env.ledger().with_mut(|l| l.timestamp = 12345);
    let creator = Address::generate(&env);

    let id = client.create_collection(&creator, &String::from_str(&env, "ipfs://old-meta"));
    client.update_collection(&creator, &id, &String::from_str(&env, "ipfs://new-meta"));

    let data = client.get_collection(&id);
    assert_eq!(data.metadata_uri, String::from_str(&env, "ipfs://new-meta"));
}

#[test]
#[should_panic(expected = "is archived")]
fn test_update_archived_collection_fails() {
    let (env, _admin, client) = setup();
    env.ledger().with_mut(|l| l.timestamp = 12345);
    let creator = Address::generate(&env);

    let id = client.create_collection(&creator, &String::from_str(&env, "ipfs://meta"));
    client.archive_collection(&creator, &id);
    client.update_collection(&creator, &id, &String::from_str(&env, "ipfs://should-fail"));
}

#[test]
fn test_archive_collection() {
    let (env, _admin, client) = setup();
    env.ledger().with_mut(|l| l.timestamp = 12345);
    let creator = Address::generate(&env);

    let id = client.create_collection(&creator, &String::from_str(&env, "ipfs://meta"));
    client.archive_collection(&creator, &id);

    let data = client.get_collection(&id);
    assert!(data.is_archived);
}

#[test]
fn test_add_nft_to_collection() {
    let (env, _admin, client) = setup();
    env.ledger().with_mut(|l| l.timestamp = 12345);
    let creator = Address::generate(&env);

    let id = client.create_collection(&creator, &String::from_str(&env, "ipfs://meta"));
    client.add_nft(&id, &100);
    client.add_nft(&id, &101);
    client.add_nft(&id, &102);

    let data = client.get_collection(&id);
    assert_eq!(data.nft_count, 3);

    let nfts = client.get_nfts_in_collection(&id, &0, &100);
    assert_eq!(nfts.len(), 3);
}

#[test]
fn test_get_collection_for_nft() {
    let (env, _admin, client) = setup();
    env.ledger().with_mut(|l| l.timestamp = 12345);
    let creator = Address::generate(&env);

    let id = client.create_collection(&creator, &String::from_str(&env, "ipfs://meta"));
    client.add_nft(&id, &42);

    assert_eq!(client.get_collection_for_nft(&42), 1);
}

#[test]
fn test_remove_nft_from_collection() {
    let (env, _admin, client) = setup();
    env.ledger().with_mut(|l| l.timestamp = 12345);
    let creator = Address::generate(&env);

    let id = client.create_collection(&creator, &String::from_str(&env, "ipfs://meta"));
    client.add_nft(&id, &100);
    client.add_nft(&id, &101);

    client.remove_nft(&id, &101);

    let data = client.get_collection(&id);
    assert_eq!(data.nft_count, 1);

    let nfts = client.get_nfts_in_collection(&id, &0, &100);
    assert_eq!(nfts.len(), 1);

    // Removed NFT no longer belongs to a collection
    assert_eq!(client.get_collection_for_nft(&101), 0);
}

#[test]
#[should_panic(expected = "metadata URI cannot be empty")]
fn test_update_collection_rejects_empty_uri() {
    let (env, _admin, client) = setup();
    let creator = Address::generate(&env);
    let id = client.create_collection(&creator, &String::from_str(&env, "ipfs://meta"));
    client.update_collection(&creator, &id, &String::from_str(&env, ""));
}

#[test]
#[should_panic(expected = "metadata URI exceeds 512 chars")]
fn test_update_collection_rejects_oversized_uri() {
    let (env, _admin, client) = setup();
    let creator = Address::generate(&env);
    let id = client.create_collection(&creator, &String::from_str(&env, "ipfs://meta"));
    let long_uri = "x".repeat(513);
    client.update_collection(&creator, &id, &String::from_str(&env, &long_uri));
}

/// The 512-character boundary must remain accepted, guarding against an
/// off-by-one when the limit is refactored into a shared constant.
#[test]
fn test_update_collection_accepts_boundary_uri() {
    let (env, _admin, client) = setup();
    let creator = Address::generate(&env);
    let id = client.create_collection(&creator, &String::from_str(&env, "ipfs://meta"));
    // 512 chars total, including a valid scheme, so only the length bound is exercised.
    let mut bytes = b"ipfs://".to_vec();
    bytes.extend(core::iter::repeat_n(b'x', 505));
    let boundary = String::from_bytes(&env, &bytes);
    client.update_collection(&creator, &id, &boundary);
    assert_eq!(client.get_collection(&id).metadata_uri.len(), 512);
}

/// An arbitrary URI scheme is a stored-XSS vector: the frontend renders
/// collection metadata URIs into the DOM. Create and update must both reject
/// it, consistently with the NFT and Creator contracts.
#[test]
#[should_panic(expected = "must use an https, http or ipfs scheme")]
fn test_create_collection_rejects_javascript_uri() {
    let (env, _admin, client) = setup();
    let creator = Address::generate(&env);
    client.create_collection(&creator, &String::from_str(&env, "javascript:alert(1)"));
}

#[test]
#[should_panic(expected = "must use an https, http or ipfs scheme")]
fn test_update_collection_rejects_data_uri() {
    let (env, _admin, client) = setup();
    let creator = Address::generate(&env);
    let id = client.create_collection(&creator, &String::from_str(&env, "ipfs://meta"));
    client.update_collection(
        &creator,
        &id,
        &String::from_str(&env, "data:text/html,<script>1</script>"),
    );
}

#[test]
fn test_create_collection_accepts_http_uri() {
    let (env, _admin, client) = setup();
    let creator = Address::generate(&env);
    let id = client.create_collection(
        &creator,
        &String::from_str(&env, "https://example.com/meta.json"),
    );
    assert_eq!(
        client.get_collection(&id).metadata_uri,
        String::from_str(&env, "https://example.com/meta.json")
    );
}

/// `add_nft` must require the collection creator's authorization. Only the
/// creator's `create_collection` call is mocked here, so the follow-up
/// `add_nft` has no valid auth entry for that invocation and must be rejected.
///
/// This is the regression test for the removed `_admin` parameter: previously
/// the stored admin authorized the call, so creator-owned collections could be
/// mutated by the deployer and no caller-supplied address was ever checked.
#[test]
#[should_panic]
fn test_add_nft_requires_creator_auth() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let creator = Address::generate(&env);
    let contract_id = env.register(BezaMintCollection, ());
    let client = BezaMintCollectionClient::new(&env, &contract_id);

    let init_auth = MockAuth {
        address: &admin,
        invoke: &MockAuthInvoke {
            contract: &contract_id,
            fn_name: "initialize",
            args: (&admin,).into_val(&env),
            sub_invokes: &[],
        },
    };
    env.mock_auths(&[init_auth]);
    client.initialize(&admin);

    let create_auth = MockAuth {
        address: &creator,
        invoke: &MockAuthInvoke {
            contract: &contract_id,
            fn_name: "create_collection",
            args: (creator.clone(), String::from_str(&env, "ipfs://meta")).into_val(&env),
            sub_invokes: &[],
        },
    };
    env.mock_auths(&[create_auth]);
    let id = client.create_collection(&creator, &String::from_str(&env, "ipfs://meta"));

    client.add_nft(&id, &1);
}

#[test]
#[should_panic(expected = "already belongs to a collection")]
fn test_add_nft_rejects_duplicate_token() {
    let (env, _admin, client) = setup();
    let creator = Address::generate(&env);
    let id = client.create_collection(&creator, &String::from_str(&env, "ipfs://meta"));

    client.add_nft(&id, &100);
    client.add_nft(&id, &100);
}

/// A token may not be smuggled into a second collection while still mapped to
/// its first one, otherwise `get_collection_for_nft` and the reverse lookup
/// would disagree.
#[test]
#[should_panic(expected = "already belongs to a collection")]
fn test_add_nft_rejects_token_in_another_collection() {
    let (env, _admin, client) = setup();
    let creator = Address::generate(&env);
    let first = client.create_collection(&creator, &String::from_str(&env, "ipfs://first"));
    let second = client.create_collection(&creator, &String::from_str(&env, "ipfs://second"));

    client.add_nft(&first, &7);
    client.add_nft(&second, &7);
}

#[test]
fn test_add_nft_count_matches_distinct_tokens() {
    let (env, _admin, client) = setup();
    let creator = Address::generate(&env);
    let id = client.create_collection(&creator, &String::from_str(&env, "ipfs://meta"));

    client.add_nft(&id, &1);
    client.add_nft(&id, &2);

    let data = client.get_collection(&id);
    assert_eq!(data.nft_count, 2);
    assert_eq!(client.get_nfts_in_collection(&id, &0, &100).len(), 2);
}

/// Pagination: a page of the membership vector must respect start/limit and
/// return an empty page past the end, so a full collection can be enumerated
/// without one unbounded read.
#[test]
fn test_get_nfts_in_collection_paginates() {
    let (env, _admin, client) = setup();
    let creator = Address::generate(&env);
    let id = client.create_collection(&creator, &String::from_str(&env, "ipfs://meta"));

    for token in 1..=5 {
        client.add_nft(&id, &token);
    }

    assert_eq!(client.get_nfts_in_collection(&id, &0, &2).len(), 2);
    let page2 = client.get_nfts_in_collection(&id, &2, &2);
    assert_eq!(page2.len(), 2);
    assert_eq!(page2.get(0).unwrap(), 3);
    assert_eq!(client.get_nfts_in_collection(&id, &5, &100).len(), 0);
    // The limit is clamped to MAX_PAGE_SIZE.
    assert_eq!(client.get_nfts_in_collection(&id, &0, &1_000_000).len(), 5);
}

/// Removing a token that is not a member must not corrupt the count.
#[test]
fn test_remove_unknown_nft_is_idempotent() {
    let (env, _admin, client) = setup();
    let creator = Address::generate(&env);
    let id = client.create_collection(&creator, &String::from_str(&env, "ipfs://meta"));

    client.add_nft(&id, &1);
    client.remove_nft(&id, &999);

    let data = client.get_collection(&id);
    assert_eq!(data.nft_count, 1);
    assert_eq!(client.get_nfts_in_collection(&id, &0, &100).len(), 1);
}

#[test]
fn test_get_collections_by_creator() {
    let (env, _admin, client) = setup();
    env.ledger().with_mut(|l| l.timestamp = 12345);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);

    client.create_collection(&alice, &String::from_str(&env, "ipfs://a1"));
    client.create_collection(&alice, &String::from_str(&env, "ipfs://a2"));
    client.create_collection(&bob, &String::from_str(&env, "ipfs://b1"));

    let alice_cols = client.get_collections_by_creator(&alice, &0, &100);
    assert_eq!(alice_cols.len(), 2);

    let bob_cols = client.get_collections_by_creator(&bob, &0, &100);
    assert_eq!(bob_cols.len(), 1);
}

#[test]
fn test_get_collections_by_creator_paginates() {
    let (env, _admin, client) = setup();
    let alice = Address::generate(&env);
    for label in ["a1", "a2", "a3", "a4", "a5"] {
        let mut bytes = b"ipfs://".to_vec();
        bytes.extend_from_slice(label.as_bytes());
        let uri = String::from_bytes(&env, &bytes);
        client.create_collection(&alice, &uri);
    }

    assert_eq!(
        client.get_collections_by_creator(&alice, &0, &2),
        soroban_sdk::vec![&env, 1u64, 2u64]
    );
    assert_eq!(
        client.get_collections_by_creator(&alice, &4, &2),
        soroban_sdk::vec![&env, 5u64]
    );
    // Out-of-range offset yields an empty page rather than panicking.
    assert_eq!(client.get_collections_by_creator(&alice, &9, &2).len(), 0);
}

#[test]
fn test_get_collections_by_creator_excludes_archived() {
    let (env, _admin, client) = setup();
    let alice = Address::generate(&env);
    let keep = client.create_collection(&alice, &String::from_str(&env, "ipfs://keep"));
    let drop = client.create_collection(&alice, &String::from_str(&env, "ipfs://drop"));
    client.archive_collection(&alice, &drop);

    let listed = client.get_collections_by_creator(&alice, &0, &100);
    assert_eq!(listed.len(), 1);
    assert_eq!(listed.get(0).unwrap(), keep);
}

/// A creator with no collections, and an address that never interacted with the
/// contract, must both return an empty list rather than fail.
#[test]
fn test_get_collections_by_creator_empty_for_unknown_address() {
    let (env, _admin, client) = setup();
    let stranger = Address::generate(&env);
    assert_eq!(
        client.get_collections_by_creator(&stranger, &0, &100).len(),
        0
    );
}

#[test]
#[should_panic(expected = "not the collection creator")]
fn test_update_collection_by_non_owner_fails() {
    let (env, _admin, client) = setup();
    env.ledger().with_mut(|l| l.timestamp = 12345);
    let creator = Address::generate(&env);
    let attacker = Address::generate(&env);

    let id = client.create_collection(&creator, &String::from_str(&env, "ipfs://meta"));
    client.update_collection(&attacker, &id, &String::from_str(&env, "ipfs://hacked"));
}

#[test]
#[should_panic(expected = "not the collection creator")]
fn test_archive_collection_by_non_owner_fails() {
    let (env, _admin, client) = setup();
    env.ledger().with_mut(|l| l.timestamp = 12345);
    let creator = Address::generate(&env);
    let attacker = Address::generate(&env);

    let id = client.create_collection(&creator, &String::from_str(&env, "ipfs://meta"));
    client.archive_collection(&attacker, &id);
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
    env.mock_all_auths();
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
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let creator = Address::generate(&env);
    let contract = BezaMintCollectionClient::new(&env, &env.register(BezaMintCollection, ()));
    contract.initialize(&admin);
    let id = contract.create_collection(&creator, &String::from_str(&env, "ipfs://col"));
    contract.archive_collection(&creator, &id);
    let col = contract.get_collection(&id);
    assert!(col.is_archived);
}
