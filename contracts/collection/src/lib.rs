#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, String, Vec};

/// Upper bound on how many NFTs a single collection may hold. Kept at module
/// scope so the enforcement point and the documentation cannot drift apart.
const MAX_NFTS_PER_COLLECTION: u64 = 10_000;

/// Maximum accepted length of a collection metadata URI, in bytes. Mirrors the
/// NFT contract's limit so a URI is never valid in one place and rejected in
/// the other.
const MAX_METADATA_URI_LEN: u32 = 512;

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
        env.storage()
            .persistent()
            .set(&ColKey::Collection(collection_id), &data);

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
        env.storage()
            .persistent()
            .set(&ColKey::Collection(collection_id), &data);

        emit(&env, ColEvent::NftRemoved(collection_id, token_id));
    }

    // ── Queries ─────────────────────────────────────────────

    pub fn total_collections(env: Env) -> u64 {
        env.storage().instance().get(&ColKey::Counter).unwrap_or(0)
    }

    pub fn get_collection(env: Env, id: u64) -> CollectionData {
        env.storage()
            .persistent()
            .get(&ColKey::Collection(id))
            .unwrap_or_else(|| panic!("Collection: {} not found", id))
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

    pub fn get_collections_by_creator(env: Env, creator: Address) -> Vec<u64> {
        let total = Self::total_collections(env.clone());
        let mut result = Vec::new(&env);

        for id in 1..=total {
            if let Some(data) = env
                .storage()
                .persistent()
                .get::<ColKey, CollectionData>(&ColKey::Collection(id))
            {
                if data.creator == creator && !data.is_archived {
                    result.push_back(id);
                }
            }
        }
        result
    }
}

#[cfg(test)]
mod test;
