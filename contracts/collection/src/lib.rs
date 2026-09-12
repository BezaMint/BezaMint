#![no_std]

//! BezaMint Collection contract.
//!
//! Owns the collection registry: creation, metadata updates, archiving and
//! NFT membership. A collection is owned by its creator, who authorizes every
//! mutation. The Factory creates collections on behalf of users
//! (`create_collection_for_creator`) and links minted NFTs via `add_nft`;
//! membership is enforced atomically with the mint, so a token can never be
//! minted into a collection its creator does not control.
//!
//! ## Authorization model
//!
//! - `create_collection` / `update_collection` / `archive_collection`:
//!   creator-gated (`creator.require_auth`).
//! - `add_nft` / `remove_nft`: collection-creator-gated, enforced inside the
//!   cross-contract call from the Factory.
//!
//! ## Invariants
//!
//! - A token belongs to at most one collection (`get_collection_for_nft`).
//! - `nft_count` is tracked directly and can never exceed
//!   [`MAX_NFTS_PER_COLLECTION`].
//! - Archived collections cannot accept new NFTs or be updated.
//!
//! State expiration is managed explicitly (same policy as the NFT contract).

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, Address,
    BytesN, Env, String, Vec,
};

/// The Stellar "zero" account (all-zero ed25519 public key). Soroban has no
/// native null address, so this sentinel is used to reject obviously invalid
/// destinations — here, an admin that could never authorize anything — rather
/// than silently accepting them.
const ZERO_ADDRESS: &str = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

/// Upper bound on how many NFTs a single collection may hold. Kept at module
/// scope so the enforcement point and the documentation cannot drift apart.
///
/// The number is not a policy choice made in isolation: membership is one dense
/// `Vec<u64>` entry, and Stellar caps a contract-data entry at 65,536 bytes. An
/// `Vec<u64>` of `n` ids encodes as a 4-byte length plus 8 bytes per id, so
/// `n <= 8_191` fits (65,532 bytes) and `n = 8_192` does not (65,540).
///
/// The previous value of 10,000 encoded to 80,004 bytes, so the advertised cap
/// was unreachable: the write that would have added the 8,192nd token failed
/// against the entry limit, and the contract could not honour the number it
/// documented. 8,000 keeps the promise with 1.5 KB of headroom for the entry
/// framing around the vector.
pub const MAX_NFTS_PER_COLLECTION: u64 = 8_000;

/// The largest membership vector that fits a single ledger entry, restated here
/// so the test that guards it and this constant cannot drift apart.
pub const MAX_ENTRY_BYTES: u64 = 65_536;

/// Maximum accepted length of a collection metadata URI, in bytes. Mirrors the
/// NFT contract's limit so a URI is never valid in one place and rejected in
/// the other.
pub const MAX_METADATA_URI_LEN: u32 = 512;

/// Hard cap on how many ids a single creator-listing page may return, so a
/// caller cannot force an unbounded read of the creator index.
pub const MAX_PAGE_SIZE: u32 = 100;

/// Storage schema version written by this build. Bump it whenever the persisted
/// layout changes and add the matching step to [`BezaMintCollection::migrate`].
pub const STORAGE_VERSION: u32 = 1;

/// State-expiration (TTL) policy. Soroban entries silently archive once their
/// TTL elapses and then read as missing, so a collection whose record archived
/// would vanish from listings while its id still exists. Every write refreshes
/// the touched entries to the network maximum ([`TTL_LEDGERS`] = Stellar's
/// `MAXIMUM_ENTRY_TTL_LEDGERS`, ~1 year at 5s per ledger), and the primary
/// getters bump entries that have fallen below half-life so actively used
/// collections stay alive indefinitely.
const TTL_LEDGERS: u32 = 6_312_000;
const TTL_THRESHOLD: u32 = TTL_LEDGERS / 2;

// ─────────────────────────── Types ───────────────────────────

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct CollectionMetadata {
    pub name: String,
    pub description: String,
    pub image_uri: String,
    pub external_url: String,
    pub category: String,
    pub creator: Address,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct CollectionData {
    pub id: u64,
    pub creator: Address,
    pub metadata_uri: String,
    pub nft_count: u64,
    pub created_at: u64,
    pub updated_at: u64,
    pub is_archived: bool,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum ColKey {
    Admin,
    Counter,
    Version,
    Collection(u64),
    NftCollection(u64),
    NftsInCollection(u64),
    /// Dense list of collection ids created by an address, in creation order.
    CreatorCollections(Address),
}

// ─────────────────────────── Events ───────────────────────────

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum ColEvent {
    Created(u64, Address),
    Updated(u64),
    Archived(u64),
    NftAdded(u64, u64),
    NftRemoved(u64, u64),
    /// The admin role moved to a new address.
    AdminChanged(Address),

    /// The stored schema version advanced. A migration changes what stored
    /// values mean, so the one operation that most needs a timestamped on-chain
    /// record is the one that previously left none.
    Migrated(u32, u32),
}

fn emit(env: &Env, event: ColEvent) {
    env.events().publish((symbol_short!("col"),), event);
}

/// Extend the TTL of a persistent entry to [`TTL_LEDGERS`] when its remaining
/// life is at or below [`TTL_THRESHOLD`]. Cheap no-op otherwise, so it is safe
/// to call on every access path.
fn bump_ttl(env: &Env, key: &ColKey) {
    env.storage()
        .persistent()
        .extend_ttl(key, TTL_THRESHOLD, TTL_LEDGERS);
}

/// Panic unless the stored schema version matches this build.
///
/// The constructor writes `Version` but nothing used to read it, so an in-place
/// `upgrade` that changed a stored layout would decode old entries into the new
/// struct and return garbage rather than failing. Every mutating path consults
/// the version first so the mismatch is loud and immediate.
fn assert_version(env: &Env) {
    let found: u32 = env.storage().instance().get(&ColKey::Version).unwrap_or(0);
    if found != STORAGE_VERSION {
        panic_with_error!(env, CollectionError::StorageVersionMismatch);
    }
}

/// True when `s` begins with `prefix`. Soroban's `String` has no
/// `starts_with`, so the string is copied into a stack buffer (bounded by
/// [`MAX_METADATA_URI_LEN`]) and compared at the byte level.
fn starts_with(s: &String, prefix: &[u8]) -> bool {
    if s.len() < prefix.len() as u32 {
        return false;
    }
    let mut buf = [0u8; MAX_METADATA_URI_LEN as usize];
    let slice = &mut buf[..s.len() as usize];
    s.copy_into_slice(slice);
    slice.starts_with(prefix)
}

// ─────────────────────────── Errors ───────────────────────────

/// Typed contract errors.
///
/// A numeric code is part of the contract's public interface and the committed
/// ABI snapshot; callers switch on it instead of substring-matching a message.
/// Codes are grouped by subsystem and are never renumbered once shipped.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum CollectionError {
    /// The contract has not been constructed.
    NotInitialized = 1,
    /// Stored schema version does not match this build; run `migrate`.
    StorageVersionMismatch = 2,
    /// `migrate` was given a `from_version` that is not what is stored.
    StoredVersionMismatch = 3,
    /// `migrate` called when storage is already at this build's version.
    AlreadyAtCurrentVersion = 4,
    /// Metadata URI is empty.
    MetadataUriEmpty = 5,
    /// Metadata URI exceeds [`MAX_METADATA_URI_LEN`].
    MetadataUriTooLong = 6,
    /// Metadata URI does not use an https, http or ipfs scheme.
    MetadataUriSchemeInvalid = 7,
    /// No collection exists with the supplied id.
    CollectionNotFound = 8,
    /// Caller is not the collection's creator.
    NotCollectionCreator = 9,
    /// The collection is archived and cannot be mutated.
    CollectionArchived = 10,
    /// [`MAX_NFTS_PER_COLLECTION`] reached.
    CollectionFull = 11,
    /// The token already belongs to a collection.
    TokenAlreadyInCollection = 12,
    /// Internal membership index is out of bounds. Indicates a logic defect,
    /// not caller error.
    NftIndexOutOfBounds = 13,
    /// `set_admin` was given the all-zero account.
    AdminZeroAddress = 14,
}

// ─────────────────────────── Contract ───────────────────────────

#[contract]
pub struct BezaMintCollection;

#[contractimpl]
impl BezaMintCollection {
    /// Constructor: runs atomically as part of contract creation.
    ///
    /// Initialization previously required a second, publicly callable
    /// transaction after deployment. Because deployment and initialization are
    /// separate transactions, any observer could call `initialize` first,
    /// satisfy `require_auth()` with their own signature and become the admin of
    /// a contract the deployer had just paid to create. A constructor executes
    /// inside contract creation, so there is no window to race; it deliberately
    /// performs no `require_auth`, because the only party who can run it is the
    /// deployer, inside the deployment invocation itself.
    pub fn __constructor(env: Env, admin: Address) {
        env.storage().instance().set(&ColKey::Admin, &admin);
        env.storage().instance().set(&ColKey::Counter, &0u64);
        env.storage().instance().set(&ColKey::Version, &1u32);
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
            .get(&ColKey::Admin)
            .unwrap_or_else(|| panic_with_error!(&env, CollectionError::NotInitialized))
    }

    /// Returns `true` once `initialize` has succeeded.
    pub fn is_initialized(env: Env) -> bool {
        env.storage().instance().has(&ColKey::Admin)
    }

    /// Stored schema version (`0` before the constructor runs).
    pub fn version(env: Env) -> u32 {
        env.storage().instance().get(&ColKey::Version).unwrap_or(0)
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
            .get(&ColKey::Admin)
            .unwrap_or_else(|| panic_with_error!(&env, CollectionError::NotInitialized));
        admin.require_auth();

        let stored: u32 = env.storage().instance().get(&ColKey::Version).unwrap_or(0);
        if stored != from_version {
            panic_with_error!(&env, CollectionError::StoredVersionMismatch);
        }
        if from_version == STORAGE_VERSION {
            panic_with_error!(&env, CollectionError::AlreadyAtCurrentVersion);
        }

        env.storage()
            .instance()
            .set(&ColKey::Version, &STORAGE_VERSION);
        emit(&env, ColEvent::Migrated(from_version, STORAGE_VERSION));
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
            .get(&ColKey::Admin)
            .unwrap_or_else(|| panic_with_error!(&env, CollectionError::NotInitialized));
        admin.require_auth();

        env.deployer().update_current_contract_wasm(new_wasm_hash);
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_LEDGERS);
    }

    /// Transfer the admin role to `new_admin`. Admin-only.
    ///
    /// The admin can upgrade this contract and advance its schema version, so
    /// without rotation a lost or compromised key is unrecoverable. Rotation is
    /// part of the recovery procedure in `docs/mainnet-readiness.md`.
    ///
    /// The zero account is rejected, because an admin that cannot sign is
    /// indistinguishable from no admin at all.
    pub fn set_admin(env: Env, new_admin: Address) {
        assert_version(&env);
        let admin: Address = env
            .storage()
            .instance()
            .get(&ColKey::Admin)
            .unwrap_or_else(|| panic_with_error!(&env, CollectionError::NotInitialized));
        admin.require_auth();

        if new_admin == Address::from_str(&env, ZERO_ADDRESS) {
            panic_with_error!(&env, CollectionError::AdminZeroAddress);
        }

        env.storage().instance().set(&ColKey::Admin, &new_admin);
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_LEDGERS);

        emit(&env, ColEvent::AdminChanged(new_admin));
    }

    pub fn create_collection(env: Env, creator: Address, metadata_uri: String) -> u64 {
        assert_version(&env);
        // Verify the contract has been initialized before use.
        env.storage()
            .instance()
            .get::<ColKey, Address>(&ColKey::Admin)
            .unwrap_or_else(|| panic_with_error!(&env, CollectionError::NotInitialized));
        // Creator-gated: the collection creator authorizes creation so any user
        // can create collections through the Factory instead of requiring admin.
        creator.require_auth();

        Self::validate_metadata_uri(&env, &metadata_uri);

        let counter: u64 = env.storage().instance().get(&ColKey::Counter).unwrap_or(0);

        let id = counter + 1;
        let ledger = env.ledger();

        let data = CollectionData {
            id,
            creator: creator.clone(),
            metadata_uri,
            nft_count: 0,
            created_at: ledger.timestamp(),
            updated_at: ledger.timestamp(),
            is_archived: false,
        };

        env.storage().instance().set(&ColKey::Counter, &id);
        env.storage()
            .persistent()
            .set(&ColKey::Collection(id), &data);
        bump_ttl(&env, &ColKey::Collection(id));
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_LEDGERS);

        // Maintain a per-creator index so listing a creator's collections does
        // not require scanning every collection in the contract.
        let mut owned: Vec<u64> = env
            .storage()
            .persistent()
            .get(&ColKey::CreatorCollections(creator.clone()))
            .unwrap_or_else(|| Vec::new(&env));
        owned.push_back(id);
        env.storage()
            .persistent()
            .set(&ColKey::CreatorCollections(creator.clone()), &owned);
        bump_ttl(&env, &ColKey::CreatorCollections(creator.clone()));

        emit(&env, ColEvent::Created(id, creator));

        id
    }

    pub fn update_collection(env: Env, creator: Address, id: u64, new_metadata_uri: String) {
        assert_version(&env);
        creator.require_auth();

        let mut data: CollectionData = env
            .storage()
            .persistent()
            .get(&ColKey::Collection(id))
            .unwrap_or_else(|| panic_with_error!(&env, CollectionError::CollectionNotFound));

        if data.creator != creator {
            panic_with_error!(&env, CollectionError::NotCollectionCreator);
        }
        if data.is_archived {
            panic_with_error!(&env, CollectionError::CollectionArchived);
        }
        // `create_collection` validates the URI; the update path previously did
        // not, so a collection could be edited into a state that could never
        // have been created (empty, or longer than the documented limit).
        Self::validate_metadata_uri(&env, &new_metadata_uri);

        data.metadata_uri = new_metadata_uri;
        data.updated_at = env.ledger().timestamp();

        env.storage()
            .persistent()
            .set(&ColKey::Collection(id), &data);
        bump_ttl(&env, &ColKey::Collection(id));

        emit(&env, ColEvent::Updated(id));
    }

    pub fn archive_collection(env: Env, creator: Address, id: u64) {
        assert_version(&env);
        creator.require_auth();

        let mut data: CollectionData = env
            .storage()
            .persistent()
            .get(&ColKey::Collection(id))
            .unwrap_or_else(|| panic_with_error!(&env, CollectionError::CollectionNotFound));

        if data.creator != creator {
            panic_with_error!(&env, CollectionError::NotCollectionCreator);
        }
        data.is_archived = true;
        data.updated_at = env.ledger().timestamp();

        env.storage()
            .persistent()
            .set(&ColKey::Collection(id), &data);
        bump_ttl(&env, &ColKey::Collection(id));

        emit(&env, ColEvent::Archived(id));
    }

    /// Reject metadata URIs that are empty, longer than
    /// [`MAX_METADATA_URI_LEN`], or use an arbitrary scheme. Shared by create
    /// and update so the two paths cannot drift. Only real web/IPFS URLs are
    /// accepted: the frontend renders this string into the DOM, so a
    /// javascript:/data: URI is a stored-XSS vector, and the NFT and Creator
    /// contracts apply the same rule.
    fn validate_metadata_uri(env: &Env, metadata_uri: &String) {
        if metadata_uri.is_empty() {
            panic_with_error!(env, CollectionError::MetadataUriEmpty);
        }
        if metadata_uri.len() > MAX_METADATA_URI_LEN {
            panic_with_error!(env, CollectionError::MetadataUriTooLong);
        }
        if !(starts_with(metadata_uri, b"https://")
            || starts_with(metadata_uri, b"http://")
            || starts_with(metadata_uri, b"ipfs://"))
        {
            panic_with_error!(env, CollectionError::MetadataUriSchemeInvalid);
        }
    }

    /// Attach `token_id` to a collection.
    ///
    /// Authorization: the collection's creator must authorize. The previous
    /// signature accepted an `_admin: Address` parameter that was ignored in
    /// favour of the stored admin, which misled callers into believing their
    /// own address authorized the call. The parameter is gone; ownership of the
    /// collection is the authority.
    ///
    /// Known boundary: the id is validated for uniqueness but not for
    /// existence. This contract holds no pointer to the NFT contract, so a
    /// direct caller who owns a collection can attach ids that were never
    /// minted, and those ids then appear in `get_nfts_in_collection`
    /// and count toward `nft_count`. Enforcing existence would mean a
    /// cross-contract call on every membership write, which would put the cost
    /// of a defensive check on the platform's own mint path; the Factory always
    /// passes an id it just received from a mint, so the platform flow is
    /// unaffected. A consumer that renders membership should treat a token that
    /// fails `owner_of` as absent rather than assuming the network rejected it.
    pub fn add_nft(env: Env, collection_id: u64, token_id: u64) {
        assert_version(&env);
        let mut data: CollectionData = env
            .storage()
            .persistent()
            .get(&ColKey::Collection(collection_id))
            .unwrap_or_else(|| panic_with_error!(&env, CollectionError::CollectionNotFound));

        data.creator.require_auth();
        if data.is_archived {
            panic_with_error!(&env, CollectionError::CollectionArchived);
        }
        if data.nft_count >= MAX_NFTS_PER_COLLECTION {
            panic_with_error!(&env, CollectionError::CollectionFull);
        }

        // A token may belong to at most one collection. Without this guard the
        // same id could be pushed repeatedly, inflating `nft_count` past the
        // number of distinct tokens and double-counting in any consumer that
        // treats the list as a set.
        let existing: u64 = env
            .storage()
            .persistent()
            .get(&ColKey::NftCollection(token_id))
            .unwrap_or(0);
        if existing != 0 {
            panic_with_error!(&env, CollectionError::TokenAlreadyInCollection);
        }

        env.storage()
            .persistent()
            .set(&ColKey::NftCollection(token_id), &collection_id);
        bump_ttl(&env, &ColKey::NftCollection(token_id));

        let mut nfts: Vec<u64> = env
            .storage()
            .persistent()
            .get(&ColKey::NftsInCollection(collection_id))
            .unwrap_or_else(|| Vec::new(&env));

        nfts.push_back(token_id);
        // Increment rather than re-deriving from `nfts.len()`: the count is
        // already tracked in `CollectionData`, so this avoids loading the whole
        // membership vector just to read its length.
        data.nft_count += 1;
        data.updated_at = env.ledger().timestamp();

        env.storage()
            .persistent()
            .set(&ColKey::NftsInCollection(collection_id), &nfts);
        bump_ttl(&env, &ColKey::NftsInCollection(collection_id));
        env.storage()
            .persistent()
            .set(&ColKey::Collection(collection_id), &data);
        bump_ttl(&env, &ColKey::Collection(collection_id));

        emit(&env, ColEvent::NftAdded(collection_id, token_id));
    }

    /// Detach `token_id` from a collection.
    ///
    /// Authorization: the collection's creator must authorize, matching
    /// `add_nft`.
    pub fn remove_nft(env: Env, collection_id: u64, token_id: u64) {
        assert_version(&env);
        let mut data: CollectionData = env
            .storage()
            .persistent()
            .get(&ColKey::Collection(collection_id))
            .unwrap_or_else(|| panic_with_error!(&env, CollectionError::CollectionNotFound));

        data.creator.require_auth();

        let nfts: Vec<u64> = env
            .storage()
            .persistent()
            .get(&ColKey::NftsInCollection(collection_id))
            .unwrap_or_else(|| Vec::new(&env));

        let mut new_nfts: Vec<u64> = Vec::new(&env);
        for i in 0..nfts.len() {
            let id = nfts
                .get(i)
                .unwrap_or_else(|| panic_with_error!(&env, CollectionError::NftIndexOutOfBounds));
            if id != token_id {
                new_nfts.push_back(id);
            }
        }

        // Recompute from the rebuilt vector rather than decrementing: a
        // decrement would silently desynchronise when the token was not a
        // member in the first place (removal is intentionally idempotent).
        data.nft_count = new_nfts.len() as u64;
        data.updated_at = env.ledger().timestamp();

        env.storage()
            .persistent()
            .remove(&ColKey::NftCollection(token_id));
        env.storage()
            .persistent()
            .set(&ColKey::NftsInCollection(collection_id), &new_nfts);
        bump_ttl(&env, &ColKey::NftsInCollection(collection_id));
        env.storage()
            .persistent()
            .set(&ColKey::Collection(collection_id), &data);
        bump_ttl(&env, &ColKey::Collection(collection_id));

        emit(&env, ColEvent::NftRemoved(collection_id, token_id));
    }

    // ── Queries ─────────────────────────────────────────────

    pub fn total_collections(env: Env) -> u64 {
        env.storage().instance().get(&ColKey::Counter).unwrap_or(0)
    }

    pub fn get_collection(env: Env, id: u64) -> CollectionData {
        let key = ColKey::Collection(id);
        match env
            .storage()
            .persistent()
            .get::<ColKey, CollectionData>(&key)
        {
            Some(data) => {
                bump_ttl(&env, &key);
                data
            }
            None => panic_with_error!(&env, CollectionError::CollectionNotFound),
        }
    }

    /// Paginated enumeration of a collection's NFT ids.
    ///
    /// `start` is a zero-based offset into the membership vector and `limit` is
    /// clamped to [`MAX_PAGE_SIZE`]. Returns an empty vector when `start` is at
    /// or past the end. This previously returned the whole membership vector in
    /// one call, which is unbounded as a collection fills up and eventually
    /// exceeds the per-invocation read budget.
    pub fn get_nfts_in_collection(
        env: Env,
        collection_id: u64,
        start: u64,
        limit: u32,
    ) -> Vec<u64> {
        let mut result = Vec::new(&env);

        let nfts: Vec<u64> = env
            .storage()
            .persistent()
            .get(&ColKey::NftsInCollection(collection_id))
            .unwrap_or_else(|| Vec::new(&env));
        let total = nfts.len() as u64;
        if start >= total {
            return result;
        }

        let page = core::cmp::min(limit, MAX_PAGE_SIZE);
        let end = core::cmp::min(start.saturating_add(page as u64), total);

        let mut index = start as u32;
        let end = end as u32;
        while index < end {
            if let Some(id) = nfts.get(index) {
                result.push_back(id);
            }
            index += 1;
        }
        result
    }

    pub fn get_collection_for_nft(env: Env, token_id: u64) -> u64 {
        env.storage()
            .persistent()
            .get(&ColKey::NftCollection(token_id))
            .unwrap_or(0)
    }

    /// Paginated listing of a creator's collection ids.
    ///
    /// `start` is a zero-based offset into the creator's own index and `limit`
    /// is clamped to [`MAX_PAGE_SIZE`]. Archived collections are skipped, so a
    /// page may contain fewer than `limit` entries but never scans collections
    /// belonging to other creators: this previously looped `1..=total` and read
    /// every collection in the contract, which is unbounded as the platform
    /// grows.
    pub fn get_collections_by_creator(
        env: Env,
        creator: Address,
        start: u64,
        limit: u32,
    ) -> Vec<u64> {
        let mut result = Vec::new(&env);

        let owned: Vec<u64> = env
            .storage()
            .persistent()
            .get(&ColKey::CreatorCollections(creator))
            .unwrap_or_else(|| Vec::new(&env));

        let total = owned.len() as u64;
        if start >= total {
            return result;
        }

        let page = core::cmp::min(limit, MAX_PAGE_SIZE);
        let end = core::cmp::min(start.saturating_add(page as u64), total);

        let mut index = start as u32;
        let end = end as u32;
        while index < end {
            if let Some(id) = owned.get(index) {
                if let Some(data) = env
                    .storage()
                    .persistent()
                    .get::<ColKey, CollectionData>(&ColKey::Collection(id))
                {
                    if !data.is_archived {
                        result.push_back(id);
                    }
                }
            }
            index += 1;
        }
        result
    }
}

#[cfg(test)]
mod test;
