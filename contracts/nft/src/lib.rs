#![no_std]

//! BezaMint NFT contract.
//!
//! Owns the token registry: minting, transfers (including operator
//! transfers), approvals, burning and ownership enumeration. One contract
//! instance serves every collection on the platform; tokens are attributed to
//! collections by id and the Factory links them to the Collection contract.
//!
//! ## Authorization model
//!
//! - `mint` is recipient-gated: the recipient authorizes, so any user can
//!   mint through the Factory instead of requiring the admin.
//! - `transfer` and `burn` require the current owner's auth.
//! - `transfer_from` requires an approved operator's auth, with per-token and
//!   blanket approvals (ERC-721 `getApproved`/`isApprovedForAll` semantics).
//!
//! ## Invariants
//!
//! - Token ids are never recycled: `total_supply` is a monotonic counter.
//! - A token belongs to at most one owner and one collection at a time.
//! - A transfer invalidates the previous owner's approval for that token.
//! - The zero (all-null) account is rejected as a recipient or operator, so
//!   an asset can never be stranded at an unusable address.
//!
//! State expiration is managed explicitly: every write refreshes the touched
//! persistent entries to the network-maximum TTL and hot reads bump entries
//! past half-life, so ownership records cannot silently archive.

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, Address, BytesN, Env, String, Vec,
};

// ── Constants ──────────────────────────────────────────────────

/// Upper bound on minted token ids (and therefore on `total_supply`). Guards
/// the counter against unbounded growth and keeps the contract's resource
/// footprint predictable.
pub const MAX_SUPPLY: u64 = 1_000_000;

/// Hard cap on how many token ids a single `tokens_of_owner` page may return.
/// Bounds the ledger read/write footprint of one invocation so a large holder
/// cannot make the call unaffordable.
pub const MAX_PAGE_SIZE: u32 = 100;

/// Maximum accepted length of an NFT metadata URI, in bytes. Mirrors the
/// Collection contract's limit so a URI is never valid in one place and
/// rejected in the other.
pub const MAX_METADATA_URI_LEN: u32 = 512;

/// The Stellar "zero" account (all-zero ed25519 public key). Soroban has no
/// native null address, so this sentinel is used to reject obviously invalid
/// destinations instead of silently accepting them.
const ZERO_ADDRESS: &str = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

/// State-expiration (TTL) policy. Soroban entries silently archive once their
/// TTL elapses and then read as missing, so an NFT whose ownership record
/// archived would appear to vanish from the ledger. Every write therefore
/// refreshes the touched entries to the network maximum
/// ([`TTL_LEDGERS`] = Stellar's `MAXIMUM_ENTRY_TTL_LEDGERS`, ~1 year at 5s
/// per ledger), and every hot read bumps entries that have fallen below
/// half-life so actively used NFTs stay alive indefinitely.
/// Network-maximum TTL in ledgers (Stellar's `MAXIMUM_ENTRY_TTL_LEDGERS`,
/// ~1 year at 5s per ledger).
const TTL_LEDGERS: u32 = 6_312_000;
/// Entries at or below this remaining TTL are bumped back to [`TTL_LEDGERS`]
/// on access, i.e. reads refresh past half-life.
const TTL_THRESHOLD: u32 = TTL_LEDGERS / 2;

// ── Storage keys ───────────────────────────────────────────────

/// Typed storage keys. Using an enum instead of runtime-constructed `String`
/// keys removes a heap allocation from every storage access and makes key
/// typos a compile-time error rather than a silently missing entry.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum NftKey {
    /// Contract admin address.
    Admin,
    /// Monotonic minted-token counter (`total_supply`).
    Counter,
    /// Contract schema version.
    Version,
    /// Current owner of a token id.
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

/// A single metadata attribute (trait) of an NFT, mirroring the ERC-721
/// metadata extension shape so off-chain indexers can map it directly.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct Attribute {
    /// Attribute name, e.g. "Background".
    pub trait_type: String,
    /// Attribute value, e.g. "Gold".
    pub value: String,
    /// Optional rendering hint (e.g. "number"); empty when unused.
    pub display_type: String,
}

/// Structured metadata for an NFT, kept for on-chain consumers. The mint path
/// stores a metadata URI; the full metadata object is populated off-chain.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct NftMetadata {
    /// Display name of the NFT.
    pub name: String,
    /// Human-readable description.
    pub description: String,
    /// URI of the primary image asset.
    pub image_uri: String,
    /// URI of the animated/3D asset; empty when none.
    pub animation_uri: String,
    /// External link for the NFT; empty when none.
    pub external_url: String,
    /// Trait list.
    pub attributes: Vec<Attribute>,
}

/// On-chain record for a minted NFT. This is what `token_data` returns and
/// what the frontend renders from.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct NftData {
    /// Unique token id (never recycled).
    pub token_id: u64,
    /// Account that minted the NFT.
    pub creator: Address,
    /// Id of the collection this token belongs to (0 when unlinked).
    pub collection_id: u64,
    /// Metadata URI, restricted to https/http/ipfs schemes.
    pub metadata_uri: String,
    /// Ledger timestamp at mint time.
    pub minted_at: u64,
}

/// Events published by the NFT contract under the `nft` topic. These are the
/// contract's public interface for indexers and the frontend; the schema is
/// pinned by tests.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum NftEvent {
    /// A token was minted to `Address`.
    Minted(u64, Address),
    /// A token moved from one owner to another.
    Transferred(u64, Address, Address),
    /// A token was permanently destroyed.
    Burned(u64, Address),
    /// A per-token operator approval was granted.
    Approved(u64, Address),
}

fn emit_nft(env: &Env, event: NftEvent) {
    env.events().publish((symbol_short!("nft"),), event);
}

/// Extend the TTL of a persistent entry to [`TTL_LEDGERS`] when its remaining
/// life is at or below [`TTL_THRESHOLD`]. Cheap no-op otherwise, so it is safe
/// to call on every access path.
fn bump_ttl(env: &Env, key: &NftKey) {
    env.storage()
        .persistent()
        .extend_ttl(key, TTL_THRESHOLD, TTL_LEDGERS);
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

// ── Contract ───────────────────────────────────────────────────

#[contract]
pub struct BezaMintNft;

#[contractimpl]
impl BezaMintNft {
    /// One-time setup. Stores the admin and resets the token counter. Only the
    /// admin may call, and only once: re-initialization would reset the counter
    /// and let an attacker mint over existing token ids, so it is rejected.
    pub fn initialize(env: Env, admin: Address) {
        if Self::is_initialized(env.clone()) {
            panic!("NFT: already initialized");
        }
        admin.require_auth();
        env.storage().instance().set(&NftKey::Admin, &admin);
        env.storage().instance().set(&NftKey::Counter, &0u64);
        env.storage().instance().set(&NftKey::Version, &1u32);
        // Instance data and contract code share one TTL; refresh both up front
        // so a long-dormant contract does not silently lose its admin binding.
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_LEDGERS);
    }

    /// Returns `true` once `initialize` has succeeded. Deploy tooling uses this
    /// to decide whether a contract still needs initializing.
    pub fn is_initialized(env: Env) -> bool {
        env.storage().instance().has(&NftKey::Admin)
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
            .get(&NftKey::Admin)
            .unwrap_or_else(|| panic!("NFT: not initialized"));
        admin.require_auth();

        env.deployer().update_current_contract_wasm(new_wasm_hash);
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_LEDGERS);
    }

    /// Mint a new NFT to `to` and return its token id. Recipient-gated: `to`
    /// must authorize. The metadata URI must be a non-empty https/http/ipfs
    /// URL of at most [`MAX_METADATA_URI_LEN`] chars. In the platform flow this
    /// is called by the Factory, which then links the token to its collection
    /// and configures its royalty.
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
            metadata_uri.len() <= MAX_METADATA_URI_LEN,
            "NFT: metadata URI exceeds {MAX_METADATA_URI_LEN} chars"
        );
        // Only real web/IPFS URLs are accepted. The frontend renders this
        // string into the DOM, so an arbitrary scheme (javascript:, data:) is a
        // stored-XSS vector, and the Collection contract applies the same rule.
        assert!(
            starts_with(&metadata_uri, b"https://")
                || starts_with(&metadata_uri, b"http://")
                || starts_with(&metadata_uri, b"ipfs://"),
            "NFT: metadata URI must use an https, http or ipfs scheme"
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
        bump_ttl(&env, &NftKey::Owner(token_id));
        env.storage()
            .persistent()
            .set(&NftKey::Data(token_id), &data);
        bump_ttl(&env, &NftKey::Data(token_id));
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_LEDGERS);
        Self::index_add(&env, &to, token_id);

        emit_nft(&env, NftEvent::Minted(token_id, to.clone()));

        token_id
    }
    /// Transfer `token_id` from the owner to `to`. Owner-only (the `from`
    /// address must be the current owner). The new owner must not be the zero
    /// account, and any approval the old owner granted for this token is
    /// invalidated.
    pub fn transfer(env: Env, from: Address, to: Address, token_id: u64) {
        from.require_auth();
        let current: Address = env
            .storage()
            .persistent()
            .get(&NftKey::Owner(token_id))
            .unwrap_or_else(|| panic!("NFT: token {token_id} not found"));
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
            .unwrap_or_else(|| panic!("NFT: token {token_id} not found"));
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
        bump_ttl(env, &NftKey::Owner(token_id));
        env.storage()
            .persistent()
            .remove(&NftKey::Approval(token_id));
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_LEDGERS);

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
        bump_ttl(env, &NftKey::OwnedToken(owner.clone(), count));
        bump_ttl(env, &NftKey::OwnedIndex(owner.clone(), token_id));
        bump_ttl(env, &NftKey::OwnedCount(owner.clone()));
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
        bump_ttl(env, &NftKey::OwnedCount(owner.clone()));
    }

    /// Grant `operator` the right to transfer a single token (ERC-721
    /// `approve`). Owner-only; replacing the operator overwrites the previous
    /// approval, and a transfer revokes it.
    pub fn approve(env: Env, operator: Address, token_id: u64) {
        let owner: Address = env
            .storage()
            .persistent()
            .get(&NftKey::Owner(token_id))
            .unwrap_or_else(|| panic!("NFT: token {token_id} not found"));
        owner.require_auth();
        Self::assert_not_zero(&env, &operator, "approval operator");
        bump_ttl(&env, &NftKey::Owner(token_id));
        env.storage()
            .persistent()
            .set(&NftKey::Approval(token_id), &operator);
        bump_ttl(&env, &NftKey::Approval(token_id));

        emit_nft(&env, NftEvent::Approved(token_id, operator));
    }

    /// Grant or revoke `operator` the blanket right to transfer all of the
    /// owner's tokens (ERC-721 `setApprovalForAll`). Owner-only.
    pub fn set_approval_for_all(env: Env, owner_addr: Address, operator: Address, approved: bool) {
        owner_addr.require_auth();
        if approved {
            Self::assert_not_zero(&env, &operator, "approval operator");
        }
        let key = NftKey::OperatorApproval(owner_addr, operator);
        env.storage().persistent().set(&key, &approved);
        bump_ttl(&env, &key);
    }

    /// Permanently destroy a token. Owner-only. Token ids are not recycled, so
    /// `total_supply` keeps counting the burned token; any per-token approval
    /// is removed so it cannot be revived into a latent privilege grant.
    pub fn burn(env: Env, token_id: u64) {
        let owner: Address = env
            .storage()
            .persistent()
            .get(&NftKey::Owner(token_id))
            .unwrap_or_else(|| panic!("NFT: token {token_id} not found"));
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

    /// Highest minted token id (never decreases; burned tokens still count).
    pub fn total_supply(env: Env) -> u64 {
        env.storage().instance().get(&NftKey::Counter).unwrap_or(0)
    }

    /// Current owner of `token_id`; panics when the token does not exist.
    pub fn owner_of(env: Env, token_id: u64) -> Address {
        let key = NftKey::Owner(token_id);
        match env.storage().persistent().get::<NftKey, Address>(&key) {
            Some(owner) => {
                bump_ttl(&env, &key);
                owner
            }
            None => panic!("NFT: token {token_id} not found"),
        }
    }

    /// Full on-chain record of `token_id`; panics when the token does not
    /// exist or has been burned.
    pub fn token_data(env: Env, token_id: u64) -> NftData {
        let key = NftKey::Data(token_id);
        match env.storage().persistent().get::<NftKey, NftData>(&key) {
            Some(data) => {
                bump_ttl(&env, &key);
                data
            }
            None => panic!("NFT: data for token {token_id} not found"),
        }
    }

    /// Number of tokens currently held by `owner`.
    ///
    /// Backed by the dense per-owner index, so this is a single storage read
    /// rather than the previous scan of every token id up to `total_supply`
    /// (which grows without bound and would eventually exceed the ledger's
    /// per-invocation budget).
    pub fn balance_of(env: Env, owner: Address) -> u64 {
        let key = NftKey::OwnedCount(owner);
        match env.storage().persistent().get::<NftKey, u64>(&key) {
            Some(count) => {
                bump_ttl(&env, &key);
                count
            }
            None => 0,
        }
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

    /// True when `operator` holds the per-token approval for `token_id`.
    pub fn is_approved(env: Env, operator: Address, token_id: u64) -> bool {
        env.storage()
            .persistent()
            .get::<NftKey, Address>(&NftKey::Approval(token_id))
            .map(|approved| approved == operator)
            .unwrap_or(false)
    }

    /// True when `operator` holds blanket approval over all of `owner`'s
    /// tokens.
    pub fn is_approved_for_all(env: Env, owner: Address, operator: Address) -> bool {
        env.storage()
            .persistent()
            .get(&NftKey::OperatorApproval(owner, operator))
            .unwrap_or(false)
    }
}

#[cfg(test)]
mod test;
