#![no_std]

//! BezaMint Factory contract.
//!
//! The user-facing entry point that ties the platform together. It mints
//! NFTs, links them to their collection and configures their royalty in one
//! atomic invocation (`mint_with_royalty`), burns with collection cleanup
//! (`burn_nft`), and creates collections while auto-registering the creator
//! (`create_collection_for_creator`).
//!
//! ## Wiring
//!
//! After deployment the admin calls `set_contracts` with the four platform
//! contracts; the same call transfers the Royalty admin role to the Factory
//! so its cross-contract `configure_royalty` calls authenticate. Only the
//! stored admin may rewire.
//!
//! ## Security
//!
//! Every cross-contract mutation delegates its authorization to the callee:
//! the NFT contract enforces owner/recipient auth, the Collection contract
//! enforces creator auth, and the Royalty contract enforces admin auth. A
//! failed sub-call rolls the whole invocation back - no orphan NFTs, no
//! unlinked mints, no partial burns.

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, Address,
    BytesN, Env, IntoVal, Map, String, Symbol, Val, Vec,
};

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum FactoryKey {
    Admin,
    Version,
    NftContract,
    CollectionContract,
    RoyaltyContract,
    CreatorContract,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum FactoryEvent {
    ContractsSet(Address, Address, Address, Address),
    NftMinted(u64, Address),
    NftBurned(u64, Address),
    CollectionCreated(u64, Address),
    /// The admin role moved to a new address.
    AdminChanged(Address),

    /// The stored schema version advanced. A migration changes what stored
    /// values mean, so the one operation that most needs a timestamped on-chain
    /// record is the one that previously left none.
    Migrated(u32, u32),
}

/// State-expiration (TTL) policy. Soroban instance data and contract code are
/// archived once their TTL elapses; the Factory's entire state lives in
/// instance storage (admin plus the four contract pointers), so a dormant
/// contract would silently lose its wiring and every cross-contract call would
/// panic with "contract not set". Every write refreshes instance + code to the
/// network maximum ([`TTL_LEDGERS`] = Stellar's `MAXIMUM_ENTRY_TTL_LEDGERS`,
/// ~1 year at 5s per ledger).
const TTL_LEDGERS: u32 = 6_312_000;
const TTL_THRESHOLD: u32 = TTL_LEDGERS / 2;

/// Storage schema version written by this build. Bump it whenever the persisted
/// layout changes and add the matching step to [`BezaMintFactory::migrate`].
pub const STORAGE_VERSION: u32 = 1;

/// Upper bound on how many tokens one `mint_batch_with_royalty` call may create.
/// Every token costs three cross-contract calls, so the bound keeps a single
/// invocation's resource footprint - and therefore its fee - predictable.
pub const MAX_BATCH_MINT: u32 = 25;

/// The Stellar "zero" account (all-zero ed25519 public key). Soroban has no
/// native null address, so this sentinel is used to reject a wiring call that
/// would otherwise store an unusable pointer.
const ZERO_ADDRESS: &str = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

fn emit(env: &Env, event: FactoryEvent) {
    env.events().publish((symbol_short!("factory"),), event);
}

/// Panic unless the stored schema version matches this build.
///
/// The constructor writes `Version` but nothing used to read it, so an in-place
/// `upgrade` that changed the stored key layout would read the wiring pointers
/// incorrectly rather than failing. Every mutating path consults the version
/// first so the mismatch is loud and immediate.
fn assert_version(env: &Env) {
    let found: u32 = env
        .storage()
        .instance()
        .get(&FactoryKey::Version)
        .unwrap_or(0);
    if found != STORAGE_VERSION {
        panic_with_error!(env, FactoryError::StorageVersionMismatch);
    }
}

// ─────────────────────────── Errors ───────────────────────────

/// Typed contract errors.
///
/// A numeric code is part of the contract's public interface and the committed
/// ABI snapshot; callers switch on it instead of substring-matching a message.
/// Codes are grouped by subsystem and are never renumbered once shipped.
///
/// The four `*ContractNotSet` codes replace the previous single generic
/// message that interpolated the slot name. Distinct codes make the unwired
/// slot machine-readable, which is what deployment tooling actually needs.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum FactoryError {
    /// The contract has not been constructed.
    NotInitialized = 1,
    /// Stored schema version does not match this build; run `migrate`.
    StorageVersionMismatch = 2,
    /// `migrate` was given a `from_version` that is not what is stored.
    StoredVersionMismatch = 3,
    /// `migrate` called when storage is already at this build's version.
    AlreadyAtCurrentVersion = 4,
    /// `set_royalty_admin` was given the all-zero account.
    RoyaltyAdminZeroAddress = 5,
    /// A wired contract address is the all-zero account.
    WiringZeroAddress = 6,
    /// A wired contract slot points at the Factory itself.
    WiringSelfReference = 7,
    /// Two or more wired slots resolve to the same contract.
    WiringDuplicate = 8,
    /// `mint_batch_with_royalty` was given an empty batch.
    BatchEmpty = 9,
    /// `mint_batch_with_royalty` exceeded [`MAX_BATCH_MINT`].
    BatchTooLarge = 10,
    /// The NFT contract slot is not wired.
    NftContractNotSet = 11,
    /// The Collection contract slot is not wired.
    CollectionContractNotSet = 12,
    /// The Royalty contract slot is not wired.
    RoyaltyContractNotSet = 13,
    /// The Creator contract slot is not wired.
    CreatorContractNotSet = 14,
    /// `set_admin` was given the all-zero account.
    AdminZeroAddress = 15,
}

#[contract]
pub struct BezaMintFactory;

#[contractimpl]
impl BezaMintFactory {
    /// Constructor: runs atomically as part of contract creation.
    ///
    /// Initialization previously required a second, publicly callable
    /// transaction after deployment. Because deployment and initialization are
    /// separate transactions, any observer could call `initialize` first,
    /// satisfy `require_auth()` with their own signature and become the admin of
    /// a contract the deployer had just paid to create. On this contract that is
    /// total compromise: the admin can `set_contracts` to hostile addresses and
    /// route every mint, burn and collection creation through them. A
    /// constructor executes inside contract creation, so there is no window to
    /// race; it deliberately performs no `require_auth`, because the only party
    /// who can run it is the deployer, inside the deployment invocation itself.
    pub fn __constructor(env: Env, admin: Address) {
        env.storage().instance().set(&FactoryKey::Admin, &admin);
        env.storage().instance().set(&FactoryKey::Version, &1u32);
        // Instance data and contract code share one TTL; refresh both up front
        // so a long-dormant contract does not silently lose its admin binding.
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_LEDGERS);
    }

    /// Current admin address. Panics when the contract is not initialized.
    /// Exposed so deployment tooling can verify who actually controls a
    /// deployed contract (for example that the Royalty admin is the Factory).
    pub fn get_admin(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&FactoryKey::Admin)
            .unwrap_or_else(|| panic_with_error!(&env, FactoryError::NotInitialized))
    }

    /// Returns `true` once `initialize` has succeeded.
    pub fn is_initialized(env: Env) -> bool {
        env.storage().instance().has(&FactoryKey::Admin)
    }

    /// Stored schema version (`0` before the constructor runs).
    pub fn version(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&FactoryKey::Version)
            .unwrap_or(0)
    }

    /// Advance the stored schema version after an in-place `upgrade`.
    /// Admin-only.
    ///
    /// `from_version` must equal what is actually stored, so a migration cannot
    /// be replayed or run against the wrong starting point. This is deliberately
    /// the only mutating function exempt from `assert_version`: it is the step
    /// that repairs a mismatch.
    pub fn migrate(env: Env, from_version: u32) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&FactoryKey::Admin)
            .unwrap_or_else(|| panic_with_error!(&env, FactoryError::NotInitialized));
        admin.require_auth();

        let stored: u32 = env
            .storage()
            .instance()
            .get(&FactoryKey::Version)
            .unwrap_or(0);
        if stored != from_version {
            panic_with_error!(&env, FactoryError::StoredVersionMismatch);
        }
        if from_version == STORAGE_VERSION {
            panic_with_error!(&env, FactoryError::AlreadyAtCurrentVersion);
        }

        env.storage()
            .instance()
            .set(&FactoryKey::Version, &STORAGE_VERSION);
        emit(&env, FactoryEvent::Migrated(from_version, STORAGE_VERSION));
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_LEDGERS);
    }

    /// Replace the contract code with a newly deployed wasm hash. Admin-only.
    /// The canonical Soroban upgrade path: the admin deploys the new wasm,
    /// then calls this with its hash to swap the code in place, preserving all
    /// storage. There is no downgrade protection beyond the admin key itself,
    /// so the admin key must be held by the platform's operational key.
    pub fn upgrade(env: Env, new_wasm_hash: BytesN<32>) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&FactoryKey::Admin)
            .unwrap_or_else(|| panic_with_error!(&env, FactoryError::NotInitialized));
        admin.require_auth();

        env.deployer().update_current_contract_wasm(new_wasm_hash);
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_LEDGERS);
    }

    /// Transfer the Factory admin role to `new_admin`. Admin-only.
    ///
    /// The Factory admin can rewire every contract slot and seize the Royalty
    /// admin role, so it is the most valuable key in the system. Without this
    /// function a lost or compromised Factory admin key is unrecoverable, which
    /// contradicts the rotation policy in `docs/mainnet-readiness.md`.
    ///
    /// The zero account is rejected: a Factory administered by an address that
    /// cannot sign is permanently unrewireable.
    pub fn set_admin(env: Env, new_admin: Address) {
        assert_version(&env);
        let admin: Address = env
            .storage()
            .instance()
            .get(&FactoryKey::Admin)
            .unwrap_or_else(|| panic_with_error!(&env, FactoryError::NotInitialized));
        admin.require_auth();

        if new_admin == Address::from_str(&env, ZERO_ADDRESS) {
            panic_with_error!(&env, FactoryError::AdminZeroAddress);
        }

        env.storage().instance().set(&FactoryKey::Admin, &new_admin);
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_LEDGERS);

        emit(&env, FactoryEvent::AdminChanged(new_admin));
    }

    /// Wire the four platform contracts. Admin-only: authorization comes from
    /// the stored admin, not from any caller-supplied address. The previous
    /// signature accepted a leading `_admin: Address` that was ignored in
    /// favour of the stored admin, which misled callers into believing their
    /// own address authorized the call.
    pub fn set_contracts(
        env: Env,
        nft: Address,
        collection: Address,
        royalty: Address,
        creator: Address,
    ) {
        assert_version(&env);
        let stored_admin: Address = env
            .storage()
            .instance()
            .get(&FactoryKey::Admin)
            .unwrap_or_else(|| panic_with_error!(&env, FactoryError::NotInitialized));
        stored_admin.require_auth();

        // Reject a wiring call that stores a pointer the Factory can never use.
        // Without this a single typo does not fail here; it produces a Factory
        // that panics on every mint, and the mistake only surfaces when a user
        // tries one. The value "is set" either way, so only the write-time check
        // can catch it.
        Self::validate_wiring(&env, &nft, &collection, &royalty, &creator);

        env.storage().instance().set(&FactoryKey::NftContract, &nft);
        env.storage()
            .instance()
            .set(&FactoryKey::CollectionContract, &collection);
        env.storage()
            .instance()
            .set(&FactoryKey::RoyaltyContract, &royalty);
        env.storage()
            .instance()
            .set(&FactoryKey::CreatorContract, &creator);
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_LEDGERS);

        // Seize the Royalty admin role. `configure_royalty` requires the
        // Royalty admin's auth, and every mint goes through this contract, so
        // the Factory must hold that role for the flagship mint-with-royalty
        // flow to authenticate in production. The deployer (current admin)
        // authorizes this call and the sub-invoke in one transaction; after
        // this, only the Factory can change the Royalty admin again.
        let set_admin_args = soroban_sdk::vec![&env, env.current_contract_address().into_val(&env)];
        env.invoke_contract::<()>(&royalty, &Symbol::new(&env, "set_admin"), set_admin_args);

        emit(
            &env,
            FactoryEvent::ContractsSet(nft, collection, royalty, creator),
        );
    }

    /// Transfer the Royalty admin role to `new_admin` on behalf of the Factory.
    /// Admin-only: authorization comes from the stored Factory admin, not from
    /// any caller-supplied address.
    ///
    /// `set_contracts` hands the Royalty admin role to the Factory so the
    /// Factory's `configure_royalty` sub-calls authenticate. Without this
    /// function that hand-off is one-way and operationally fatal: the Factory
    /// holds the role, no Factory entry point forwards `upgrade`, and the
    /// Royalty contract - the one contract with a stored layout most likely to
    /// need a fix - can never be upgraded again. The recovery sequence is
    /// `set_royalty_admin(deployer)` -> `royalty.upgrade(hash)` ->
    /// `set_royalty_admin(factory)`, or simply `set_contracts` again, which
    /// re-hands the role over.
    pub fn set_royalty_admin(env: Env, new_admin: Address) {
        assert_version(&env);
        let stored_admin: Address = env
            .storage()
            .instance()
            .get(&FactoryKey::Admin)
            .unwrap_or_else(|| panic_with_error!(&env, FactoryError::NotInitialized));
        stored_admin.require_auth();

        if new_admin == Address::from_str(&env, ZERO_ADDRESS) {
            panic_with_error!(&env, FactoryError::RoyaltyAdminZeroAddress);
        }

        let royalty_addr: Address = env
            .storage()
            .instance()
            .get(&FactoryKey::RoyaltyContract)
            .unwrap_or_else(|| panic_with_error!(&env, FactoryError::RoyaltyContractNotSet));

        let args = soroban_sdk::vec![&env, new_admin.into_val(&env)];
        env.invoke_contract::<()>(&royalty_addr, &Symbol::new(&env, "set_admin"), args);
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_LEDGERS);
    }

    /// Reject addresses that cannot be used as platform contracts: the zero
    /// account (no such contract exists), the Factory itself (a pointer that
    /// would make every cross-contract call recurse into the Factory), and
    /// duplicates across the four slots (two roles would resolve to the same
    /// contract and every call would hit the wrong interface).
    fn validate_wiring(
        env: &Env,
        nft: &Address,
        collection: &Address,
        royalty: &Address,
        creator: &Address,
    ) {
        let zero = Address::from_str(env, ZERO_ADDRESS);
        if nft == &zero || collection == &zero || royalty == &zero || creator == &zero {
            panic_with_error!(env, FactoryError::WiringZeroAddress);
        }

        let this = env.current_contract_address();
        if nft == &this || collection == &this || royalty == &this || creator == &this {
            panic_with_error!(env, FactoryError::WiringSelfReference);
        }

        if nft == collection
            || nft == royalty
            || nft == creator
            || collection == royalty
            || collection == creator
            || royalty == creator
        {
            panic_with_error!(env, FactoryError::WiringDuplicate);
        }
    }

    /// Cross-contract: mint NFT then configure royalty atomically.
    ///
    /// `Symbol::new` is required because Soroban's `symbol_short!` only accepts
    /// names of at most 9 characters.
    pub fn mint_with_royalty(
        env: Env,
        caller: Address,
        to: Address,
        collection_id: u64,
        metadata_uri: String,
        basis_points: u32,
    ) -> u64 {
        assert_version(&env);
        caller.require_auth();

        let contracts = Self::mint_contracts(&env);
        let token_id = Self::mint_one(
            &env,
            &contracts,
            &caller,
            &to,
            collection_id,
            metadata_uri,
            basis_points,
        );

        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_LEDGERS);
        emit(&env, FactoryEvent::NftMinted(token_id, caller));

        token_id
    }

    /// Mint a bounded batch of NFTs into one collection, atomically.
    ///
    /// A ten-piece drop previously cost ten transactions: ten signatures, ten
    /// sets of network fees, and ten chances to leave a partial drop if the
    /// caller stopped halfway. This runs the same mint -> link -> configure
    /// sequence for every URI inside a single invocation, so the batch either
    /// fully succeeds or the whole invocation rolls back and nothing is minted.
    /// Each token still emits its own `NftMinted` event, so the activity feed and
    /// any indexer see exactly the records the single-mint path produces.
    ///
    /// The batch size is bounded by [`MAX_BATCH_MINT`] to keep one invocation's
    /// resource footprint, and therefore its fee, predictable. `caller` and `to`
    /// are shared across the batch: the recipient authorizes the mint and the
    /// caller must own the collection, exactly as in `mint_with_royalty`.
    pub fn mint_batch_with_royalty(
        env: Env,
        caller: Address,
        to: Address,
        collection_id: u64,
        metadata_uris: Vec<String>,
        basis_points: u32,
    ) -> Vec<u64> {
        assert_version(&env);
        caller.require_auth();

        if metadata_uris.is_empty() {
            panic_with_error!(&env, FactoryError::BatchEmpty);
        }
        if metadata_uris.len() > MAX_BATCH_MINT {
            panic_with_error!(&env, FactoryError::BatchTooLarge);
        }

        let contracts = Self::mint_contracts(&env);
        let mut token_ids = Vec::new(&env);
        for metadata_uri in metadata_uris.iter() {
            let token_id = Self::mint_one(
                &env,
                &contracts,
                &caller,
                &to,
                collection_id,
                metadata_uri,
                basis_points,
            );
            emit(&env, FactoryEvent::NftMinted(token_id, caller.clone()));
            token_ids.push_back(token_id);
        }

        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_LEDGERS);

        token_ids
    }

    /// Resolve the three contract pointers the mint path needs, failing with the
    /// name of the slot that is still unset.
    fn mint_contracts(env: &Env) -> (Address, Address, Address) {
        let nft_addr: Address = env
            .storage()
            .instance()
            .get(&FactoryKey::NftContract)
            .unwrap_or_else(|| panic_with_error!(&env, FactoryError::NftContractNotSet));
        let collection_addr: Address = env
            .storage()
            .instance()
            .get(&FactoryKey::CollectionContract)
            .unwrap_or_else(|| panic_with_error!(&env, FactoryError::CollectionContractNotSet));
        let royalty_addr: Address = env
            .storage()
            .instance()
            .get(&FactoryKey::RoyaltyContract)
            .unwrap_or_else(|| panic_with_error!(&env, FactoryError::RoyaltyContractNotSet));
        (nft_addr, collection_addr, royalty_addr)
    }

    /// Mint one token, link it to its collection and configure its royalty.
    ///
    /// Shared by the single and batch entry points so the two cannot drift apart.
    /// Every sub-call enforces its own authorization: the NFT contract checks the
    /// recipient, the Collection contract checks that the caller owns the
    /// collection (plus its archived/full/duplicate guards), and the Royalty
    /// contract checks the admin role the Factory holds. A failure in any of the
    /// three rolls back the entire invocation, including any tokens already minted
    /// earlier in the same batch.
    fn mint_one(
        env: &Env,
        contracts: &(Address, Address, Address),
        caller: &Address,
        to: &Address,
        collection_id: u64,
        metadata_uri: String,
        basis_points: u32,
    ) -> u64 {
        let (nft_addr, collection_addr, royalty_addr) = contracts;

        // Cross-contract call 1: mint the NFT. The caller is passed as the
        // token's creator, not the recipient: the two differ whenever a batch is
        // minted to an address other than the minter, and `token_data` must
        // name the same creator `configure_royalty` records below. The caller
        // already authorized this invocation, so the NFT contract's
        // `creator.require_auth()` adds no signature to the flow.
        let mint_args = soroban_sdk::vec![
            env,
            caller.clone().into_val(env),
            to.clone().into_val(env),
            collection_id.into_val(env),
            metadata_uri.into_val(env),
        ];
        let raw_token_id: Val = env.invoke_contract(nft_addr, &Symbol::new(env, "mint"), mint_args);
        let token_id: u64 = raw_token_id.into_val(env);

        // Cross-contract call 2: link the new NFT to its collection. The
        // Collection contract enforces creator auth (the caller must own the
        // collection) plus its archived/full/duplicate guards, so a mint into a
        // collection the caller does not control fails atomically together with
        // the mint.
        let add_args = soroban_sdk::vec![env, collection_id.into_val(env), token_id.into_val(env)];
        env.invoke_contract::<()>(collection_addr, &Symbol::new(env, "add_nft"), add_args);

        // Cross-contract call 3: configure royalty on the new NFT, recording
        // `caller` as the creator so they can amend their own terms later.
        let empty_recipients: Map<Address, u32> = Map::new(env);
        let royalty_args = soroban_sdk::vec![
            env,
            caller.clone().into_val(env),
            token_id.into_val(env),
            basis_points.into_val(env),
            empty_recipients.into_val(env),
            false.into_val(env),
        ];
        env.invoke_contract::<()>(
            royalty_addr,
            &Symbol::new(env, "configure_royalty"),
            royalty_args,
        );

        token_id
    }

    /// Atomic burn + collection unlink.
    ///
    /// Burning through the NFT contract directly leaves the token's collection
    /// membership behind: `nft_count` stays inflated and `get_nfts_in_collection`
    /// lists a token that no longer exists. This wrapper burns the NFT and
    /// removes it from its collection in one invocation. The NFT contract
    /// enforces owner auth on `burn` and the Collection contract enforces
    /// creator auth on `remove_nft`, so in the platform's own flow (a creator
    /// burning an NFT they minted into their own collection) both checks pass
    /// with the caller's signatures; a mismatched owner/creator fails
    /// atomically with nothing burned.
    pub fn burn_nft(env: Env, caller: Address, collection_id: u64, token_id: u64) {
        assert_version(&env);
        caller.require_auth();

        let nft_addr: Address = env
            .storage()
            .instance()
            .get(&FactoryKey::NftContract)
            .unwrap_or_else(|| panic_with_error!(&env, FactoryError::NftContractNotSet));
        let collection_addr: Address = env
            .storage()
            .instance()
            .get(&FactoryKey::CollectionContract)
            .unwrap_or_else(|| panic_with_error!(&env, FactoryError::CollectionContractNotSet));

        // Cross-contract call 1: burn the NFT (owner auth enforced there).
        let burn_args = soroban_sdk::vec![&env, token_id.into_val(&env)];
        env.invoke_contract::<()>(&nft_addr, &Symbol::new(&env, "burn"), burn_args);

        // Cross-contract call 2: drop the collection membership (creator auth
        // enforced there). Idempotent, so re-burning is a no-op.
        let remove_args =
            soroban_sdk::vec![&env, collection_id.into_val(&env), token_id.into_val(&env),];
        env.invoke_contract::<()>(
            &collection_addr,
            &Symbol::new(&env, "remove_nft"),
            remove_args,
        );
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_LEDGERS);

        emit(&env, FactoryEvent::NftBurned(token_id, caller));
    }

    /// Cross-contract: create collection + auto-register creator
    pub fn create_collection_for_creator(env: Env, caller: Address, metadata_uri: String) -> u64 {
        assert_version(&env);
        caller.require_auth();

        let collection_addr: Address = env
            .storage()
            .instance()
            .get(&FactoryKey::CollectionContract)
            .unwrap_or_else(|| panic_with_error!(&env, FactoryError::CollectionContractNotSet));
        let creator_addr: Address = env
            .storage()
            .instance()
            .get(&FactoryKey::CreatorContract)
            .unwrap_or_else(|| panic_with_error!(&env, FactoryError::CreatorContractNotSet));

        // Cross-contract call 1: create the collection
        let col_args = soroban_sdk::vec![
            &env,
            caller.clone().into_val(&env),
            metadata_uri.into_val(&env),
        ];
        let raw_id: Val = env.invoke_contract(
            &collection_addr,
            &Symbol::new(&env, "create_collection"),
            col_args,
        );
        let collection_id: u64 = raw_id.into_val(&env);

        // Cross-contract call 2: check if creator is registered
        let check_args = soroban_sdk::vec![&env, caller.clone().into_val(&env)];
        let is_registered: Val = env.invoke_contract(
            &creator_addr,
            &Symbol::new(&env, "is_registered"),
            check_args,
        );
        let registered: bool = is_registered.into_val(&env);

        // Cross-contract call 3: register creator if not already
        if !registered {
            let empty: String = String::from_str(&env, "");
            // register() requires a non-empty display name, so pass a default.
            let default_name: String = String::from_str(&env, "Creator");
            let reg_args = soroban_sdk::vec![
                &env,
                caller.clone().into_val(&env),
                default_name.into_val(&env),
                empty.clone().into_val(&env),
                empty.clone().into_val(&env),
                empty.clone().into_val(&env),
            ];
            env.invoke_contract::<()>(&creator_addr, &Symbol::new(&env, "register"), reg_args);
        }
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_LEDGERS);

        emit(&env, FactoryEvent::CollectionCreated(collection_id, caller));

        collection_id
    }

    // ── Queries ─────────────────────────────────────────────

    pub fn get_nft_contract(env: Env) -> Address {
        Self::wired_address(
            &env,
            &FactoryKey::NftContract,
            FactoryError::NftContractNotSet,
        )
    }

    pub fn get_collection_contract(env: Env) -> Address {
        Self::wired_address(
            &env,
            &FactoryKey::CollectionContract,
            FactoryError::CollectionContractNotSet,
        )
    }

    pub fn get_royalty_contract(env: Env) -> Address {
        Self::wired_address(
            &env,
            &FactoryKey::RoyaltyContract,
            FactoryError::RoyaltyContractNotSet,
        )
    }

    pub fn get_creator_contract(env: Env) -> Address {
        Self::wired_address(
            &env,
            &FactoryKey::CreatorContract,
            FactoryError::CreatorContractNotSet,
        )
    }

    /// Read a wired contract pointer, failing with a named error when the slot is
    /// still unset.
    ///
    /// These getters are exactly what deployment tooling calls to confirm the
    /// wiring, so a bare `unwrap()` here produced an anonymous host panic at the
    /// one moment an operator needed a clear message. Every other failure in this
    /// contract is prefixed with `Factory: `; these now match.
    fn wired_address(env: &Env, key: &FactoryKey, missing: FactoryError) -> Address {
        env.storage()
            .instance()
            .get(key)
            .unwrap_or_else(|| panic_with_error!(env, missing))
    }
}

#[cfg(test)]
mod test;

// Resource and fee measurements. A unit-test module rather than an integration
// test because this crate is a `cdylib` and nothing outside it can link against
// the contract; see its header for why that is not worth changing.
#[cfg(test)]
mod bench;
