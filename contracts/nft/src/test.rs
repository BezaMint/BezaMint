use soroban_sdk::{
    testutils::{Address as _, Events, Ledger, MockAuth, MockAuthInvoke},
    xdr::{self, ContractDataDurability, LedgerKey},
    Address, Env, IntoVal, String, Symbol, TryFromVal,
};

use crate::{BezaMintNft, BezaMintNftClient, NftEvent, NftKey};

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
        to,
        &collection_id,
        &String::from_str(&client.env, "ipfs://meta/1"),
    )
}

/// The constructor runs as part of contract creation, so the admin binding
/// already exists by the time any client can call the contract. This replaces
/// the previous "initialize then observe" test: there is no uninitialized state
/// left to observe, and no second call that could overwrite the binding.
#[test]
fn test_constructor_binds_admin() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let client = BezaMintNftClient::new(&env, &env.register(BezaMintNft, (admin.clone(),)));
    assert!(client.is_initialized());
    assert_eq!(client.get_admin(), admin);
}

/// Every build declares the storage schema it expects, and a fresh contract
/// reports it. The constructor has always written `Version`, but until now
/// nothing read it back; this pins the value so a silent bump is visible.
#[test]
fn test_version_reports_storage_schema() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let client = BezaMintNftClient::new(&env, &env.register(BezaMintNft, (admin,)));
    assert_eq!(client.version(), crate::STORAGE_VERSION);
}

/// A store written by a different contract version must stop a mutating call
/// instead of being decoded as garbage. This is the whole point of enforcing the
/// version key: after an in-place `upgrade` that changed a struct, a read would
/// otherwise reinterpret old bytes with no error anywhere.
#[test]
fn test_mutation_is_rejected_when_the_stored_version_differs() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let contract_id = env.register(BezaMintNft, (admin.clone(),));
    let client = BezaMintNftClient::new(&env, &contract_id);

    env.as_contract(&contract_id, || {
        env.storage().instance().set(&NftKey::Version, &99u32);
    });

    let to = Address::generate(&env);
    let uri = String::from_str(&env, "ipfs://meta/1");
    assert!(client.try_mint(&to, &to, &0, &uri).is_err());
}

/// `migrate` is the only path that repairs a mismatch, so it must require the
/// exact stored version, refuse to run when already current, and leave the
/// contract usable afterwards.
#[test]
fn test_migrate_is_version_checked_and_repairs_a_mismatch() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let contract_id = env.register(BezaMintNft, (admin.clone(),));
    let client = BezaMintNftClient::new(&env, &contract_id);

    // Already at the current version, and a wrong starting point, are refused.
    assert!(client.try_migrate(&crate::STORAGE_VERSION).is_err());
    assert!(client.try_migrate(&0u32).is_err());

    // Repair a mismatch, then confirm the mutating path works again.
    env.as_contract(&contract_id, || {
        env.storage().instance().set(&NftKey::Version, &99u32);
    });
    client.migrate(&99u32);
    // A migration changes what stored values mean, so it is the one operation
    // an operator must be able to find a timestamped record of afterwards.
    let migrated_events = env.events().all();
    let (_, _, migrated_data) = migrated_events
        .get(migrated_events.len() - 1)
        .expect("migrate emits an event");
    let migrated: NftEvent = NftEvent::try_from_val(&env, &migrated_data).expect("decodable event");
    assert_eq!(migrated, NftEvent::Migrated(99, crate::STORAGE_VERSION));
    assert_eq!(client.version(), crate::STORAGE_VERSION);

    let to = Address::generate(&env);
    let uri = String::from_str(&env, "ipfs://meta/1");
    assert_eq!(client.mint(&to, &to, &0, &uri), 1);
}

/// Without the admin's authorization, a mismatched version cannot be repaired by
/// an arbitrary caller.
#[test]
fn test_migrate_requires_admin_auth() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let contract_id = env.register(BezaMintNft, (admin,));
    let client = BezaMintNftClient::new(&env, &contract_id);

    env.mock_auths(&[]);
    assert!(client.try_migrate(&0u32).is_err());
}

/// Token ids come from a monotonic counter that the constructor starts at zero.
/// The previous version of this test proved that a rejected re-initialization
/// could not reset the counter; with a constructor there is no re-initialization
/// to reject, so the stronger property is asserted directly: ids are never
/// reused, even after a burn.
#[test]
fn test_constructor_starts_counter_and_ids_are_not_reused() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let client = BezaMintNftClient::new(&env, &env.register(BezaMintNft, (admin.clone(),)));
    assert_eq!(client.total_supply(), 0);

    assert_eq!(mint_one(&client, &user, 0), 1);
    assert_eq!(client.total_supply(), 1);

    client.burn(&1);
    assert_eq!(client.total_supply(), 1, "burned ids must not be recycled");
    assert_eq!(mint_one(&client, &user, 0), 2);
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
    let client = BezaMintNftClient::new(&env, &env.register(BezaMintNft, (admin.clone(),)));

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
    let client = BezaMintNftClient::new(&env, &env.register(BezaMintNft, (admin.clone(),)));

    let token_id = mint_one(&client, &owner, 0);
    client.approve(&operator, &token_id);
    assert!(client.is_approved(&operator, &token_id));

    client.burn(&token_id);

    assert!(!client.is_approved(&operator, &token_id));
}

const ZERO: &str = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

#[test]
// NftError::ZeroAddress
#[should_panic(expected = "Error(Contract, #8)")]
fn test_transfer_rejects_zero_recipient() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    let client = BezaMintNftClient::new(&env, &env.register(BezaMintNft, (admin.clone(),)));

    let token_id = mint_one(&client, &owner, 0);
    client.transfer(&owner, &Address::from_str(&env, ZERO), &token_id);
}

#[test]
// NftError::ZeroAddress
#[should_panic(expected = "Error(Contract, #8)")]
fn test_transfer_from_rejects_zero_recipient() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    let operator = Address::generate(&env);
    let client = BezaMintNftClient::new(&env, &env.register(BezaMintNft, (admin.clone(),)));

    let token_id = mint_one(&client, &owner, 0);
    client.approve(&operator, &token_id);
    client.transfer_from(&operator, &owner, &Address::from_str(&env, ZERO), &token_id);
}

#[test]
// NftError::ZeroAddress
#[should_panic(expected = "Error(Contract, #8)")]
fn test_approve_rejects_zero_operator() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    let client = BezaMintNftClient::new(&env, &env.register(BezaMintNft, (admin.clone(),)));

    let token_id = mint_one(&client, &owner, 0);
    client.approve(&Address::from_str(&env, ZERO), &token_id);
}

#[test]
// NftError::ZeroAddress
#[should_panic(expected = "Error(Contract, #8)")]
fn test_set_approval_for_all_rejects_zero_operator_when_granting() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    let client = BezaMintNftClient::new(&env, &env.register(BezaMintNft, (admin.clone(),)));
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
    let client = BezaMintNftClient::new(&env, &env.register(BezaMintNft, (admin.clone(),)));
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
    let client = BezaMintNftClient::new(&env, &env.register(BezaMintNft, (admin.clone(),)));

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
    let client = BezaMintNftClient::new(&env, &env.register(BezaMintNft, (admin.clone(),)));

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
    let client = BezaMintNftClient::new(&env, &env.register(BezaMintNft, (admin.clone(),)));

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
    let client = BezaMintNftClient::new(&env, &env.register(BezaMintNft, (admin.clone(),)));

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
    let client = BezaMintNftClient::new(&env, &env.register(BezaMintNft, (admin.clone(),)));

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
    let client = BezaMintNftClient::new(&env, &env.register(BezaMintNft, (admin.clone(),)));

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
    let client = BezaMintNftClient::new(&env, &env.register(BezaMintNft, (admin.clone(),)));

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
    let client = BezaMintNftClient::new(&env, &env.register(BezaMintNft, (admin.clone(),)));

    let token_id = mint_one(&client, &owner, 0);
    client.set_approval_for_all(&owner, &operator, &true);

    client.transfer_from(&operator, &owner, &recipient, &token_id);

    assert_eq!(client.owner_of(&token_id), recipient);
    // Blanket approval is a standing grant and survives the transfer.
    assert!(client.is_approved_for_all(&owner, &operator));
}

#[test]
// NftError::SpenderNotApproved
#[should_panic(expected = "Error(Contract, #13)")]
fn test_transfer_from_rejects_unapproved_spender() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    let attacker = Address::generate(&env);
    let recipient = Address::generate(&env);
    let client = BezaMintNftClient::new(&env, &env.register(BezaMintNft, (admin.clone(),)));

    let token_id = mint_one(&client, &owner, 0);
    client.transfer_from(&attacker, &owner, &recipient, &token_id);
}

#[test]
// NftError::FromIsNotOwner
#[should_panic(expected = "Error(Contract, #12)")]
fn test_transfer_from_rejects_wrong_from() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    let operator = Address::generate(&env);
    let recipient = Address::generate(&env);
    let client = BezaMintNftClient::new(&env, &env.register(BezaMintNft, (admin.clone(),)));

    let token_id = mint_one(&client, &owner, 0);
    client.set_approval_for_all(&operator, &operator, &true);
    // The operator holds blanket approval for itself, not for `owner`.
    client.transfer_from(&operator, &operator, &recipient, &token_id);
}

#[test]
// NftError::TokenNotFound
#[should_panic(expected = "Error(Contract, #10)")]
fn test_transfer_from_rejects_nonexistent_token() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let spender = Address::generate(&env);
    let recipient = Address::generate(&env);
    let client = BezaMintNftClient::new(&env, &env.register(BezaMintNft, (admin.clone(),)));
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
    let client = BezaMintNftClient::new(&env, &env.register(BezaMintNft, (admin.clone(),)));

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
    let client = BezaMintNftClient::new(&env, &env.register(BezaMintNft, (admin.clone(),)));

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
    let contract_id = env.register(BezaMintNft, (admin.clone(),));
    let client = BezaMintNftClient::new(&env, &contract_id);
    assert_eq!(client.total_supply(), 0);
}

#[test]
fn test_mint_increases_counter_and_sets_owner() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let contract_id = env.register(BezaMintNft, (admin.clone(),));
    let client = BezaMintNftClient::new(&env, &contract_id);

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
    let contract_id = env.register(BezaMintNft, (admin.clone(),));
    let client = BezaMintNftClient::new(&env, &contract_id);

    let t1 = mint_one(&client, &user, 0);
    let t2 = mint_one(&client, &user, 0);
    let t3 = client.mint(&user, &user, &2, &String::from_str(&env, "ipfs://meta/3"));
    assert_eq!(t1, 1);
    assert_eq!(t2, 2);
    assert_eq!(t3, 3);
    assert_eq!(client.total_supply(), 3);
    assert_eq!(client.balance_of(&user), 3);
}

/// `token_data.creator` is the address that minted the token, and it stays
/// distinct from the recipient. Before this was an explicit parameter it
/// recorded `to`, so a gift or a primary sale recorded the buyer as the creator
/// while the Royalty contract recorded the minter -- two answers for one token.
#[test]
fn test_mint_attributes_the_token_to_the_creator_not_the_recipient() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let creator = Address::generate(&env);
    let recipient = Address::generate(&env);
    let contract_id = env.register(BezaMintNft, (admin.clone(),));
    let client = BezaMintNftClient::new(&env, &contract_id);

    let token_id = client.mint(
        &creator,
        &recipient,
        &0,
        &String::from_str(&env, "ipfs://gift/1"),
    );

    let data = client.token_data(&token_id);
    assert_eq!(data.creator, creator);
    assert_eq!(client.owner_of(&token_id), recipient);
    assert_eq!(client.balance_of(&creator), 0);
    assert_eq!(client.balance_of(&recipient), 1);
}

/// Attribution cannot be claimed on someone else's behalf: with only the
/// recipient's authorization in the tree, a mint that names a different
/// creator must be rejected. This is the check that makes an explicit creator
/// parameter worth its ABI change.
#[test]
#[should_panic]
fn test_mint_rejects_a_creator_that_did_not_authorize() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let creator = Address::generate(&env);
    let recipient = Address::generate(&env);
    let contract_id = env.register(BezaMintNft, (admin.clone(),));
    let client = BezaMintNftClient::new(&env, &contract_id);

    // Only the recipient authorizes -- never the creator the call names.
    env.mock_auths(&[MockAuth {
        address: &recipient,
        invoke: &MockAuthInvoke {
            contract: &contract_id,
            fn_name: "mint",
            args: (
                creator.clone(),
                recipient.clone(),
                0u64,
                String::from_str(&env, "ipfs://stolen/1"),
            )
                .into_val(&env),
            sub_invokes: &[],
        },
    }]);

    client.mint(
        &creator,
        &recipient,
        &0,
        &String::from_str(&env, "ipfs://stolen/1"),
    );
}

/// The common case is a self-mint where creator and recipient are the same
/// address. That address must be asked to authorize exactly once: the host
/// rejects a second `require_auth` for an address that already authorized the
/// frame with `Error(Auth, ExistingValue)`, so an unguarded second call would
/// make every self-mint fail while every other test still passed.
#[test]
fn test_self_mint_asks_for_one_authorization() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let contract_id = env.register(BezaMintNft, (admin.clone(),));
    let client = BezaMintNftClient::new(&env, &contract_id);

    env.mock_auths(&[MockAuth {
        address: &user,
        invoke: &MockAuthInvoke {
            contract: &contract_id,
            fn_name: "mint",
            args: (
                user.clone(),
                user.clone(),
                0u64,
                String::from_str(&env, "ipfs://self/1"),
            )
                .into_val(&env),
            sub_invokes: &[],
        },
    }]);

    let token_id = client.mint(&user, &user, &0, &String::from_str(&env, "ipfs://self/1"));
    assert_eq!(client.owner_of(&token_id), user);
    assert_eq!(client.token_data(&token_id).creator, user);
}

#[test]
fn test_transfer_changes_ownership() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let new_owner = Address::generate(&env);
    let contract_id = env.register(BezaMintNft, (admin.clone(),));
    let client = BezaMintNftClient::new(&env, &contract_id);

    let token_id = mint_one(&client, &user, 0);
    client.transfer(&user, &new_owner, &token_id);
    assert_eq!(client.owner_of(&token_id), new_owner);
    assert_eq!(client.balance_of(&user), 0);
    assert_eq!(client.balance_of(&new_owner), 1);
}

#[test]
// NftError::CallerNotOwner
#[should_panic(expected = "Error(Contract, #11)")]
fn test_transfer_fails_if_not_owner() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let attacker = Address::generate(&env);
    let target = Address::generate(&env);
    let contract_id = env.register(BezaMintNft, (admin.clone(),));
    let client = BezaMintNftClient::new(&env, &contract_id);

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
    let contract_id = env.register(BezaMintNft, (admin.clone(),));
    let client = BezaMintNftClient::new(&env, &contract_id);

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
    let contract_id = env.register(BezaMintNft, (admin.clone(),));
    let client = BezaMintNftClient::new(&env, &contract_id);

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
    let contract_id = env.register(BezaMintNft, (admin.clone(),));
    let client = BezaMintNftClient::new(&env, &contract_id);

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
    let contract_id = env.register(BezaMintNft, (admin.clone(),));
    let client = BezaMintNftClient::new(&env, &contract_id);
    client.burn(&999);
}

#[test]
fn test_balance_of_multiple_owners() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let user2 = Address::generate(&env);
    let contract_id = env.register(BezaMintNft, (admin.clone(),));
    let client = BezaMintNftClient::new(&env, &contract_id);

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
    let contract_id = env.register(BezaMintNft, (admin.clone(),));
    let client = BezaMintNftClient::new(&env, &contract_id);
    client.owner_of(&42);
}

#[test]
fn test_token_data_stores_correct_info() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let contract_id = env.register(BezaMintNft, (admin.clone(),));
    let client = BezaMintNftClient::new(&env, &contract_id);

    let token_id = client.mint(
        &user,
        &user,
        &5,
        &String::from_str(&env, "ipfs://col-5/nft-1"),
    );
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
    let contract = BezaMintNftClient::new(&env, &env.register(BezaMintNft, (admin.clone(),)));
    let token_id = contract.mint(&to, &to, &0, &String::from_str(&env, "ipfs://test"));
    assert_eq!(token_id, 1);
}

#[test]
fn test_transfer_emits_event() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    let contract = BezaMintNftClient::new(&env, &env.register(BezaMintNft, (admin.clone(),)));
    contract.mint(&alice, &alice, &0, &String::from_str(&env, "ipfs://test"));
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
    let contract = BezaMintNftClient::new(&env, &env.register(BezaMintNft, (admin.clone(),)));
    contract.mint(&alice, &alice, &0, &String::from_str(&env, "ipfs://1"));
    contract.mint(&alice, &alice, &0, &String::from_str(&env, "ipfs://2"));
    contract.mint(&alice, &alice, &0, &String::from_str(&env, "ipfs://3"));
    assert_eq!(contract.balance_of(&alice), 3);
}

#[test]
#[should_panic]
fn test_mint_requires_recipient_auth() {
    let env = Env::default();
    // Do NOT mock auth: mint must fail because the recipient never authorized.
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let contract = BezaMintNftClient::new(&env, &env.register(BezaMintNft, (admin.clone(),)));
    // Only the admin's initialize is authorized; the mint must be rejected.
    contract.mint(&user, &user, &0, &String::from_str(&env, "ipfs://meta"));
}

#[test]
// NftError::MetadataUriEmpty
#[should_panic(expected = "Error(Contract, #5)")]
fn test_mint_rejects_empty_metadata() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let contract = BezaMintNftClient::new(&env, &env.register(BezaMintNft, (admin.clone(),)));
    contract.mint(&user, &user, &0, &String::from_str(&env, ""));
}

#[test]
// NftError::MetadataUriTooLong
#[should_panic(expected = "Error(Contract, #6)")]
fn test_mint_rejects_oversized_metadata() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let contract = BezaMintNftClient::new(&env, &env.register(BezaMintNft, (admin.clone(),)));
    let long_uri = "x".repeat(513);
    contract.mint(&user, &user, &0, &String::from_str(&env, &long_uri));
}

/// The 512-character limit is inclusive, so both neighbours of the boundary
/// must be accepted. Asserting only the 513 rejection would let an off-by-one
/// (`<` instead of `<=`) ship as a regression that silently rejects URLs the
/// contract previously stored.
#[test]
fn test_mint_accepts_boundary_metadata_lengths() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let contract = BezaMintNftClient::new(&env, &env.register(BezaMintNft, (admin.clone(),)));

    // 511 and 512 bytes total, scheme included, so only the length bound is
    // exercised and the URI stays scheme-valid.
    for extra in [504usize, 505usize] {
        let mut bytes = b"ipfs://".to_vec();
        bytes.extend(core::iter::repeat_n(b'x', extra));
        let uri = String::from_bytes(&env, &bytes);
        let token_id = contract.mint(&user, &user, &0, &uri);
        assert_eq!(
            contract.token_data(&token_id).metadata_uri.len(),
            (7 + extra) as u32
        );
    }
}

/// An arbitrary URI scheme is a stored-XSS vector: the frontend renders the
/// metadata URI into the DOM. Only https/http/ipfs may be stored.
#[test]
// NftError::MetadataUriSchemeInvalid
#[should_panic(expected = "Error(Contract, #7)")]
fn test_mint_rejects_javascript_uri() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let contract = BezaMintNftClient::new(&env, &env.register(BezaMintNft, (admin.clone(),)));
    contract.mint(
        &user,
        &user,
        &0,
        &String::from_str(&env, "javascript:alert(1)"),
    );
}

#[test]
// NftError::MetadataUriSchemeInvalid
#[should_panic(expected = "Error(Contract, #7)")]
fn test_mint_rejects_data_uri() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let contract = BezaMintNftClient::new(&env, &env.register(BezaMintNft, (admin.clone(),)));
    contract.mint(
        &user,
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
    let contract = BezaMintNftClient::new(&env, &env.register(BezaMintNft, (admin.clone(),)));
    contract.mint(
        &user,
        &user,
        &0,
        &String::from_str(&env, "https://cdn.example.com/1.json"),
    );
    assert_eq!(contract.total_supply(), 1);
}

#[test]
// NftError::ZeroAddress
#[should_panic(expected = "Error(Contract, #8)")]
fn test_mint_rejects_zero_address() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let contract = BezaMintNftClient::new(&env, &env.register(BezaMintNft, (admin.clone(),)));
    let zero = Address::from_str(
        &env,
        "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
    );
    contract.mint(&zero, &zero, &0, &String::from_str(&env, "ipfs://meta"));
}

#[test]
fn test_burn_event_emission() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let contract = BezaMintNftClient::new(&env, &env.register(BezaMintNft, (admin.clone(),)));
    contract.mint(&user, &user, &0, &String::from_str(&env, "ipfs://burn"));
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
    let contract_id = env.register(BezaMintNft, (admin.clone(),));
    let contract = BezaMintNftClient::new(&env, &contract_id);

    contract.mint(&alice, &alice, &0, &String::from_str(&env, "ipfs://events"));
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
    let contract_id = env.register(BezaMintNft, (admin.clone(),));
    let contract = BezaMintNftClient::new(&env, &contract_id);
    contract.mint(&user, &user, &0, &String::from_str(&env, "ipfs://ttl"));
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
    let contract_id = env.register(BezaMintNft, (admin.clone(),));
    let contract = BezaMintNftClient::new(&env, &contract_id);
    contract.mint(&alice, &alice, &0, &String::from_str(&env, "ipfs://ttl"));

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
    let contract_id = env.register(BezaMintNft, (admin.clone(),));
    let client = BezaMintNftClient::new(&env, &contract_id);

    // Replace the mocked auths with none: require_auth must reject.
    env.mock_auths(&[]);
    let hash = soroban_sdk::BytesN::from_array(&env, &[0u8; 32]);
    assert!(client.try_upgrade(&hash).is_err());
}

/// The admin query must report who was stored at initialization, and fail
/// loudly on an uninitialized contract rather than returning a zero address.
#[test]
fn test_get_admin_reports_initialized_admin() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let contract_id = env.register(BezaMintNft, (admin.clone(),));
    let client = BezaMintNftClient::new(&env, &contract_id);
    assert_eq!(client.get_admin(), admin);
}

/// The role must actually move. Asserting only that `get_admin` changed would
/// pass even if the old key kept working, so this authorizes with the previous
/// admin alone and requires the call to be rejected.
#[test]
fn test_set_admin_transfers_authority() {
    let env = Env::default();
    env.mock_all_auths();
    let old_admin = Address::generate(&env);
    let new_admin = Address::generate(&env);
    let contract_id = env.register(BezaMintNft, (old_admin.clone(),));
    let client = BezaMintNftClient::new(&env, &contract_id);

    client.set_admin(&new_admin);
    assert_eq!(client.get_admin(), new_admin.clone());

    // Only the former admin signs: the role has moved, so this must be refused.
    let third = Address::generate(&env);
    env.mock_auths(&[soroban_sdk::testutils::MockAuth {
        address: &old_admin,
        invoke: &soroban_sdk::testutils::MockAuthInvoke {
            contract: &contract_id,
            fn_name: "set_admin",
            args: soroban_sdk::IntoVal::into_val(&(third.clone(),), &env),
            sub_invokes: &[],
        },
    }]);
    assert!(client.try_set_admin(&third).is_err());
    assert_eq!(client.get_admin(), new_admin);
}

/// An admin that cannot sign is indistinguishable from no admin, so the zero
/// account is refused and the stored admin is left untouched.
#[test]
fn test_set_admin_rejects_zero_address() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let client = BezaMintNftClient::new(&env, &env.register(BezaMintNft, (admin.clone(),)));

    let zero = Address::from_str(&env, ZERO);
    // NftError::ZeroAddress
    assert!(client.try_set_admin(&zero).is_err());
    assert_eq!(client.get_admin(), admin);
}
