#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, String, Vec};

// ── Constants ──────────────────────────────────────────────────

const MAX_SUPPLY: u64 = 1_000_000;

/// Hard cap on how many token ids a single `tokens_of_owner` page may return.
/// Bounds the ledger read/write footprint of one invocation so a large holder
/// cannot make the call unaffordable.
const MAX_PAGE_SIZE: u32 = 100;

/// The Stellar "zero" account (all-zero ed25519 public key). Soroban has no
/// native null address, so this sentinel is used to reject obviously invalid
/// destinations instead of silently accepting them.
const ZERO_ADDRESS: &str = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

// ── Storage keys ───────────────────────────────────────────────

/// Typed storage keys. Using an enum instead of runtime-constructed `String`
/// keys removes a heap allocation from every storage access and makes key
/// typos a compile-time error rather than a silently missing entry.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum NftKey {
    Admin,
    Counter,
    Version,
    Owner(u64),
    Data(u64),
    /// The single operator currently approved for a token id (ERC-721
    /// `getApproved` semantics), if any.
    Approval(u64),
    /// Blanket operator approval granted by an owner.
    OperatorApproval(Address, Address),
    /// Number of tokens currently owned by an address.
    OwnedCount(Address),
    /// Dense ownership index: `OwnedToken(owner, index) -> token_id`.
    OwnedToken(Address, u64),
    /// Reverse ownership index: `OwnedIndex(owner, token_id) -> index`.
    OwnedIndex(Address, u64),
}

// ── Types ──────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct Attribute {
    pub trait_type: String,
    pub value: String,
    pub display_type: String,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct NftMetadata {
    pub name: String,
    pub description: String,
    pub image_uri: String,
    pub animation_uri: String,
    pub external_url: String,
    pub attributes: Vec<Attribute>,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct NftData {
    pub token_id: u64,
    pub creator: Address,
    pub collection_id: u64,
    pub metadata_uri: String,
    pub minted_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum NftEvent {
    Minted(u64, Address),
    Transferred(u64, Address, Address),
    Burned(u64, Address),
    Approved(u64, Address),
}

fn emit_nft(env: &Env, event: NftEvent) {
    env.events().publish((symbol_short!("nft"),), event);
}

// ── Contract ───────────────────────────────────────────────────

#[contract]
pub struct BezaMintNft;

#[contractimpl]
impl BezaMintNft {
    pub fn initialize(env: Env, admin: Address) {
        if Self::is_initialized(env.clone()) {
            panic!("NFT: already initialized");
        }
        admin.require_auth();
        env.storage().instance().set(&NftKey::Admin, &admin);
        env.storage().instance().set(&NftKey::Counter, &0u64);
        env.storage().instance().set(&NftKey::Version, &1u32);
    }

    /// Returns `true` once `initialize` has succeeded. Deploy tooling uses this
    /// to decide whether a contract still needs initializing.
    pub fn is_initialized(env: Env) -> bool {
        env.storage().instance().has(&NftKey::Admin)
    }

    pub fn mint(env: Env, to: Address, collection_id: u64, metadata_uri: String) -> u64 {
        // Verify the contract has been initialized before use.
        env.storage()
            .instance()
            .get::<NftKey, Address>(&NftKey::Admin)
            .unwrap_or_else(|| panic!("NFT: not initialized"));
        // Recipient-gated: the recipient authorizes the mint so any user can
        // mint through the Factory instead of requiring the contract admin.
        to.require_auth();

        assert!(
            !metadata_uri.is_empty(),
            "NFT: metadata URI cannot be empty"
        );
        assert!(
            metadata_uri.len() <= 512,
            "NFT: metadata URI exceeds 512 chars"
        );
        Self::assert_not_zero(&env, &to, "mint recipient");

        let counter: u64 = env.storage().instance().get(&NftKey::Counter).unwrap_or(0);
        assert!(
            counter < MAX_SUPPLY,
            "NFT: max supply of {MAX_SUPPLY} reached"
        );
        let token_id = counter + 1;
        let ledger = env.ledger();

        let data = NftData {
            token_id,
            creator: to.clone(),
            collection_id,
            metadata_uri,
            minted_at: ledger.timestamp(),
        };
        env.storage().instance().set(&NftKey::Counter, &token_id);
        env.storage()
            .persistent()
            .set(&NftKey::Owner(token_id), &to);
        env.storage()
            .persistent()
            .set(&NftKey::Data(token_id), &data);
        Self::index_add(&env, &to, token_id);

        emit_nft(&env, NftEvent::Minted(token_id, to.clone()));

        token_id
    }
    pub fn transfer(env: Env, from: Address, to: Address, token_id: u64) {
        from.require_auth();
        let current: Address = env
            .storage()
            .persistent()
            .get(&NftKey::Owner(token_id))
            .unwrap_or_else(|| panic!("NFT: token {} does not exist", token_id));
        assert!(current == from, "NFT: caller not owner");
        Self::assert_not_zero(&env, &to, "transfer recipient");

        Self::move_token(&env, &from, &to, token_id);
    }

    /// Move `token_id` from `from` to `to` on behalf of an approved spender.
    ///
    /// The spender must hold either a per-token approval (`approve`) or blanket
    /// approval (`set_approval_for_all`) from the current owner. `from` must be
    /// the actual owner at call time, so a stale approval cannot be used to
    /// move a token after it has changed hands.
    pub fn transfer_from(env: Env, spender: Address, from: Address, to: Address, token_id: u64) {
        spender.require_auth();

        let current: Address = env
            .storage()
            .persistent()
            .get(&NftKey::Owner(token_id))
            .unwrap_or_else(|| panic!("NFT: token {} does not exist", token_id));
        assert!(current == from, "NFT: from is not the token owner");

        let authorised = Self::is_approved(env.clone(), spender.clone(), token_id)
            || Self::is_approved_for_all(env.clone(), from.clone(), spender.clone());
        assert!(authorised, "NFT: spender is not approved for token");
        Self::assert_not_zero(&env, &to, "transfer recipient");

        Self::move_token(&env, &from, &to, token_id);
    }

    /// Shared ownership write path for `transfer` and `transfer_from`.
    ///
    /// A transfer invalidates any approval the previous owner granted for this
    /// token; without this the old operator could move the token straight back
    /// out of the new owner's wallet.
    /// Soroban has no null address, so the all-zero account is rejected as an
    /// explicit sentinel. Without this a typo, a truncated input or an
    /// uninitialised value can permanently strand an asset.
    fn assert_not_zero(env: &Env, address: &Address, context: &str) {
        assert!(
            address != &Address::from_str(env, ZERO_ADDRESS),
            "NFT: zero address is not allowed as {context}"
        );
    }
    fn move_token(env: &Env, from: &Address, to: &Address, token_id: u64) {
        Self::index_remove(env, from, token_id);
        Self::index_add(env, to, token_id);

        env.storage().persistent().set(&NftKey::Owner(token_id), to);
        env.storage()
            .persistent()
            .remove(&NftKey::Approval(token_id));

        emit_nft(
            env,
            NftEvent::Transferred(token_id, from.clone(), to.clone()),
        );
    }

    /// Append `token_id` to an owner's dense index.
    fn index_add(env: &Env, owner: &Address, token_id: u64) {
        let count: u64 = env
            .storage()
            .persistent()
            .get(&NftKey::OwnedCount(owner.clone()))
            .unwrap_or(0);

        env.storage()
            .persistent()
            .set(&NftKey::OwnedToken(owner.clone(), count), &token_id);
        env.storage()
            .persistent()
            .set(&NftKey::OwnedIndex(owner.clone(), token_id), &count);
        env.storage()
            .persistent()
            .set(&NftKey::OwnedCount(owner.clone()), &(count + 1));
    }

    /// Remove `token_id` from an owner's dense index using swap-removal, which
    /// keeps the index dense in O(1) storage operations instead of shifting the
    /// tail of a vector.
    fn index_remove(env: &Env, owner: &Address, token_id: u64) {
        let count: u64 = env
            .storage()
            .persistent()
            .get(&NftKey::OwnedCount(owner.clone()))
            .unwrap_or(0);
        if count == 0 {
            return;
        }

        let index: u64 = match env
            .storage()
            .persistent()
            .get(&NftKey::OwnedIndex(owner.clone(), token_id))
        {
            Some(index) => index,
            None => return,
        };
        let last = count - 1;

        if index != last {
            let moved: u64 = env
                .storage()
                .persistent()
                .get(&NftKey::OwnedToken(owner.clone(), last))
                .unwrap_or_else(|| panic!("NFT: ownership index is inconsistent"));
            env.storage()
                .persistent()
                .set(&NftKey::OwnedToken(owner.clone(), index), &moved);
            env.storage()
                .persistent()
                .set(&NftKey::OwnedIndex(owner.clone(), moved), &index);
        }

        env.storage()
            .persistent()
            .remove(&NftKey::OwnedToken(owner.clone(), last));
        env.storage()
            .persistent()
            .remove(&NftKey::OwnedIndex(owner.clone(), token_id));
        env.storage()
            .persistent()
            .set(&NftKey::OwnedCount(owner.clone()), &last);
    }

    pub fn approve(env: Env, operator: Address, token_id: u64) {
        let owner: Address = env
            .storage()
            .persistent()
            .get(&NftKey::Owner(token_id))
            .unwrap_or_else(|| panic!("NFT: cannot approve nonexistent token {}", token_id));
        owner.require_auth();
        Self::assert_not_zero(&env, &operator, "approval operator");
        env.storage()
            .persistent()
            .set(&NftKey::Approval(token_id), &operator);

        emit_nft(&env, NftEvent::Approved(token_id, operator));
    }

    pub fn set_approval_for_all(env: Env, owner_addr: Address, operator: Address, approved: bool) {
        owner_addr.require_auth();
        if approved {
            Self::assert_not_zero(&env, &operator, "approval operator");
        }
        env.storage()
            .persistent()
            .set(&NftKey::OperatorApproval(owner_addr, operator), &approved);
    }

    pub fn burn(env: Env, token_id: u64) {
        let owner: Address = env
            .storage()
            .persistent()
            .get(&NftKey::Owner(token_id))
            .unwrap_or_else(|| panic!("NFT: cannot burn nonexistent token {}", token_id));
        owner.require_auth();
        Self::index_remove(&env, &owner, token_id);
        env.storage().persistent().remove(&NftKey::Owner(token_id));
        env.storage().persistent().remove(&NftKey::Data(token_id));
        // Burn must not leave a dangling operator approval behind: token ids
        // are not recycled today, but a stale approval would be a latent
        // privilege grant if that ever changed.
        env.storage()
            .persistent()
            .remove(&NftKey::Approval(token_id));

        emit_nft(&env, NftEvent::Burned(token_id, owner));
    }

    pub fn total_supply(env: Env) -> u64 {
        env.storage().instance().get(&NftKey::Counter).unwrap_or(0)
    }

    pub fn owner_of(env: Env, token_id: u64) -> Address {
        env.storage()
            .persistent()
            .get(&NftKey::Owner(token_id))
            .unwrap_or_else(|| panic!("NFT: token {} not found", token_id))
    }

    pub fn token_data(env: Env, token_id: u64) -> NftData {
        env.storage()
            .persistent()
            .get(&NftKey::Data(token_id))
            .unwrap_or_else(|| panic!("NFT: data for token {} not found", token_id))
    }

    /// Number of tokens currently held by `owner`.
    ///
    /// Backed by the dense per-owner index, so this is a single storage read
    /// rather than the previous scan of every token id up to `total_supply`
    /// (which grows without bound and would eventually exceed the ledger's
    /// per-invocation budget).
    pub fn balance_of(env: Env, owner: Address) -> u64 {
        env.storage()
            .persistent()
            .get(&NftKey::OwnedCount(owner))
            .unwrap_or(0)
    }

    /// Paginated enumeration of the token ids owned by `owner`.
    ///
    /// `start` is a zero-based index into the owner's holdings and `limit` is
    /// clamped to [`MAX_PAGE_SIZE`]. Returns an empty vector when `start` is at
    /// or past the end of the owner's holdings.
    pub fn tokens_of_owner(env: Env, owner: Address, start: u64, limit: u32) -> Vec<u64> {
        let mut tokens = Vec::new(&env);
        let count: u64 = env
            .storage()
            .persistent()
            .get(&NftKey::OwnedCount(owner.clone()))
            .unwrap_or(0);
        if start >= count {
            return tokens;
        }

        let page = core::cmp::min(limit, MAX_PAGE_SIZE);
        let end = core::cmp::min(start.saturating_add(page as u64), count);

        let mut index = start;
        while index < end {
            if let Some(token_id) = env
                .storage()
                .persistent()
                .get(&NftKey::OwnedToken(owner.clone(), index))
            {
                tokens.push_back(token_id);
            }
            index += 1;
        }
        tokens
    }

    pub fn is_approved(env: Env, operator: Address, token_id: u64) -> bool {
        env.storage()
            .persistent()
            .get::<NftKey, Address>(&NftKey::Approval(token_id))
            .map(|approved| approved == operator)
            .unwrap_or(false)
    }

    pub fn is_approved_for_all(env: Env, owner: Address, operator: Address) -> bool {
        env.storage()
            .persistent()
            .get(&NftKey::OperatorApproval(owner, operator))
            .unwrap_or(false)
    }
}

#[cfg(test)]
mod test;
