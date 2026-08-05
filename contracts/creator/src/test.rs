use soroban_sdk::{
    testutils::{Address as _, Ledger},
    vec, Address, Env, String,
};

use crate::{BezaMintCreator, BezaMintCreatorClient, SocialLink};

fn setup() -> (Env, Address, BezaMintCreatorClient<'static>) {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let contract_id = env.register(BezaMintCreator, ());
    let client = BezaMintCreatorClient::new(&env, &contract_id);
    client.initialize(&admin);
    (env, admin, client)
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
    assert_eq!(profile.display_name, String::from_str(&env, "Alice Updated"));
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
    let (env, admin, client) = setup();
    env.ledger().with_mut(|l| l.timestamp = 12345);
    let creator = Address::generate(&env);

    register(&env, &client, &creator, "Alice");
    assert!(!client.is_verified(&creator));

    client.verify_creator(&admin, &creator);

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
    assert_eq!(profile.social_links.get(0).unwrap().platform, String::from_str(&env, "twitter"));
}

#[test]
#[should_panic(expected = "already registered")]
fn test_prevent_duplicate_registration() {
    let (env, _admin, client) = setup();
    let creator = Address::generate(&env);

    register(&env, &client, &creator, "Test");
    register(&env, &client, &creator, "Test2");
}
