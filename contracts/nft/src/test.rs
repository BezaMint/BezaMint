use soroban_sdk::{testutils::Address as _, Address, Env};

use crate::{BezaMintNft, BezaMintNftClient};

#[test]
fn test_initialize() {
    let env = Env::default();
    let admin = Address::generate(&env);

    let contract_id = env.register(BezaMintNft, ());
    let client = BezaMintNftClient::new(&env, &contract_id);

    client.initialize(&admin);
    assert_eq!(client.total_supply(), 0);
}
