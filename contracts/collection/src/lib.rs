#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, Address, Env, Map, String, Vec,
};

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
    Collection(u64),
    NftCollection(u64),     // nft_token_id -> collection_id
    NftsInCollection(u64),   // collection_id -> Vec<u64>
}

// ─────────────────────────── Events ───────────────────────────

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum ColEvent {
    Created { id: u64, creator: Address, name: String },
    Updated { id: u64 },
    Archived { id: u64 },
    NftAdded { collection_id: u64, token_id: u64 },
    NftRemoved { collection_id: u64, token_id: u64 },
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
        admin.require_auth();
        env.storage().instance().set(&ColKey::Admin, &admin);
        env.storage().instance().set(&ColKey::Counter, &0u64);
    }

    /// Create a new collection — returns the new collection ID
    pub fn create_collection(
        env: Env,
        creator: Address,
        metadata_uri: String,
    ) -> u64 {
        let admin: Address = env.storage().instance().get(&ColKey::Admin).unwrap();
        admin.require_auth();

        let counter: u64 = env
            .storage()
            .instance()
            .get(&ColKey::Counter)
            .unwrap_or(0);

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
        env.storage().persistent().set(&ColKey::Collection(id), &data);

        emit(
            &env,
            ColEvent::Created {
                id,
                creator,
                name: String::from_str(&env, ""),
            },
        );

        id
    }

    /// Update collection metadata URI
    pub fn update_collection(
        env: Env,
        creator: Address,
        id: u64,
        new_metadata_uri: String,
    ) {
        creator.require_auth();

        let mut data: CollectionData = env
            .storage()
            .persistent()
            .get(&ColKey::Collection(id))
            .unwrap_or_else(|| panic!("Collection: {} not found", id));

        assert!(!data.is_archived, "Collection: {} is archived", id);

        data.metadata_uri = new_metadata_uri;
        data.updated_at = env.ledger().timestamp();

        env.storage().persistent().set(&ColKey::Collection(id), &data);

        emit(&env, ColEvent::Updated { id });
    }

    /// Archive a collection (soft-delete)
    pub fn archive_collection(env: Env, creator: Address, id: u64) {
        creator.require_auth();

        let mut data: CollectionData = env
            .storage()
            .persistent()
            .get(&ColKey::Collection(id))
            .unwrap_or_else(|| panic!("Collection: {} not found", id));

        data.is_archived = true;
        data.updated_at = env.ledger().timestamp();

        env.storage().persistent().set(&ColKey::Collection(id), &data);

        emit(&env, ColEvent::Archived { id });
    }

    /// Add an NFT to a collection
    pub fn add_nft(env: Env, admin: Address, collection_id: u64, token_id: u64) {
        let stored_admin: Address = env.storage().instance().get(&ColKey::Admin).unwrap();
        stored_admin.require_auth();

        let mut data: CollectionData = env
            .storage()
            .persistent()
            .get(&ColKey::Collection(collection_id))
            .unwrap_or_else(|| panic!("Collection: {} not found", collection_id));

        assert!(!data.is_archived, "Collection: {} is archived", collection_id);

        // Track which collection this NFT belongs to
        env.storage()
            .persistent()
            .set(&ColKey::NftCollection(token_id), &collection_id);

        // Update the collection's NFT list
        let mut nfts: Vec<u64> = env
            .storage()
            .persistent()
            .get(&ColKey::NftsInCollection(collection_id))
            .unwrap_or_else(|| Vec::new(&env));

        nfts.push_back(token_id);
        data.nft_count = nfts.len() as u64;
        data.updated_at = env.ledger().timestamp();

        env.storage()
            .persistent()
            .set(&ColKey::NftsInCollection(collection_id), &nfts);
        env.storage().persistent().set(&ColKey::Collection(collection_id), &data);

        emit(
            &env,
            ColEvent::NftAdded {
                collection_id,
                token_id,
            },
        );
    }

    /// Remove an NFT from a collection
    pub fn remove_nft(env: Env, admin: Address, collection_id: u64, token_id: u64) {
        let stored_admin: Address = env.storage().instance().get(&ColKey::Admin).unwrap();
        stored_admin.require_auth();

        let mut data: CollectionData = env
            .storage()
            .persistent()
            .get(&ColKey::Collection(collection_id))
            .unwrap_or_else(|| panic!("Collection: {} not found", collection_id));

        let mut nfts: Vec<u64> = env
            .storage()
            .persistent()
            .get(&ColKey::NftsInCollection(collection_id))
            .unwrap_or_else(|| Vec::new(&env));

        // Remove the token ID from the list
        let mut new_nfts: Vec<u64> = Vec::new(&env);
        for i in 0..nfts.len() {
            let id = nfts.get(i).unwrap();
            if id != token_id {
                new_nfts.push_back(id);
            }
        }

        data.nft_count = new_nfts.len() as u64;
        data.updated_at = env.ledger().timestamp();

        env.storage()
            .persistent()
            .remove(&ColKey::NftCollection(token_id));
        env.storage()
            .persistent()
            .set(&ColKey::NftsInCollection(collection_id), &new_nfts);
        env.storage().persistent().set(&ColKey::Collection(collection_id), &data);

        emit(
            &env,
            ColEvent::NftRemoved {
                collection_id,
                token_id,
            },
        );
    }

    // ── Queries ─────────────────────────────────────────────

    pub fn total_collections(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&ColKey::Counter)
            .unwrap_or(0)
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

    /// List collections by creator
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
