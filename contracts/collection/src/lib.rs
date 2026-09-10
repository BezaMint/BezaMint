#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, String, Vec};

/// Upper bound on how many NFTs a single collection may hold. Kept at module
/// scope so the enforcement point and the documentation cannot drift apart.
const MAX_NFTS_PER_COLLECTION: u64 = 10_000;

/// Maximum accepted length of a collection metadata URI, in bytes. Mirrors the
/// NFT contract's limit so a URI is never valid in one place and rejected in
/// the other.
const MAX_METADATA_URI_LEN: u32 = 512;

/// Hard cap on how many ids a single creator-listing page may return, so a
/// caller cannot force an unbounded read of the creator index.
const MAX_PAGE_SIZE: u32 = 100;

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

// ─────────────────────────── Contract ───────────────────────────

#[contract]
pub struct BezaMintCollection;

#[contractimpl]
impl BezaMintCollection {
    pub fn initialize(env: Env, admin: Address) {
        if Self::is_initialized(env.clone()) {
            panic!("Collection: already initialized");
        }
        admin.require_auth();
        env.storage().instance().set(&ColKey::Admin, &admin);
        env.storage().instance().set(&ColKey::Counter, &0u64);
        env.storage().instance().set(&ColKey::Version, &1u32);
        // Instance data and contract code share one TTL; refresh both up front
        // so a long-dormant contract does not silently lose its admin binding.
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_LEDGERS);
    }

    /// Returns `true` once `initialize` has succeeded.
    pub fn is_initialized(env: Env) -> bool {
        env.storage().instance().has(&ColKey::Admin)
    }

    pub fn create_collection(env: Env, creator: Address, metadata_uri: String) -> u64 {
        // Verify the contract has been initialized before use.
        env.storage()
            .instance()
            .get::<ColKey, Address>(&ColKey::Admin)
            .unwrap_or_else(|| panic!("Collection: not initialized"));
        // Creator-gated: the collection creator authorizes creation so any user
        // can create collections through the Factory instead of requiring admin.
        creator.require_auth();

        Self::validate_metadata_uri(&metadata_uri);

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
        creator.require_auth();

        let mut data: CollectionData = env
            .storage()
            .persistent()
            .get(&ColKey::Collection(id))
            .unwrap_or_else(|| panic!("Collection: {} not found", id));

        assert!(
            data.creator == creator,
            "Collection: caller is not the collection creator"
        );
        assert!(!data.is_archived, "Collection: {id} is archived");
        // `create_collection` validates the URI; the update path previously did
        // not, so a collection could be edited into a state that could never
        // have been created (empty, or longer than the documented limit).
        Self::validate_metadata_uri(&new_metadata_uri);

        data.metadata_uri = new_metadata_uri;
        data.updated_at = env.ledger().timestamp();

        env.storage()
            .persistent()
            .set(&ColKey::Collection(id), &data);
        bump_ttl(&env, &ColKey::Collection(id));

        emit(&env, ColEvent::Updated(id));
    }

    pub fn archive_collection(env: Env, creator: Address, id: u64) {
        creator.require_auth();

        let mut data: CollectionData = env
            .storage()
            .persistent()
            .get(&ColKey::Collection(id))
            .unwrap_or_else(|| panic!("Collection: {} not found", id));

        assert!(
            data.creator == creator,
            "Collection: caller is not the collection creator"
        );
        data.is_archived = true;
        data.updated_at = env.ledger().timestamp();

        env.storage()
            .persistent()
            .set(&ColKey::Collection(id), &data);
        bump_ttl(&env, &ColKey::Collection(id));

        emit(&env, ColEvent::Archived(id));
    }

    /// Reject metadata URIs that are empty or longer than
    /// [`MAX_METADATA_URI_LEN`]. Shared by create and update so the two paths
    /// cannot drift.
    fn validate_metadata_uri(metadata_uri: &String) {
        assert!(
            !metadata_uri.is_empty(),
            "Collection: metadata URI cannot be empty"
        );
        assert!(
            metadata_uri.len() <= MAX_METADATA_URI_LEN,
            "Collection: metadata URI exceeds {MAX_METADATA_URI_LEN} chars"
        );
    }

    /// Attach `token_id` to a collection.
    ///
    /// Authorization: the collection's creator must authorize. The previous
    /// signature accepted an `_admin: Address` parameter that was ignored in
    /// favour of the stored admin, which misled callers into believing their
    /// own address authorized the call. The parameter is gone; ownership of the
    /// collection is the authority.
    pub fn add_nft(env: Env, collection_id: u64, token_id: u64) {
        let mut data: CollectionData = env
            .storage()
            .persistent()
            .get(&ColKey::Collection(collection_id))
            .unwrap_or_else(|| panic!("Collection: {} not found", collection_id));

        data.creator.require_auth();
        assert!(!data.is_archived, "Collection: {collection_id} is archived");
        assert!(
            data.nft_count < MAX_NFTS_PER_COLLECTION,
            "Collection: {collection_id} is full"
        );

        // A token may belong to at most one collection. Without this guard the
        // same id could be pushed repeatedly, inflating `nft_count` past the
        // number of distinct tokens and double-counting in any consumer that
        // treats the list as a set.
        let existing: u64 = env
            .storage()
            .persistent()
            .get(&ColKey::NftCollection(token_id))
            .unwrap_or(0);
        assert!(
            existing == 0,
            "Collection: token {token_id} already belongs to a collection"
        );

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
    /// [`Self::add_nft`].
    pub fn remove_nft(env: Env, collection_id: u64, token_id: u64) {
        let mut data: CollectionData = env
            .storage()
            .persistent()
            .get(&ColKey::Collection(collection_id))
            .unwrap_or_else(|| panic!("Collection: {} not found", collection_id));

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
                .unwrap_or_else(|| panic!("Collection: nft index out of bounds"));
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
            None => panic!("Collection: {id} not found"),
        }
    }

    pub fn get_nfts_in_collection(env: Env, collection_id: u64) -> Vec<u64> {
        env.storage()
            .persistent()
            .get(&ColKey::NftsInCollection(collection_id))
            .unwrap_or_else(|| Vec::new(&env))
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
