use soroban_sdk::{testutils::Address as _, Address, Env};

use crate::{BezaMintCreator, BezaMintCreatorClient};

#[test]
fn test_initialize() {
    let env = Env::default();
    let admin = Address::generate(&env);

    let contract_id = env.register(BezaMintCreator, ());
    let client = BezaMintCreatorClient::new(&env, &contract_id);

    client.initialize(&admin);
    assert_eq!(client.total_creators(), 0);
}
