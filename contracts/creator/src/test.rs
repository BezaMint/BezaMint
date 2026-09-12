use soroban_sdk::{
    testutils::{Address as _, Events, Ledger},
    vec,
    xdr::{self, ContractDataDurability, LedgerKey},
    Address, Env, IntoVal, String, Symbol, TryFromVal,
};

use crate::{BezaMintCreator, BezaMintCreatorClient, CreatorEvent, CreatorKey, SocialLink};

/// A stored schema version must gate every mutation, and only the admin may
/// repair a mismatch by naming the version it is migrating from. A changed
/// `CreatorProfile` layout would otherwise be decoded as garbage.
#[test]
fn test_storage_version_is_enforced() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let creator = Address::generate(&env);
    let contract_id = env.register(BezaMintCreator, (admin.clone(),));
    let client = BezaMintCreatorClient::new(&env, &contract_id);

    assert_eq!(client.version(), crate::STORAGE_VERSION);

    env.as_contract(&contract_id, || {
        env.storage().instance().set(&CreatorKey::Version, &99u32);
    });

    let empty = String::from_str(&env, "");
    let name = String::from_str(&env, "Creator");
    assert!(client
        .try_register(&creator, &name, &empty, &empty, &empty)
        .is_err());
    assert!(client.try_migrate(&0u32).is_err());

    client.migrate(&99u32);
    // A migration changes what stored values mean, so it is the one operation
    // an operator must be able to find a timestamped record of afterwards.
    let migrated_events = env.events().all();
    let (_, _, migrated_data) = migrated_events
        .get(migrated_events.len() - 1)
        .expect("migrate emits an event");
    let migrated: CreatorEvent =
        CreatorEvent::try_from_val(&env, &migrated_data).expect("decodable event");
    assert_eq!(migrated, CreatorEvent::Migrated(99, crate::STORAGE_VERSION));
    assert_eq!(client.version(), crate::STORAGE_VERSION);
    client.register(&creator, &name, &empty, &empty, &empty);
    assert!(client.is_registered(&creator));
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
fn assert_single_creator_event(env: &Env, emitter: &Address, expected: CreatorEvent) {
    let events = env.events().all();
    assert_eq!(events.len(), 1, "expected exactly one event");
    let (contract, topics, data) = events.get(0).expect("one event");
    assert_eq!(contract.clone(), emitter.clone(), "wrong emitter");
    let topic_symbol: Symbol =
        Symbol::try_from_val(env, &topics.get(0).expect("topic")).expect("topic is a symbol");
    assert_eq!(topic_symbol, Symbol::new(env, "creator"));
    let decoded: CreatorEvent = CreatorEvent::try_from_val(env, &data).expect("decodable event");
    assert_eq!(decoded, expected);
}

fn setup() -> (Env, Address, BezaMintCreatorClient<'static>) {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let contract_id = env.register(BezaMintCreator, (admin.clone(),));
    let client = BezaMintCreatorClient::new(&env, &contract_id);
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

/// Profile URIs share the 512-byte limit with the NFT and Collection metadata
/// URIs. The bound is inclusive, so the byte immediately below and the limit
/// itself must both be accepted, and the first byte over rejected — only the
/// rejection was covered before.
#[test]
fn test_register_accepts_boundary_avatar_uri() {
    let (env, _, client) = setup();
    let creator = Address::generate(&env);

    // 512 bytes total, scheme included, so only the length bound is exercised.
    let mut bytes = b"https://".to_vec();
    bytes.extend(core::iter::repeat_n(b'x', 504));
    let avatar = String::from_bytes(&env, &bytes);
    assert_eq!(avatar.len(), 512);

    client.register(
        &creator,
        &String::from_str(&env, "Alice"),
        &String::from_str(&env, ""),
        &avatar,
        &String::from_str(&env, ""),
    );
    assert_eq!(client.get_profile(&creator).avatar_uri.len(), 512);
}

#[test]
// CreatorError::UriTooLong
#[should_panic(expected = "Error(Contract, #8)")]
fn test_register_rejects_oversized_avatar_uri() {
    let (env, _, client) = setup();
    let creator = Address::generate(&env);
    let mut bytes = b"https://".to_vec();
    bytes.extend(core::iter::repeat_n(b'x', 505));
    let avatar = String::from_bytes(&env, &bytes);
    assert_eq!(avatar.len(), 513);

    client.register(
        &creator,
        &String::from_str(&env, "Alice"),
        &String::from_str(&env, ""),
        &avatar,
        &String::from_str(&env, ""),
    );
}

fn register(env: &Env, client: &BezaMintCreatorClient, creator: &Address, name: &str) {
    client.register(
        creator,
        &String::from_str(env, name),
        &String::from_str(env, "A creative builder"),
        &String::from_str(env, "ipfs://avatar"),
        &String::from_str(env, "ipfs://banner"),
    );
}

#[test]
fn test_register_and_get_profile() {
    let (env, _admin, client) = setup();
    env.ledger().with_mut(|l| l.timestamp = 12345);
    let creator = Address::generate(&env);

    register(&env, &client, &creator, "Alice");

    assert_eq!(client.total_creators(), 1);
    assert!(client.is_registered(&creator));
    assert!(!client.is_verified(&creator));

    let profile = client.get_profile(&creator);
    assert_eq!(profile.display_name, String::from_str(&env, "Alice"));
    assert_eq!(profile.avatar_uri, String::from_str(&env, "ipfs://avatar"));
    assert!(!profile.is_verified);
    assert!(profile.created_at > 0);
}

#[test]
// CreatorError::AlreadyRegistered
#[should_panic(expected = "Error(Contract, #10)")]
fn test_duplicate_registration_fails() {
    let (env, _admin, client) = setup();
    let creator = Address::generate(&env);

    register(&env, &client, &creator, "Alice");
    register(&env, &client, &creator, "Alice2");
}

#[test]
fn test_update_profile() {
    let (env, _admin, client) = setup();
    env.ledger().with_mut(|l| l.timestamp = 12345);
    let creator = Address::generate(&env);

    register(&env, &client, &creator, "Alice");
    client.update_profile(
        &creator,
        &String::from_str(&env, "Alice Updated"),
        &String::from_str(&env, "New bio"),
        &String::from_str(&env, "ipfs://avatar2"),
        &String::from_str(&env, "ipfs://banner2"),
    );

    let profile = client.get_profile(&creator);
    assert_eq!(
        profile.display_name,
        String::from_str(&env, "Alice Updated")
    );
    assert_eq!(profile.bio, String::from_str(&env, "New bio"));
}

#[test]
fn test_set_social_links() {
    let (env, _admin, client) = setup();
    env.ledger().with_mut(|l| l.timestamp = 12345);
    let creator = Address::generate(&env);

    register(&env, &client, &creator, "Alice");

    let links = vec![
        &env,
        SocialLink {
            platform: String::from_str(&env, "twitter"),
            url: String::from_str(&env, "https://twitter.com/alice"),
        },
        SocialLink {
            platform: String::from_str(&env, "github"),
            url: String::from_str(&env, "https://github.com/alice"),
        },
    ];

    client.set_social_links(&creator, &links);

    let profile = client.get_profile(&creator);
    assert_eq!(profile.social_links.len(), 2);
}

#[test]
fn test_verify_creator() {
    let (env, _admin, client) = setup();
    env.ledger().with_mut(|l| l.timestamp = 12345);
    let creator = Address::generate(&env);

    register(&env, &client, &creator, "Alice");
    assert!(!client.is_verified(&creator));

    client.verify_creator(&creator);

    assert!(client.is_verified(&creator));
    let profile = client.get_profile(&creator);
    assert!(profile.is_verified);
}

#[test]
fn test_total_creators_count() {
    let (env, _admin, client) = setup();
    let creator1 = Address::generate(&env);
    let creator2 = Address::generate(&env);
    let creator3 = Address::generate(&env);

    register(&env, &client, &creator1, "A");
    register(&env, &client, &creator2, "B");
    register(&env, &client, &creator3, "C");

    assert_eq!(client.total_creators(), 3);
}

#[test]
fn test_unregistered_address() {
    let (env, _admin, client) = setup();
    let stranger = Address::generate(&env);

    assert!(!client.is_registered(&stranger));
    assert!(!client.is_verified(&stranger));
}

#[test]
// CreatorError::ProfileNotFound
#[should_panic(expected = "Error(Contract, #11)")]
fn test_update_nonexistent_fails() {
    let (env, _admin, client) = setup();
    let stranger = Address::generate(&env);

    client.update_profile(
        &stranger,
        &String::from_str(&env, "Name"),
        &String::from_str(&env, "Bio"),
        &String::from_str(&env, "Avatar"),
        &String::from_str(&env, "Banner"),
    );
}

#[test]
fn test_social_links_update_emits_profile_updated_event() {
    let (env, _admin, client) = setup();
    let creator = Address::generate(&env);

    register(&env, &client, &creator, "Alice");

    let links = vec![
        &env,
        SocialLink {
            platform: String::from_str(&env, "twitter"),
            url: String::from_str(&env, "https://twitter.com/alice"),
        },
    ];
    client.set_social_links(&creator, &links);

    let profile = client.get_profile(&creator);
    assert_eq!(profile.social_links.len(), 1);
    assert_eq!(
        profile.social_links.get(0).unwrap().platform,
        String::from_str(&env, "twitter")
    );
}

#[test]
// CreatorError::AlreadyRegistered
#[should_panic(expected = "Error(Contract, #10)")]
fn test_prevent_duplicate_registration() {
    let (env, _admin, client) = setup();
    let creator = Address::generate(&env);

    register(&env, &client, &creator, "Test");
    register(&env, &client, &creator, "Test2");
}

/// The TTL policy must actually keep profiles alive: a registered profile must
/// carry a live-until at least half the network maximum in the future.
#[test]
fn test_register_extends_ttl() {
    let (env, _admin, client) = setup();
    let creator = Address::generate(&env);
    let contract_id = client.address.clone();
    register(&env, &client, &creator, "Alice");

    let key: soroban_sdk::Val = CreatorKey::Profile(creator).into_val(&env);
    let sc_key: xdr::ScVal = xdr::ScVal::try_from_val(&env, &key).unwrap();
    let remaining = ttl_of(&env, &contract_id, &sc_key).expect("profile entry exists");
    assert!(remaining >= crate::TTL_THRESHOLD);
}

/// Every state-changing operation must emit exactly one well-formed event:
/// registered, profile updated (twice - update_profile and set_social_links)
/// and verified.
#[test]
fn test_events_cover_all_mutations() {
    let (env, admin, client) = setup();
    let creator = Address::generate(&env);
    let emitter = client.address.clone();

    register(&env, &client, &creator, "Alice");
    assert_single_creator_event(&env, &emitter, CreatorEvent::Registered(creator.clone()));

    client.update_profile(
        &creator,
        &String::from_str(&env, "Alice Updated"),
        &String::from_str(&env, "bio"),
        &String::from_str(&env, "ipfs://avatar"),
        &String::from_str(&env, "ipfs://banner"),
    );
    assert_single_creator_event(
        &env,
        &emitter,
        CreatorEvent::ProfileUpdated(creator.clone()),
    );

    let links = vec![
        &env,
        SocialLink {
            platform: String::from_str(&env, "twitter"),
            url: String::from_str(&env, "https://twitter.com/alice"),
        },
    ];
    client.set_social_links(&creator, &links);
    assert_single_creator_event(
        &env,
        &emitter,
        CreatorEvent::ProfileUpdated(creator.clone()),
    );

    client.verify_creator(&creator);
    assert_single_creator_event(&env, &emitter, CreatorEvent::Verified(creator));

    drop(admin);
}

/// A profile URI must use a real scheme. `javascript:` and `data:` are
/// rejected because the frontend renders these strings into the DOM where they
/// would be a stored-XSS vector.
#[test]
// CreatorError::UriSchemeInvalid
#[should_panic(expected = "Error(Contract, #9)")]
fn test_register_rejects_javascript_avatar_uri() {
    let (env, _admin, client) = setup();
    let creator = Address::generate(&env);

    client.register(
        &creator,
        &String::from_str(&env, "Alice"),
        &String::from_str(&env, "bio"),
        &String::from_str(&env, "javascript:alert(1)"),
        &String::from_str(&env, "ipfs://banner"),
    );
}

#[test]
// CreatorError::UriSchemeInvalid
#[should_panic(expected = "Error(Contract, #9)")]
fn test_register_rejects_data_uri() {
    let (env, _admin, client) = setup();
    let creator = Address::generate(&env);

    client.register(
        &creator,
        &String::from_str(&env, "Alice"),
        &String::from_str(&env, "bio"),
        &String::from_str(&env, "data:text/html,<script>1</script>"),
        &String::from_str(&env, ""),
    );
}

#[test]
fn test_register_accepts_http_uris() {
    let (env, _admin, client) = setup();
    let creator = Address::generate(&env);

    client.register(
        &creator,
        &String::from_str(&env, "Alice"),
        &String::from_str(&env, "bio"),
        &String::from_str(&env, "https://cdn.example.com/avatar.png"),
        &String::from_str(&env, "http://cdn.example.com/banner.png"),
    );

    assert!(client.is_registered(&creator));
}

#[test]
// CreatorError::UriSchemeInvalid
#[should_panic(expected = "Error(Contract, #9)")]
fn test_update_profile_rejects_javascript_uri() {
    let (env, _admin, client) = setup();
    let creator = Address::generate(&env);
    register(&env, &client, &creator, "Alice");

    client.update_profile(
        &creator,
        &String::from_str(&env, "Alice"),
        &String::from_str(&env, "bio"),
        &String::from_str(&env, "javascript:alert(1)"),
        &String::from_str(&env, "ipfs://banner"),
    );
}

#[test]
// CreatorError::UnsupportedPlatform
#[should_panic(expected = "Error(Contract, #14)")]
fn test_set_social_links_rejects_unknown_platform() {
    let (env, _admin, client) = setup();
    let creator = Address::generate(&env);
    register(&env, &client, &creator, "Alice");

    let links = vec![
        &env,
        SocialLink {
            platform: String::from_str(&env, "myspace"),
            url: String::from_str(&env, "https://myspace.com/alice"),
        },
    ];
    client.set_social_links(&creator, &links);
}

#[test]
// CreatorError::SocialUrlSchemeInvalid
#[should_panic(expected = "Error(Contract, #16)")]
fn test_set_social_links_rejects_javascript_url() {
    let (env, _admin, client) = setup();
    let creator = Address::generate(&env);
    register(&env, &client, &creator, "Alice");

    let links = vec![
        &env,
        SocialLink {
            platform: String::from_str(&env, "twitter"),
            url: String::from_str(&env, "javascript:alert(1)"),
        },
    ];
    client.set_social_links(&creator, &links);
}

#[test]
// CreatorError::TooManySocialLinks
#[should_panic(expected = "Error(Contract, #12)")]
fn test_set_social_links_rejects_too_many() {
    let (env, _admin, client) = setup();
    let creator = Address::generate(&env);
    register(&env, &client, &creator, "Alice");

    let mut links = vec![&env];
    for _ in 0..9 {
        links.push_back(SocialLink {
            platform: String::from_str(&env, "twitter"),
            url: String::from_str(&env, "https://twitter.com/alice"),
        });
    }
    client.set_social_links(&creator, &links);
}

/// Platform names are matched case-insensitively: "Twitter" is the same
/// platform as "twitter", so badge rendering does not depend on the creator
/// typing the canonical casing.
#[test]
fn test_set_social_links_accepts_mixed_case_platform() {
    let (env, _admin, client) = setup();
    let creator = Address::generate(&env);
    register(&env, &client, &creator, "Alice");

    let links = vec![
        &env,
        SocialLink {
            platform: String::from_str(&env, "Twitter"),
            url: String::from_str(&env, "https://twitter.com/alice"),
        },
    ];
    client.set_social_links(&creator, &links);

    let profile = client.get_profile(&creator);
    assert_eq!(profile.social_links.len(), 1);
}

/// Upgrade is admin-gated: without the admin's authorization the code swap
/// must be rejected. This is the only path that can change a deployed
/// contract's behaviour, so its guard is security-critical.
#[test]
fn test_upgrade_requires_admin_auth() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let contract_id = env.register(BezaMintCreator, (admin.clone(),));
    let client = BezaMintCreatorClient::new(&env, &contract_id);

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
    let contract_id = env.register(BezaMintCreator, (admin.clone(),));
    let client = BezaMintCreatorClient::new(&env, &contract_id);
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
    let contract_id = env.register(BezaMintCreator, (old_admin.clone(),));
    let client = BezaMintCreatorClient::new(&env, &contract_id);

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
    let client = BezaMintCreatorClient::new(&env, &env.register(BezaMintCreator, (admin.clone(),)));

    let zero = Address::from_str(
        &env,
        "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
    );
    // CreatorError::AdminZeroAddress
    assert!(client.try_set_admin(&zero).is_err());
    assert_eq!(client.get_admin(), admin);
}
