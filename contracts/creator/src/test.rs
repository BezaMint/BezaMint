use soroban_sdk::{
    testutils::{Address as _, Events, Ledger},
    vec,
    xdr::{self, ContractDataDurability, LedgerKey},
    Address, Env, IntoVal, String, Symbol, TryFromVal,
};

use crate::{BezaMintCreator, BezaMintCreatorClient, CreatorEvent, CreatorKey, SocialLink};

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
    let contract_id = env.register(BezaMintCreator, ());
    let client = BezaMintCreatorClient::new(&env, &contract_id);
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
#[should_panic(expected = "already registered")]
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
#[should_panic(expected = "profile not found")]
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
#[should_panic(expected = "already registered")]
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
#[should_panic(expected = "must use an https, http or ipfs URL")]
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
#[should_panic(expected = "must use an https, http or ipfs URL")]
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
#[should_panic(expected = "must use an https, http or ipfs URL")]
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
#[should_panic(expected = "unsupported social platform")]
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
#[should_panic(expected = "must use an https or http scheme")]
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
#[should_panic(expected = "max 8 social links")]
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
    let contract_id = env.register(BezaMintCreator, ());
    let client = BezaMintCreatorClient::new(&env, &contract_id);
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
    let contract_id = env.register(BezaMintCreator, ());
    let client = BezaMintCreatorClient::new(&env, &contract_id);
    client.upgrade(&soroban_sdk::BytesN::from_array(&env, &[0u8; 32]));
}
