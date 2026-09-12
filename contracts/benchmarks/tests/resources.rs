//! Per-entry-point resource and fee measurements for the four contracts that
//! can be linked from outside their own crates.
//!
//! Each measurement runs one top-level invocation and reports what the host
//! metered for it: CPU instructions, memory, ledger entries read and written,
//! the bytes behind them, and the fee those resources imply at the fee schedule
//! the SDK snapshots.
//!
//! How to read the numbers
//! -----------------------
//!
//! * **Instructions, not gas.** Soroban has no gas. The fee is the sum of a CPU
//!   term, a per-entry read and write term, a per-kilobyte read and write term,
//!   an events term and *rent* on the entries the call leaves behind. A change
//!   that reduces instructions while adding a ledger entry can therefore cost
//!   more, which is the main reason these are measured rather than reasoned
//!   about.
//! * **Fees are an estimate.** They are computed from a snapshot of mainnet
//!   rates taken by the SDK, and they exclude the transaction inclusion fee and
//!   the cost of the transaction's own size. Treat them as relative.
//! * **Auth is mocked.** `mock_all_auths` is used throughout, so the signature
//!   verification cost a real transaction pays is not included. That cost is
//!   roughly constant across entry points, so comparisons between them hold.
//! * **The contracts run natively here, not as wasm.** Instructions are
//!   therefore *underestimated*, and by a different factor per call shape. The
//!   numbers are for comparing entry points against each other and against
//!   themselves after a change — not for predicting a mainnet fee to the stroop.
//! * **Some costs depend on data, not code.** A collection's membership write
//!   rewrites the whole membership vector, so the Nth `add_nft` costs N times
//!   the first. Those cases are measured explicitly below, because a benchmark
//!   that only measures the empty state reports the cheapest possible answer.
//!
//! The Factory's entry points are measured in `factory/src/bench.rs`, for the
//! reason given in this crate's library documentation. `docs/resource-costs.md`
//! merges both sets into one table.
//!
//! `scripts/bench-contract-resources.py` runs these and builds the tables in
//! `docs/resource-costs.md` from the `RESOURCE ` lines on stdout.

use bezamint_benchmarks::{measure, within, Harness};
use soroban_sdk::{Address, Map};

const COLLECTION_ID: u64 = 1;

// ── NFT ────────────────────────────────────────────────────────

/// Budgets for the NFT entry points, as measured with the host native.
mod nft_budget {
    pub const MINT_INSTRUCTIONS: i64 = 260_000;
    pub const MINT_WRITES: u32 = 9;
    pub const TRANSFER_INSTRUCTIONS: i64 = 370_000;
    pub const TRANSFER_WRITES: u32 = 14;
    pub const APPROVE_INSTRUCTIONS: i64 = 110_000;
    pub const APPROVE_WRITES: u32 = 3;
    pub const BURN_INSTRUCTIONS: i64 = 960_000;
    pub const BURN_WRITES: u32 = 12;
    pub const PLAYER_INSTRUCTIONS: i64 = 90_000;
    pub const PAGE_INSTRUCTIONS: i64 = 1_900_000;
}

#[test]
fn nft_entry_points() {
    let h = Harness::new();
    h.seed_collection();
    let token = h.seed_mint(COLLECTION_ID);
    assert_eq!(token, 1);

    let (mint, token_id) = measure(&h.env, "nft.mint", || {
        h.nft().mint(&h.user, &COLLECTION_ID, &h.uri())
    });
    assert_eq!(token_id, 2);
    within(
        "nft.mint",
        mint,
        nft_budget::MINT_INSTRUCTIONS,
        nft_budget::MINT_WRITES,
    );

    let (transfer, ()) = measure(&h.env, "nft.transfer", || {
        h.nft().transfer(&h.user, &h.other, &token)
    });
    assert_eq!(h.nft().owner_of(&token), h.other);
    within(
        "nft.transfer",
        transfer,
        nft_budget::TRANSFER_INSTRUCTIONS,
        nft_budget::TRANSFER_WRITES,
    );

    let (approve, ()) = measure(&h.env, "nft.approve", || h.nft().approve(&h.other, &token));
    assert!(h.nft().is_approved(&h.other, &token));
    within(
        "nft.approve",
        approve,
        nft_budget::APPROVE_INSTRUCTIONS,
        nft_budget::APPROVE_WRITES,
    );

    let (transfer_from, ()) = measure(&h.env, "nft.transfer_from", || {
        h.nft().transfer_from(&h.other, &h.other, &h.user, &token)
    });
    assert_eq!(h.nft().owner_of(&token), h.user);
    within(
        "nft.transfer_from",
        transfer_from,
        nft_budget::TRANSFER_INSTRUCTIONS,
        nft_budget::TRANSFER_WRITES,
    );

    let (owner_of, owner) = measure(&h.env, "nft.owner_of (read)", || h.nft().owner_of(&token));
    assert_eq!(owner, h.user);
    within(
        "nft.owner_of (read)",
        owner_of,
        nft_budget::PLAYER_INSTRUCTIONS,
        0,
    );

    let (balance_of, balance) = measure(&h.env, "nft.balance_of (read)", || {
        h.nft().balance_of(&h.user)
    });
    assert!(balance >= 1);
    within(
        "nft.balance_of (read)",
        balance_of,
        nft_budget::PLAYER_INSTRUCTIONS,
        0,
    );

    // 65 tokens owned by one address: the page read is a bounded 64 gets plus
    // the TTL bumps, which is the shape a wallet gallery actually performs.
    for _ in 0..63 {
        h.nft().mint(&h.user, &COLLECTION_ID, &h.uri());
    }
    let (page, tokens) = measure(&h.env, "nft.tokens_of_owner (page of 64)", || {
        h.nft().tokens_of_owner(&h.user, &0, &64)
    });
    assert_eq!(tokens.len(), 64);
    within(
        "nft.tokens_of_owner (page of 64)",
        page,
        nft_budget::PAGE_INSTRUCTIONS,
        0,
    );

    // Burn runs last, deliberately: by now the owner holds 65 tokens, and the
    // contract rewrites the owner's whole token-id vector when a token leaves
    // it. Measuring burn on a one-token wallet would report a fraction of what
    // a burn costs a collector, which is the case that actually occurs.
    let (burn, ()) = measure(&h.env, "nft.burn (owner of 65)", || h.nft().burn(&token));
    assert_eq!(h.nft().balance_of(&h.user), 64);
    within(
        "nft.burn (owner of 65)",
        burn,
        nft_budget::BURN_INSTRUCTIONS,
        nft_budget::BURN_WRITES,
    );
}

// ── Collection ─────────────────────────────────────────────────

/// Budgets for the Collection entry points.
///
/// `add_nft` and `remove_nft` rewrite the whole membership vector, so their
/// budgets are stated once for the empty case and once at 128 members. The
/// second pair is the one that matters: it is the same code, and it is what a
/// collection actually costs to build.
mod collection_budget {
    pub const CREATE_INSTRUCTIONS: i64 = 260_000;
    pub const CREATE_WRITES: u32 = 5;
    pub const ADD_FIRST_INSTRUCTIONS: i64 = 180_000;
    pub const ADD_FIRST_WRITES: u32 = 5;
    pub const ADD_128TH_INSTRUCTIONS: i64 = 540_000;
    pub const ADD_128TH_WRITES: u32 = 5;
    pub const REMOVE_FROM_128_INSTRUCTIONS: i64 = 680_000;
    pub const REMOVE_FROM_128_WRITES: u32 = 5;
    pub const PAGE_INSTRUCTIONS: i64 = 240_000;
}

#[test]
fn collection_entry_points() {
    let h = Harness::new();
    h.seed_collection();

    let (add_first, ()) = measure(&h.env, "collection.add_nft (1st member)", || {
        h.collection().add_nft(&COLLECTION_ID, &1)
    });
    let _ = add_first;
    within(
        "collection.add_nft (1st member)",
        add_first,
        collection_budget::ADD_FIRST_INSTRUCTIONS,
        collection_budget::ADD_FIRST_WRITES,
    );

    // Fill to 128 members, then measure the next one. The cost of the write
    // grows with the vector, so this is the same entry point at a different
    // size, not a different entry point.
    h.seed_members(COLLECTION_ID, 2, 128);
    let (add_nth, ()) = measure(&h.env, "collection.add_nft (129th member)", || {
        h.collection().add_nft(&COLLECTION_ID, &129)
    });
    let _ = add_nth;
    within(
        "collection.add_nft (129th member)",
        add_nth,
        collection_budget::ADD_128TH_INSTRUCTIONS,
        collection_budget::ADD_128TH_WRITES,
    );

    let (remove, ()) = measure(&h.env, "collection.remove_nft (from 129)", || {
        h.collection().remove_nft(&COLLECTION_ID, &64)
    });
    let _ = remove;
    within(
        "collection.remove_nft (from 129)",
        remove,
        collection_budget::REMOVE_FROM_128_INSTRUCTIONS,
        collection_budget::REMOVE_FROM_128_WRITES,
    );
    assert_eq!(h.collection().get_collection(&COLLECTION_ID).nft_count, 128);

    let (page, page_ids) = measure(
        &h.env,
        "collection.get_nfts_in_collection (page of 100)",
        || {
            h.collection()
                .get_nfts_in_collection(&COLLECTION_ID, &0, &100)
        },
    );
    assert_eq!(page_ids.len(), 100);
    within(
        "collection.get_nfts_in_collection (page of 100)",
        page,
        collection_budget::PAGE_INSTRUCTIONS,
        0,
    );

    let (by_creator, ids) = measure(&h.env, "collection.get_collections_by_creator (1)", || {
        h.collection().get_collections_by_creator(&h.user, &0, &100)
    });
    assert_eq!(ids.len(), 1);
    within(
        "collection.get_collections_by_creator (1)",
        by_creator,
        collection_budget::PAGE_INSTRUCTIONS,
        0,
    );
}

/// Collections created by the same creator: `create_collection` reads and
/// rewrites the creator's index, so the cost has the same shape as membership.
#[test]
fn collection_create_for_returning_creator() {
    let h = Harness::new();
    h.seed_collection();
    for _ in 0..31 {
        h.collection().create_collection(&h.user, &h.uri());
    }

    let (create, id) = measure(
        &h.env,
        "collection.create_collection (32nd by creator)",
        || h.collection().create_collection(&h.user, &h.uri()),
    );
    assert_eq!(id, 33);
    within(
        "collection.create_collection (32nd by creator)",
        create,
        collection_budget::CREATE_INSTRUCTIONS,
        collection_budget::CREATE_WRITES,
    );
}

// ── Royalty ────────────────────────────────────────────────────

mod royalty_budget {
    pub const CONFIGURE_INSTRUCTIONS: i64 = 105_000;
    pub const CONFIGURE_WRITES: u32 = 3;
    pub const QUOTE_INSTRUCTIONS: i64 = 105_000;
    pub const UPDATE_INSTRUCTIONS: i64 = 105_000;
    pub const FREEZE_INSTRUCTIONS: i64 = 110_000;
    // Settlement is cross-contract: ten transfers through the asset contract,
    // each of which reads and writes the recipient's balance entry. Twelve
    // writes is ten balances plus the asset contract's own record of the
    // payer's; the budget leaves room for one more recipient's worth.
    pub const PAY_INSTRUCTIONS: i64 = 1_960_000;
    pub const PAY_WRITES: u32 = 14;
}

#[test]
fn royalty_entry_points() {
    let h = Harness::new();
    let empty: Map<Address, u32> = Map::new(&h.env);

    let (configure, ()) = measure(&h.env, "royalty.configure_royalty (creator only)", || {
        h.royalty()
            .configure_royalty(&h.user, &1, &500, &empty, &false)
    });
    let _ = configure;
    within(
        "royalty.configure_royalty (creator only)",
        configure,
        royalty_budget::CONFIGURE_INSTRUCTIONS,
        royalty_budget::CONFIGURE_WRITES,
    );

    let (configure_split, ()) = measure(&h.env, "royalty.configure_royalty (10-way split)", || {
        h.royalty()
            .configure_royalty(&h.user, &2, &1000, &h.recipients(10), &false)
    });
    let _ = configure_split;

    let (quote, payouts) = measure(&h.env, "royalty.quote_royalty (creator only)", || {
        h.royalty().quote_royalty(&1, &false, &10_000_000)
    });
    assert_eq!(payouts.len(), 1);
    within(
        "royalty.quote_royalty (creator only)",
        quote,
        royalty_budget::QUOTE_INSTRUCTIONS,
        0,
    );

    let (_, split_payouts) = measure(&h.env, "royalty.quote_royalty (10-way split)", || {
        h.royalty().quote_royalty(&2, &false, &10_000_000)
    });
    assert_eq!(split_payouts.len(), 10);
    // The invariant that matters: the split distributes exactly the royalty.
    let total: i128 = split_payouts.iter().map(|p| p.amount).sum();
    assert_eq!(total, 1_000_000);

    let (update, ()) = measure(&h.env, "royalty.update_royalty", || {
        h.royalty()
            .update_royalty(&h.user, &1, &250, &empty, &false)
    });
    let _ = update;
    within(
        "royalty.update_royalty",
        update,
        royalty_budget::UPDATE_INSTRUCTIONS,
        royalty_budget::CONFIGURE_WRITES,
    );

    let (freeze, ()) = measure(&h.env, "royalty.freeze_royalty", || {
        h.royalty().freeze_royalty(&1, &false)
    });
    let _ = freeze;
    within(
        "royalty.freeze_royalty",
        freeze,
        royalty_budget::FREEZE_INSTRUCTIONS,
        royalty_budget::CONFIGURE_WRITES,
    );

    // Settlement is the only path that moves value, and therefore the only one
    // whose cost includes cross-contract token transfers plus the ledger
    // entries the asset contract's own balance writes leave behind. Measured
    // on the 10-way split because that is the worst case the contract accepts.
    let sac = h.env.register_stellar_asset_contract_v2(h.admin.clone());
    let asset = sac.address();
    soroban_sdk::token::StellarAssetClient::new(&h.env, &asset).mint(&h.other, &10_000_000);

    let (pay, settlement) = measure(&h.env, "royalty.pay_royalty (10-way split)", || {
        h.royalty()
            .pay_royalty(&2, &false, &asset, &h.other, &10_000_000)
    });
    assert_eq!(settlement.len(), 10);
    within(
        "royalty.pay_royalty (10-way split)",
        pay,
        royalty_budget::PAY_INSTRUCTIONS,
        royalty_budget::PAY_WRITES,
    );
}

// ── Creator ────────────────────────────────────────────────────

mod creator_budget {
    pub const REGISTER_INSTRUCTIONS: i64 = 130_000;
    pub const REGISTER_WRITES: u32 = 4;
    pub const UPDATE_INSTRUCTIONS: i64 = 130_000;
    pub const LINKS_INSTRUCTIONS: i64 = 190_000;
    pub const VERIFY_INSTRUCTIONS: i64 = 210_000;
}

#[test]
fn creator_entry_points() {
    use soroban_sdk::{String, Vec};

    let h = Harness::new();
    let empty = String::from_str(&h.env, "");
    let name = String::from_str(&h.env, "Benchmark Creator");

    let (register, ()) = measure(&h.env, "creator.register", || {
        h.creator().register(&h.user, &name, &empty, &empty, &empty)
    });
    let _ = register;
    within(
        "creator.register",
        register,
        creator_budget::REGISTER_INSTRUCTIONS,
        creator_budget::REGISTER_WRITES,
    );

    let (update, ()) = measure(&h.env, "creator.update_profile", || {
        h.creator()
            .update_profile(&h.user, &name, &empty, &empty, &empty)
    });
    let _ = update;
    within(
        "creator.update_profile",
        update,
        creator_budget::UPDATE_INSTRUCTIONS,
        creator_budget::REGISTER_WRITES,
    );

    // Eight links is the documented maximum, so this is the worst case and the
    // one a profile write is worth budgeting against.
    let mut links = Vec::new(&h.env);
    for platform in [
        "twitter",
        "instagram",
        "tiktok",
        "youtube",
        "discord",
        "telegram",
        "github",
        "website",
    ] {
        links.push_back(bezamint_creator::SocialLink {
            platform: String::from_str(&h.env, platform),
            url: String::from_str(&h.env, "https://example.com/profile"),
        });
    }
    let (set_links, ()) = measure(&h.env, "creator.set_social_links (8 links)", || {
        h.creator().set_social_links(&h.user, &links)
    });
    let _ = set_links;
    within(
        "creator.set_social_links (8 links)",
        set_links,
        creator_budget::LINKS_INSTRUCTIONS,
        creator_budget::REGISTER_WRITES,
    );

    let (verify, ()) = measure(&h.env, "creator.verify_creator", || {
        h.creator().verify_creator(&h.user)
    });
    let _ = verify;
    within(
        "creator.verify_creator",
        verify,
        creator_budget::VERIFY_INSTRUCTIONS,
        creator_budget::REGISTER_WRITES,
    );
}
