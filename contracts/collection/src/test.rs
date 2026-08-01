use soroban_sdk::{testutils::Address as _, Address, Env};

use crate::{BezaMintCollection, BezaMintCollectionClient};

#[test]
fn test_initialize() {
    let env = Env::default();
    let admin = Address::generate(&env);

    let contract_id = env.register(BezaMintCollection, ());
    let client = BezaMintCollectionClient::new(&env, &contract_id);

    client.initialize(&admin);
    assert_eq!(client.total_collections(), 0);
}
