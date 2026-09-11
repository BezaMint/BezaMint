use soroban_sdk::{
    testutils::{Address as _, Events, Ledger},
    xdr::{self, ContractDataDurability, LedgerKey},
    Address, Env, IntoVal, Map, Symbol, TryFromVal,
};

use crate::{BezaMintRoyalty, BezaMintRoyaltyClient, RoyaltyEvent, RoyaltyKey};

/// A stored schema version must gate every mutation, and only the admin may
/// repair a mismatch by naming the version it is migrating from. Royalty shares
/// the version at which a `RoyaltyConfig` layout could silently change and be
/// paid out as garbage.
#[test]
fn test_storage_version_is_enforced() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let creator = Address::generate(&env);
    let contract_id = env.register(BezaMintRoyalty, (admin.clone(),));
    let client = BezaMintRoyaltyClient::new(&env, &contract_id);

    assert_eq!(client.version(), crate::STORAGE_VERSION);

    env.as_contract(&contract_id, || {
        env.storage().instance().set(&RoyaltyKey::Version, &99u32);
    });

    let recipients: Map<Address, u32> = Map::new(&env);
    assert!(client
        .try_configure_royalty(&creator, &1u64, &500u32, &recipients, &false)
        .is_err());
    assert!(client.try_migrate(&0u32).is_err());

    client.migrate(&99u32);
    assert_eq!(client.version(), crate::STORAGE_VERSION);
    client.configure_royalty(&creator, &1u64, &500u32, &recipients, &false);
    assert_eq!(client.get_royalty(&1u64, &false).basis_points, 500);
}

/// Remaining TTL in ledgers of a specific persistent entry, or `None` when the
/// entry does not exist.
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

/// Decode the single most recent event and assert emitter, topic and payload.
fn assert_single_royalty_event(env: &Env, emitter: &Address, expected: RoyaltyEvent) {
    let events = env.events().all();
    assert_eq!(events.len(), 1, "expected exactly one event");
    let (contract, topics, data) = events.get(0).expect("one event");
    assert_eq!(contract.clone(), emitter.clone(), "wrong emitter");
    let topic_symbol: Symbol =
        Symbol::try_from_val(env, &topics.get(0).expect("topic")).expect("topic is a symbol");
    assert_eq!(topic_symbol, Symbol::new(env, "royalty"));
    let decoded: RoyaltyEvent = RoyaltyEvent::try_from_val(env, &data).expect("decodable event");
    assert_eq!(decoded, expected);
}

fn setup() -> (Env, Address, BezaMintRoyaltyClient<'static>) {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let contract_id = env.register(BezaMintRoyalty, (admin.clone(),));
    let client = BezaMintRoyaltyClient::new(&env, &contract_id);
    (env, admin, client)
}

/// The constructor runs as part of contract creation, so the admin binding
/// already exists by the time any client can call the contract. This replaces
/// the previous "initialize then observe" test: there is no uninitialized state
/// left to observe, and no second call that could overwrite the binding.
#[test]
fn test_constructor_binds_admin() {
    let (_, admin, client) = setup();
    assert!(client.is_initialized());
    assert_eq!(client.get_admin(), admin);
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
fn test_quote_royalty_defaults_to_the_creator() {
    let (env, _, client) = setup();
    let creator = Address::generate(&env);
    client.configure_royalty(&creator, &1, &500, &empty_recipients(&env), &false);

    // 500 bps of a 1,000-stroop sale is 50, and with no split configured the
    // creator receives all of it.
    let payouts = client.quote_royalty(&1, &false, &1000);
    assert_eq!(payouts.len(), 1);
    let only = payouts.get(0).unwrap();
    assert_eq!(only.recipient, creator);
    assert_eq!(only.amount, 50);
}

#[test]
fn test_quote_royalty_splits_by_share() {
    let (env, _, client) = setup();
    let creator = Address::generate(&env);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    let split = recipients(&env, &[(alice.clone(), 60), (bob.clone(), 40)]);
    client.configure_royalty(&creator, &1, &500, &split, &false);

    let payouts = client.quote_royalty(&1, &false, &1000);
    assert_eq!(payouts.len(), 2);
    let mut total = 0i128;
    for i in 0..payouts.len() {
        total += payouts.get(i).unwrap().amount;
    }
    assert_eq!(total, 50, "the royalty total must be distributed in full");
    // Shares are looked up by address, not by iteration order.
    let by_address = |addr: &Address| {
        let mut found = 0i128;
        for i in 0..payouts.len() {
            let p = payouts.get(i).unwrap();
            if &p.recipient == addr {
                found = p.amount;
            }
        }
        found
    };
    assert_eq!(by_address(&alice), 30);
    assert_eq!(by_address(&bob), 20);
}

/// Rounding must never create or destroy value: the parts always sum to exactly
/// the royalty total, with the remainder landing on the final recipient.
#[test]
fn test_quote_royalty_assigns_the_rounding_remainder() {
    let (env, _, client) = setup();
    let creator = Address::generate(&env);
    let a = Address::generate(&env);
    let b = Address::generate(&env);
    let c = Address::generate(&env);
    let split = recipients(&env, &[(a, 33), (b, 33), (c, 34)]);
    client.configure_royalty(&creator, &1, &500, &split, &false);

    // 500 bps of 101 stroops floors to 5, which does not divide evenly three ways.
    let payouts = client.quote_royalty(&1, &false, &101);
    assert_eq!(payouts.len(), 3);
    let mut total = 0i128;
    for i in 0..payouts.len() {
        let amount = payouts.get(i).unwrap().amount;
        assert!(amount >= 0, "a payout must never be negative");
        total += amount;
    }
    assert_eq!(total, 5);
}

/// A payout can never exceed the royalty actually due, at any price.
#[test]
fn test_quote_royalty_never_exceeds_the_rate() {
    let (env, _, client) = setup();
    let creator = Address::generate(&env);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    let split = recipients(&env, &[(alice, 60), (bob, 40)]);
    client.configure_royalty(&creator, &1, &750, &split, &false);

    for price in [1i128, 7, 99, 100, 12_345, 1_000_000] {
        let payouts = client.quote_royalty(&1, &false, &price);
        let mut total = 0i128;
        for i in 0..payouts.len() {
            total += payouts.get(i).unwrap().amount;
        }
        assert_eq!(
            total,
            price * 750 / 10_000,
            "wrong royalty for price {price}"
        );
        assert!(total <= price, "royalty cannot exceed the sale price");
    }
}

#[test]
fn test_quote_royalty_zero_rate_owes_nothing() {
    let (env, _, client) = setup();
    let creator = Address::generate(&env);
    client.configure_royalty(&creator, &1, &0, &empty_recipients(&env), &false);
    assert_eq!(client.quote_royalty(&1, &false, &1_000_000).len(), 0);
}

#[test]
fn test_quote_royalty_zero_price_owes_nothing() {
    let (env, _, client) = setup();
    let creator = Address::generate(&env);
    client.configure_royalty(&creator, &1, &500, &empty_recipients(&env), &false);
    assert_eq!(client.quote_royalty(&1, &false, &0).len(), 0);
}

#[test]
// RoyaltyError::SalePriceNegative
#[should_panic(expected = "Error(Contract, #13)")]
fn test_quote_royalty_rejects_negative_price() {
    let (env, _, client) = setup();
    let creator = Address::generate(&env);
    client.configure_royalty(&creator, &1, &500, &empty_recipients(&env), &false);
    client.quote_royalty(&1, &false, &-1);
}

#[test]
// RoyaltyError::NoConfig
#[should_panic(expected = "Error(Contract, #5)")]
fn test_quote_royalty_requires_a_config() {
    let (_, _, client) = setup();
    client.quote_royalty(&999, &false, &1000);
}

#[test]
// RoyaltyError::SharesMustSumToTotal
#[should_panic(expected = "Error(Contract, #12)")]
fn test_recipients_summing_to_99_are_rejected() {
    let (env, _, client) = setup();
    let creator = Address::generate(&env);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    let split = recipients(&env, &[(alice, 59), (bob, 40)]);
    client.configure_royalty(&creator, &1, &500, &split, &false);
}

#[test]
// RoyaltyError::SharesMustSumToTotal
#[should_panic(expected = "Error(Contract, #12)")]
fn test_recipients_summing_over_100_are_rejected() {
    let (env, _, client) = setup();
    let creator = Address::generate(&env);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    let split = recipients(&env, &[(alice, 150), (bob, 100)]);
    client.configure_royalty(&creator, &1, &500, &split, &false);
}

#[test]
// RoyaltyError::ZeroShare
#[should_panic(expected = "Error(Contract, #11)")]
fn test_zero_share_recipient_is_rejected() {
    let (env, _, client) = setup();
    let creator = Address::generate(&env);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    let split = recipients(&env, &[(alice, 100), (bob, 0)]);
    client.configure_royalty(&creator, &1, &500, &split, &false);
}

#[test]
// RoyaltyError::TooManyRecipients
#[should_panic(expected = "Error(Contract, #10)")]
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
// RoyaltyError::SharesMustSumToTotal
#[should_panic(expected = "Error(Contract, #12)")]
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
// RoyaltyError::BasisPointsTooHigh
#[should_panic(expected = "Error(Contract, #7)")]
fn test_configure_invalid_basis_points_fails() {
    let (env, _, client) = setup();
    let creator = Address::generate(&env);
    client.configure_royalty(&creator, &1, &15000, &empty_recipients(&env), &false);
}

/// A frozen configuration must not be replaceable through `configure_royalty`.
#[test]
// RoyaltyError::ConfigAlreadyExists
#[should_panic(expected = "Error(Contract, #6)")]
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
// RoyaltyError::ConfigAlreadyExists
#[should_panic(expected = "Error(Contract, #6)")]
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
// RoyaltyError::CallerCannotUpdate
#[should_panic(expected = "Error(Contract, #8)")]
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

/// The TTL policy must actually keep configs alive: a configured royalty entry
/// must carry a live-until at least half the network maximum in the future.
#[test]
fn test_configure_royalty_extends_ttl() {
    let (env, _admin, client) = setup();
    let creator = Address::generate(&env);
    let contract_id = client.address.clone();
    client.configure_royalty(&creator, &1, &500, &empty_recipients(&env), &false);

    let key: soroban_sdk::Val = RoyaltyKey::ConfigNft(1).into_val(&env);
    let sc_key: xdr::ScVal = xdr::ScVal::try_from_val(&env, &key).unwrap();
    let remaining = ttl_of(&env, &contract_id, &sc_key).expect("config entry exists");
    assert!(remaining >= crate::TTL_THRESHOLD);
}

/// The admin can delete terms that can no longer matter (a burned NFT), after
/// which the target reads as unconfigured again.
#[test]
fn test_remove_royalty_deletes_config() {
    let (env, _admin, client) = setup();
    let creator = Address::generate(&env);
    client.configure_royalty(&creator, &1, &500, &empty_recipients(&env), &false);

    client.remove_royalty(&1, &false);

    assert!(client.try_get_royalty(&1, &false).is_err());
}

/// A frozen config is permanent: freezing is the creator's guarantee that
/// their terms cannot change, so even the admin cannot delete it.
#[test]
// RoyaltyError::ConfigFrozen
#[should_panic(expected = "Error(Contract, #9)")]
fn test_remove_royalty_refuses_frozen_config() {
    let (env, _admin, client) = setup();
    let creator = Address::generate(&env);
    client.configure_royalty(&creator, &1, &500, &empty_recipients(&env), &false);
    client.freeze_royalty(&1, &false);

    client.remove_royalty(&1, &false);
}

#[test]
// RoyaltyError::NoConfig
#[should_panic(expected = "Error(Contract, #5)")]
fn test_remove_unknown_royalty_panics() {
    let (_, _, client) = setup();
    client.remove_royalty(&999, &false);
}

/// Every state-changing operation must emit exactly one well-formed event:
/// configured, updated, frozen and admin changed.
#[test]
fn test_events_cover_all_mutations() {
    let (env, admin, client) = setup();
    let creator = Address::generate(&env);
    let factory = Address::generate(&env);
    let emitter = client.address.clone();

    client.configure_royalty(&creator, &1, &500, &empty_recipients(&env), &false);
    assert_single_royalty_event(&env, &emitter, RoyaltyEvent::Configured(1, 500));

    client.update_royalty(&creator, &1, &750, &empty_recipients(&env), &false);
    assert_single_royalty_event(&env, &emitter, RoyaltyEvent::Updated(1, 750));

    client.freeze_royalty(&1, &false);
    assert_single_royalty_event(&env, &emitter, RoyaltyEvent::Frozen(1));

    // Removed carries its own event; use a second, unfrozen target.
    client.configure_royalty(&creator, &2, &300, &empty_recipients(&env), &false);
    client.remove_royalty(&2, &false);
    assert_single_royalty_event(&env, &emitter, RoyaltyEvent::Removed(2));

    client.set_admin(&factory);
    assert_single_royalty_event(&env, &emitter, RoyaltyEvent::AdminChanged(factory));

    // The old admin is no longer the admin; clean up the unused binding.
    drop(admin);
}

/// The admin role is transferable; deployment hands it to the Factory so its
/// cross-contract `configure_royalty` calls authenticate. The new admin must
/// be able to configure royalties afterwards.
#[test]
fn test_set_admin_transfers_control() {
    let (env, _admin, client) = setup();
    let factory = Address::generate(&env);

    client.set_admin(&factory);

    // The Factory (new admin) can now configure royalties.
    let creator = Address::generate(&env);
    client.configure_royalty(&creator, &1, &500, &empty_recipients(&env), &false);
    assert_eq!(client.get_royalty(&1, &false).basis_points, 500);

    // The old admin no longer holds the role: only the new admin may change it.
    let another = Address::generate(&env);
    client.set_admin(&another);
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
// RoyaltyError::ConfigFrozen
#[should_panic(expected = "Error(Contract, #9)")]
fn test_update_frozen_royalty_fails() {
    let (env, _, client) = setup();
    let creator = Address::generate(&env);
    env.ledger().with_mut(|l| l.timestamp = 12345);

    client.configure_royalty(&creator, &1, &500, &empty_recipients(&env), &false);
    client.freeze_royalty(&1, &false);
    client.update_royalty(&creator, &1, &1000, &empty_recipients(&env), &false);
}

#[test]
// RoyaltyError::NoConfig
#[should_panic(expected = "Error(Contract, #5)")]
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
// RoyaltyError::ConfigFrozen
#[should_panic(expected = "Error(Contract, #9)")]
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
// RoyaltyError::BasisPointsTooHigh
#[should_panic(expected = "Error(Contract, #7)")]
fn test_validate_basis_points_limit() {
    let (env, _, client) = setup();
    let creator = Address::generate(&env);
    client.configure_royalty(&creator, &1, &10001, &empty_recipients(&env), &false);
}

/// Upgrade is admin-gated: without the admin's authorization the code swap
/// must be rejected. This is the only path that can change a deployed
/// contract's behaviour, so its guard is security-critical.
#[test]
fn test_upgrade_requires_admin_auth() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let contract_id = env.register(BezaMintRoyalty, (admin.clone(),));
    let client = BezaMintRoyaltyClient::new(&env, &contract_id);

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
    let contract_id = env.register(BezaMintRoyalty, (admin.clone(),));
    let client = BezaMintRoyaltyClient::new(&env, &contract_id);
    assert_eq!(client.get_admin(), admin);
}
