use soroban_sdk::{
    testutils::{Address as _, Events, Ledger},
    xdr::{self, ContractDataDurability, LedgerKey},
    Address, Env, IntoVal, String, Symbol, TryFromVal,
};

use crate::{BezaMintNft, BezaMintNftClient, NftEvent};

/// Decode the single most recent event's data as an `NftEvent` and assert the
/// contract that emitted it. Events are the contract's public interface for
/// indexers and the frontend, so the schema is pinned here.
fn assert_single_nft_event(env: &Env, emitter: &Address, expected: NftEvent) {
    let events = env.events().all();
    assert_eq!(events.len(), 1, "expected exactly one event");
    let (contract, topics, data) = events.get(0).expect("one event");
    assert_eq!(contract.clone(), emitter.clone(), "wrong emitter");
    let topic_symbol: Symbol =
        Symbol::try_from_val(env, &topics.get(0).expect("topic")).expect("topic is a symbol");
    assert_eq!(topic_symbol, Symbol::new(env, "nft"));
    let decoded: NftEvent = NftEvent::try_from_val(env, &data).expect("decodable event");
    assert_eq!(decoded, expected);
}

/// Remaining TTL in ledgers of a specific persistent entry of the NFT
/// contract, or `None` if the entry does not exist.
fn ttl_of(env: &Env, contract_id: &Address, data_key: &xdr::ScVal) -> Option<u32> {
    let contract_addr: xdr::ScAddress = contract_id.clone().into();
    env.as_contract(contract_id, || {
        let storage = env.host().with_mut_storage(|s| Ok(s.map.clone())).unwrap();
        for (key, entry) in storage {
            let LedgerKey::ContractData(data) = key.as_ref() else {
                continue;
            };
            if data.contract != contract_addr {
                continue;
            }
            if data.durability != ContractDataDurability::Persistent {
                continue;
            }
            if &data.key != data_key {
                continue;
            }
            let Some((_entry, Some(live))) = entry else {
                continue;
            };
            return Some(live.saturating_sub(env.ledger().sequence()));
        }
        None
    })
}

fn mint_one(client: &BezaMintNftClient, to: &Address, collection_id: u64) -> u64 {
    client.mint(
        to,
        &collection_id,
        &String::from_str(&client.env, "ipfs://meta/1"),
    )
}

#[test]
fn test_is_initialized_reflects_state() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let client = BezaMintNftClient::new(&env, &env.register(BezaMintNft, ()));
    assert!(!client.is_initialized());
    client.initialize(&admin);
    assert!(client.is_initialized());
}

/// Re-initialization previously reset the admin and the token counter to zero,
/// which let anyone mint over existing token ids and steal ownership of already
/// minted NFTs. The second call must now be rejected outright.
#[test]
#[should_panic(expected = "already initialized")]
fn test_initialize_rejects_double_init() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let attacker = Address::generate(&env);
    let client = BezaMintNftClient::new(&env, &env.register(BezaMintNft, ()));
    client.initialize(&admin);
    client.initialize(&attacker);
}

/// The counter must survive a rejected re-initialization attempt.
#[test]
fn test_initialize_attempt_does_not_reset_counter() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let client = BezaMintNftClient::new(&env, &env.register(BezaMintNft, ()));
    client.initialize(&admin);
    mint_one(&client, &user, 0);

    let reinit = client.try_initialize(&admin);
    assert!(reinit.is_err());
    assert_eq!(client.total_supply(), 1);

    let second = mint_one(&client, &user, 0);
    assert_eq!(second, 2);
}

/// A transfer must invalidate the previous owner's approval, otherwise the old
/// operator could immediately move the token again.
#[test]
fn test_transfer_clears_approval() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    let operator = Address::generate(&env);
    let buyer = Address::generate(&env);
    let client = BezaMintNftClient::new(&env, &env.register(BezaMintNft, ()));
    client.initialize(&admin);

    let token_id = mint_one(&client, &owner, 0);
    client.approve(&operator, &token_id);
    assert!(client.is_approved(&operator, &token_id));

    client.transfer(&owner, &buyer, &token_id);

    assert!(!client.is_approved(&operator, &token_id));
    assert_eq!(client.owner_of(&token_id), buyer);
}

/// Burning a token must not leave a reusable operator approval behind.
#[test]
fn test_burn_clears_approval() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    let operator = Address::generate(&env);
    let client = BezaMintNftClient::new(&env, &env.register(BezaMintNft, ()));
    client.initialize(&admin);

    let token_id = mint_one(&client, &owner, 0);
    client.approve(&operator, &token_id);
    assert!(client.is_approved(&operator, &token_id));

    client.burn(&token_id);

    assert!(!client.is_approved(&operator, &token_id));
}

const ZERO: &str = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

#[test]
#[should_panic(expected = "zero address")]
fn test_transfer_rejects_zero_recipient() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    let client = BezaMintNftClient::new(&env, &env.register(BezaMintNft, ()));
    client.initialize(&admin);

    let token_id = mint_one(&client, &owner, 0);
    client.transfer(&owner, &Address::from_str(&env, ZERO), &token_id);
}

#[test]
#[should_panic(expected = "zero address")]
fn test_transfer_from_rejects_zero_recipient() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    let operator = Address::generate(&env);
    let client = BezaMintNftClient::new(&env, &env.register(BezaMintNft, ()));
    client.initialize(&admin);

    let token_id = mint_one(&client, &owner, 0);
    client.approve(&operator, &token_id);
    client.transfer_from(&operator, &owner, &Address::from_str(&env, ZERO), &token_id);
}

#[test]
#[should_panic(expected = "zero address")]
fn test_approve_rejects_zero_operator() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    let client = BezaMintNftClient::new(&env, &env.register(BezaMintNft, ()));
    client.initialize(&admin);

    let token_id = mint_one(&client, &owner, 0);
    client.approve(&Address::from_str(&env, ZERO), &token_id);
}

#[test]
#[should_panic(expected = "zero address")]
fn test_set_approval_for_all_rejects_zero_operator_when_granting() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    let client = BezaMintNftClient::new(&env, &env.register(BezaMintNft, ()));
    client.initialize(&admin);
    client.set_approval_for_all(&owner, &Address::from_str(&env, ZERO), &true);
}

/// Revoking blanket approval from the sentinel must stay allowed, so a bad
/// grant can always be cleaned up.
#[test]
fn test_set_approval_for_all_allows_zero_when_revoking() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    let client = BezaMintNftClient::new(&env, &env.register(BezaMintNft, ()));
    client.initialize(&admin);
    let zero = Address::from_str(&env, ZERO);
    client.set_approval_for_all(&owner, &zero, &false);
    assert!(!client.is_approved_for_all(&owner, &zero));
}

#[test]
fn test_tokens_of_owner_returns_all_holdings() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    let client = BezaMintNftClient::new(&env, &env.register(BezaMintNft, ()));
    client.initialize(&admin);

    mint_one(&client, &owner, 0);
    mint_one(&client, &owner, 0);
    mint_one(&client, &owner, 0);

    let tokens = client.tokens_of_owner(&owner, &0, &10);
    assert_eq!(tokens, soroban_sdk::vec![&env, 1u64, 2u64, 3u64]);
}

#[test]
fn test_tokens_of_owner_paginates() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    let client = BezaMintNftClient::new(&env, &env.register(BezaMintNft, ()));
    client.initialize(&admin);

    for _ in 0..5 {
        mint_one(&client, &owner, 0);
    }

    assert_eq!(
        client.tokens_of_owner(&owner, &0, &2),
        soroban_sdk::vec![&env, 1u64, 2u64]
    );
    assert_eq!(
        client.tokens_of_owner(&owner, &2, &2),
        soroban_sdk::vec![&env, 3u64, 4u64]
    );
    // Final, short page.
    assert_eq!(
        client.tokens_of_owner(&owner, &4, &2),
        soroban_sdk::vec![&env, 5u64]
    );
}

#[test]
fn test_tokens_of_owner_empty_and_out_of_range() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    let stranger = Address::generate(&env);
    let client = BezaMintNftClient::new(&env, &env.register(BezaMintNft, ()));
    client.initialize(&admin);

    assert_eq!(client.tokens_of_owner(&stranger, &0, &10).len(), 0);

    mint_one(&client, &owner, 0);
    assert_eq!(client.tokens_of_owner(&owner, &5, &10).len(), 0);
}

#[test]
fn test_tokens_of_owner_clamps_limit_to_max_page_size() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    let client = BezaMintNftClient::new(&env, &env.register(BezaMintNft, ()));
    client.initialize(&admin);

    for _ in 0..3 {
        mint_one(&client, &owner, 0);
    }

    // A caller cannot force an unbounded page by passing u32::MAX.
    let tokens = client.tokens_of_owner(&owner, &0, &u32::MAX);
    assert_eq!(tokens.len(), 3);
}

/// Swap-removal must keep the dense index consistent through transfers.
#[test]
fn test_balance_and_enumeration_track_transfers() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    let client = BezaMintNftClient::new(&env, &env.register(BezaMintNft, ()));
    client.initialize(&admin);

    for _ in 0..4 {
        mint_one(&client, &alice, 0);
    }
    assert_eq!(client.balance_of(&alice), 4);

    // Move an interior token so the swap-with-last path is exercised.
    client.transfer(&alice, &bob, &2);
    assert_eq!(client.balance_of(&alice), 3);
    assert_eq!(client.balance_of(&bob), 1);
    assert_eq!(client.owner_of(&2), bob);

    let alice_tokens = client.tokens_of_owner(&alice, &0, &10);
    assert_eq!(alice_tokens.len(), 3);
    assert!(!alice_tokens.contains(2));
    assert_eq!(
        client.tokens_of_owner(&bob, &0, &10),
        soroban_sdk::vec![&env, 2u64]
    );

    // The index must survive a second move out of the same wallet.
    client.transfer(&alice, &bob, &4);
    assert_eq!(client.balance_of(&alice), 2);
    assert_eq!(client.balance_of(&bob), 2);
    assert_eq!(client.tokens_of_owner(&bob, &0, &10).len(), 2);
}

/// Burning must remove the token from the owner index as well as from supply.
#[test]
fn test_balance_reflects_burn() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    let client = BezaMintNftClient::new(&env, &env.register(BezaMintNft, ()));
    client.initialize(&admin);

    mint_one(&client, &owner, 0);
    mint_one(&client, &owner, 0);
    mint_one(&client, &owner, 0);

    client.burn(&1);

    assert_eq!(client.balance_of(&owner), 2);
    let tokens = client.tokens_of_owner(&owner, &0, &10);
    assert_eq!(tokens.len(), 2);
    assert!(!tokens.contains(1));
}

/// A per-token approval must actually let the operator move the token.
#[test]
fn test_transfer_from_with_per_token_approval() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    let operator = Address::generate(&env);
    let recipient = Address::generate(&env);
    let client = BezaMintNftClient::new(&env, &env.register(BezaMintNft, ()));
    client.initialize(&admin);

    let token_id = mint_one(&client, &owner, 0);
    client.approve(&operator, &token_id);

    client.transfer_from(&operator, &owner, &recipient, &token_id);

    assert_eq!(client.owner_of(&token_id), recipient);
    // The approval is consumed by the transfer.
    assert!(!client.is_approved(&operator, &token_id));
}

/// Blanket approval must let the operator move any token the owner holds.
#[test]
fn test_transfer_from_with_operator_approval() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    let operator = Address::generate(&env);
    let recipient = Address::generate(&env);
    let client = BezaMintNftClient::new(&env, &env.register(BezaMintNft, ()));
    client.initialize(&admin);

    let token_id = mint_one(&client, &owner, 0);
    client.set_approval_for_all(&owner, &operator, &true);

    client.transfer_from(&operator, &owner, &recipient, &token_id);

    assert_eq!(client.owner_of(&token_id), recipient);
    // Blanket approval is a standing grant and survives the transfer.
    assert!(client.is_approved_for_all(&owner, &operator));
}

#[test]
#[should_panic(expected = "spender is not approved")]
fn test_transfer_from_rejects_unapproved_spender() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    let attacker = Address::generate(&env);
    let recipient = Address::generate(&env);
    let client = BezaMintNftClient::new(&env, &env.register(BezaMintNft, ()));
    client.initialize(&admin);

    let token_id = mint_one(&client, &owner, 0);
    client.transfer_from(&attacker, &owner, &recipient, &token_id);
}

#[test]
#[should_panic(expected = "from is not the token owner")]
fn test_transfer_from_rejects_wrong_from() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    let operator = Address::generate(&env);
    let recipient = Address::generate(&env);
    let client = BezaMintNftClient::new(&env, &env.register(BezaMintNft, ()));
    client.initialize(&admin);

    let token_id = mint_one(&client, &owner, 0);
    client.set_approval_for_all(&operator, &operator, &true);
    // The operator holds blanket approval for itself, not for `owner`.
    client.transfer_from(&operator, &operator, &recipient, &token_id);
}

#[test]
#[should_panic(expected = "not found")]
fn test_transfer_from_rejects_nonexistent_token() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let spender = Address::generate(&env);
    let recipient = Address::generate(&env);
    let client = BezaMintNftClient::new(&env, &env.register(BezaMintNft, ()));
    client.initialize(&admin);
    client.transfer_from(&spender, &spender, &recipient, &999);
}

/// A stale approval must not survive a change of ownership and be reused.
#[test]
fn test_transfer_from_cannot_reuse_consumed_approval() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    let operator = Address::generate(&env);
    let first_buyer = Address::generate(&env);
    let second_buyer = Address::generate(&env);
    let client = BezaMintNftClient::new(&env, &env.register(BezaMintNft, ()));
    client.initialize(&admin);

    let token_id = mint_one(&client, &owner, 0);
    client.approve(&operator, &token_id);
    client.transfer_from(&operator, &owner, &first_buyer, &token_id);

    // The operator was approved by `owner`, not by `first_buyer`.
    let retry = client.try_transfer_from(&operator, &first_buyer, &second_buyer, &token_id);
    assert!(retry.is_err());
    assert_eq!(client.owner_of(&token_id), first_buyer);
}

/// `approve` sets a single "current" operator, matching ERC-721 `getApproved`:
/// approving someone new replaces any previous approval.
#[test]
fn test_approve_replaces_previous_operator() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    let first = Address::generate(&env);
    let second = Address::generate(&env);
    let client = BezaMintNftClient::new(&env, &env.register(BezaMintNft, ()));
    client.initialize(&admin);

    let token_id = mint_one(&client, &owner, 0);
    client.approve(&first, &token_id);
    client.approve(&second, &token_id);

    assert!(!client.is_approved(&first, &token_id));
    assert!(client.is_approved(&second, &token_id));
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
#[should_panic]
fn test_mint_requires_recipient_auth() {
    let env = Env::default();
    // Do NOT mock auth: mint must fail because the recipient never authorized.
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let contract = BezaMintNftClient::new(&env, &env.register(BezaMintNft, ()));
    contract.initialize(&admin);
    // Only the admin's initialize is authorized; the mint must be rejected.
    contract.mint(&user, &0, &String::from_str(&env, "ipfs://meta"));
}

#[test]
#[should_panic(expected = "metadata URI cannot be empty")]
fn test_mint_rejects_empty_metadata() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let contract = BezaMintNftClient::new(&env, &env.register(BezaMintNft, ()));
    contract.initialize(&admin);
    contract.mint(&user, &0, &String::from_str(&env, ""));
}

#[test]
#[should_panic(expected = "metadata URI exceeds 512 chars")]
fn test_mint_rejects_oversized_metadata() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let contract = BezaMintNftClient::new(&env, &env.register(BezaMintNft, ()));
    contract.initialize(&admin);
    let long_uri = "x".repeat(513);
    contract.mint(&user, &0, &String::from_str(&env, &long_uri));
}

/// An arbitrary URI scheme is a stored-XSS vector: the frontend renders the
/// metadata URI into the DOM. Only https/http/ipfs may be stored.
#[test]
#[should_panic(expected = "must use an https, http or ipfs scheme")]
fn test_mint_rejects_javascript_uri() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let contract = BezaMintNftClient::new(&env, &env.register(BezaMintNft, ()));
    contract.initialize(&admin);
    contract.mint(&user, &0, &String::from_str(&env, "javascript:alert(1)"));
}

#[test]
#[should_panic(expected = "must use an https, http or ipfs scheme")]
fn test_mint_rejects_data_uri() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let contract = BezaMintNftClient::new(&env, &env.register(BezaMintNft, ()));
    contract.initialize(&admin);
    contract.mint(
        &user,
        &0,
        &String::from_str(&env, "data:text/html,<script>1</script>"),
    );
}

#[test]
fn test_mint_accepts_http_uri() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let contract = BezaMintNftClient::new(&env, &env.register(BezaMintNft, ()));
    contract.initialize(&admin);
    contract.mint(
        &user,
        &0,
        &String::from_str(&env, "https://cdn.example.com/1.json"),
    );
    assert_eq!(contract.total_supply(), 1);
}

#[test]
#[should_panic(expected = "zero address is not allowed as mint recipient")]
fn test_mint_rejects_zero_address() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let contract = BezaMintNftClient::new(&env, &env.register(BezaMintNft, ()));
    contract.initialize(&admin);
    let zero = Address::from_str(
        &env,
        "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
    );
    contract.mint(&zero, &0, &String::from_str(&env, "ipfs://meta"));
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

/// Every state-changing operation must emit exactly one well-formed event:
/// mint, transfer, transfer_from, approve, burn.
#[test]
fn test_events_cover_mint_transfer_approve_burn() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    let contract_id = env.register(BezaMintNft, ());
    let contract = BezaMintNftClient::new(&env, &contract_id);
    contract.initialize(&admin);

    contract.mint(&alice, &0, &String::from_str(&env, "ipfs://events"));
    assert_single_nft_event(&env, &contract_id, NftEvent::Minted(1, alice.clone()));

    contract.approve(&bob, &1);
    assert_single_nft_event(&env, &contract_id, NftEvent::Approved(1, bob.clone()));

    contract.transfer_from(&bob, &alice, &bob, &1);
    assert_single_nft_event(
        &env,
        &contract_id,
        NftEvent::Transferred(1, alice.clone(), bob.clone()),
    );

    contract.transfer(&bob, &alice, &1);
    assert_single_nft_event(
        &env,
        &contract_id,
        NftEvent::Transferred(1, bob.clone(), alice.clone()),
    );

    contract.burn(&1);
    assert_single_nft_event(&env, &contract_id, NftEvent::Burned(1, alice.clone()));
}

/// The TTL policy must actually keep NFT records alive: after a mint every
/// persistent entry written for the NFT (owner, data, ownership index) must
/// carry a live-until ledger at least `TTL_THRESHOLD` ledgers in the future.
/// Without this an entry can silently archive and the NFT reads as missing
/// even though the counter says it exists.
#[test]
fn test_mint_extends_persistent_ttl() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let contract_id = env.register(BezaMintNft, ());
    let contract = BezaMintNftClient::new(&env, &contract_id);
    contract.initialize(&admin);
    contract.mint(&user, &0, &String::from_str(&env, "ipfs://ttl"));
    let contract_addr: xdr::ScAddress = contract_id.clone().into();
    let storage = env.as_contract(&contract_id, || {
        env.host().with_mut_storage(|s| Ok(s.map.clone())).unwrap()
    });
    let ledger_seq = env.ledger().sequence();
    let mut checked = 0u32;
    for (key, entry) in storage {
        let LedgerKey::ContractData(data) = key.as_ref() else {
            continue;
        };
        if data.contract != contract_addr {
            continue;
        }
        if data.durability != ContractDataDurability::Persistent {
            continue;
        }
        let Some((_entry, live_until)) = entry else {
            continue;
        };
        checked += 1;
        let live = live_until.expect("persistent entry must have a TTL");
        assert!(
            live.saturating_sub(ledger_seq) >= crate::TTL_THRESHOLD,
            "entry not extended: live-until {live}, sequence {ledger_seq}"
        );
    }
    assert!(
        checked >= 1,
        "no persistent entries found for the NFT contract"
    );
}
/// A transfer is also a write: an ownership record that has lapsed past
/// half-life must be refreshed to the full TTL again when it moves, so a
/// long-held but actively traded NFT can never archive.
#[test]
fn test_transfer_refreshes_owner_ttl() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    let contract_id = env.register(BezaMintNft, ());
    let contract = BezaMintNftClient::new(&env, &contract_id);
    contract.initialize(&admin);
    contract.mint(&alice, &0, &String::from_str(&env, "ipfs://ttl"));

    let owner_val: soroban_sdk::Val = crate::NftKey::Owner(1).into_val(&env);
    let owner_key: xdr::ScVal = xdr::ScVal::try_from_val(&env, &owner_val).unwrap();

    // Fast-forward most of the way through the TTL window so the ownership
    // record has lapsed past half-life and would archive if left untouched.
    env.ledger().with_mut(|l| {
        l.sequence_number += crate::TTL_THRESHOLD;
    });
    let before = ttl_of(&env, &contract_id, &owner_key).expect("owner entry exists");
    assert!(before < crate::TTL_THRESHOLD);

    contract.transfer(&alice, &bob, &1);

    let after = ttl_of(&env, &contract_id, &owner_key).expect("owner entry exists");
    assert!(after >= crate::TTL_THRESHOLD);
}

/// Upgrade is admin-gated: without the admin's authorization the code swap
/// must be rejected. This is the only path that can change a deployed
/// contract's behaviour, so its guard is security-critical.
#[test]
fn test_upgrade_requires_admin_auth() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let contract_id = env.register(BezaMintNft, ());
    let client = BezaMintNftClient::new(&env, &contract_id);
    client.initialize(&admin);

    // Replace the mocked auths with none: require_auth must reject.
    env.mock_auths(&[]);
    let hash = soroban_sdk::BytesN::from_array(&env, &[0u8; 32]);
    assert!(client.try_upgrade(&hash).is_err());
}

/// An uninitialized contract has no admin to authorize the upgrade.
#[test]
#[should_panic(expected = "not initialized")]
fn test_upgrade_requires_initialization() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(BezaMintNft, ());
    let client = BezaMintNftClient::new(&env, &contract_id);
    client.upgrade(&soroban_sdk::BytesN::from_array(&env, &[0u8; 32]));
}
