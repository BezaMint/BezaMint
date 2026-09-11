#![no_std]

//! BezaMint Creator contract.
//!
//! Owns creator profiles: registration, profile updates, social links and
//! admin verification. Each profile is keyed by the creator's address and
//! belongs to them; verification is the platform admin's only power.
//!
//! ## Authorization model
//!
//! - `register` / `update_profile` / `set_social_links`: creator-gated.
//! - `verify_creator`: stored-admin-only (the caller-supplied admin
//!   parameter was removed because it was silently ignored).
//!
//! ## Validation
//!
//! Profile URIs must use an https/http/ipfs scheme (stored-XSS protection:
//! the frontend renders them into the DOM), social platforms must be on a
//! fixed allowlist, and every field is length-capped.
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

// ─────────────────────────── Constants ───────────────────────────

/// Upper bounds on profile fields so a profile can never grow past what a
/// single ledger read can fetch. Kept at module scope so the enforcement
/// points and the documentation cannot drift apart.
const MAX_DISPLAY_NAME_LEN: u32 = 64;
const MAX_BIO_LEN: u32 = 512;
const MAX_URI_LEN: u32 = 512;
const MAX_SOCIAL_LINKS: u32 = 8;
const MAX_PLATFORM_LEN: u32 = 32;
const MAX_SOCIAL_URL_LEN: u32 = 256;

/// Storage schema version written by this build. Bump it whenever the persisted
/// layout changes and add the matching step to [`BezaMintCreator::migrate`].
pub const STORAGE_VERSION: u32 = 1;
/// Social platforms accepted in `set_social_links`. Anything else is rejected
/// so the frontend can render link badges without an unbounded allowlist, and
/// so a platform string cannot be used to smuggle a scheme or markup.
const ALLOWED_PLATFORMS: &[&[u8]] = &[
    b"twitter",
    b"x",
    b"instagram",
    b"tiktok",
    b"youtube",
    b"discord",
    b"telegram",
    b"spotify",
    b"soundcloud",
    b"github",
    b"linkedin",
    b"twitch",
    b"facebook",
    b"threads",
    b"website",
];

/// State-expiration (TTL) policy. Soroban entries silently archive once their
/// TTL elapses and then read as missing; a creator profile that archived would
/// make `get_profile` panic even though the address demonstrably registered.
/// Every write refreshes the touched entries to the network maximum
/// ([`TTL_LEDGERS`] = Stellar's `MAXIMUM_ENTRY_TTL_LEDGERS`, ~1 year at 5s
/// per ledger), and the primary getters bump entries that have fallen below
/// half-life so actively used profiles stay alive indefinitely.
const TTL_LEDGERS: u32 = 6_312_000;
const TTL_THRESHOLD: u32 = TTL_LEDGERS / 2;

// ─────────────────────────── Types ───────────────────────────

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct CreatorProfile {
    pub address: Address,
    pub display_name: String,
    pub bio: String,
    pub avatar_uri: String,
    pub banner_uri: String,
    pub social_links: Vec<SocialLink>,
    pub created_at: u64,
    pub updated_at: u64,
    pub is_verified: bool,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct SocialLink {
    pub platform: String,
    pub url: String,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum CreatorKey {
    Admin,
    Version,
    Profile(Address),
    Counter,
}

// ─────────────────────────── Events ───────────────────────────

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum CreatorEvent {
    Registered(Address),
    ProfileUpdated(Address),
    Verified(Address),
    /// The admin role moved to a new address.
    AdminChanged(Address),
}

fn emit(env: &Env, event: CreatorEvent) {
    env.events().publish((symbol_short!("creator"),), event);
}

/// Extend the TTL of a persistent entry to [`TTL_LEDGERS`] when its remaining
/// life is at or below [`TTL_THRESHOLD`]. Cheap no-op otherwise, so it is safe
/// to call on every access path.
fn bump_ttl(env: &Env, key: &CreatorKey) {
    env.storage()
        .persistent()
        .extend_ttl(key, TTL_THRESHOLD, TTL_LEDGERS);
}

/// Panic unless the stored schema version matches this build.
///
/// The constructor writes `Version` but nothing used to read it, so an in-place
/// `upgrade` that changed the `CreatorProfile` layout would decode old entries
/// into the new struct and return garbage rather than failing. Every mutating
/// path consults the version first so the mismatch is loud and immediate.
fn assert_version(env: &Env) {
    let found: u32 = env
        .storage()
        .instance()
        .get(&CreatorKey::Version)
        .unwrap_or(0);
    if found != STORAGE_VERSION {
        panic_with_error!(env, CreatorError::StorageVersionMismatch);
    }
}

/// True when `s` begins with `prefix`. Soroban's `String` has no
/// `starts_with`, so the string is copied into a stack buffer (bounded by
/// [`MAX_URI_LEN`]) and compared at the byte level.
fn starts_with(s: &String, prefix: &[u8]) -> bool {
    if s.len() < prefix.len() as u32 {
        return false;
    }
    let mut buf = [0u8; MAX_URI_LEN as usize];
    let slice = &mut buf[..s.len() as usize];
    s.copy_into_slice(slice);
    slice.starts_with(prefix)
}

/// ASCII case-insensitive equality between a Soroban `String` and a byte
/// literal, for matching platform names like "Twitter" against the allowlist.
fn eq_ignore_ascii_case(s: &String, expected: &[u8]) -> bool {
    if s.len() != expected.len() as u32 {
        return false;
    }
    let mut buf = [0u8; MAX_PLATFORM_LEN as usize];
    let slice = &mut buf[..s.len() as usize];
    s.copy_into_slice(slice);
    slice.eq_ignore_ascii_case(expected)
}

/// Validate an optional profile URI (avatar, banner). Empty is allowed (the
/// field is optional); anything else must be a real `https`, `http` or `ipfs`
/// URL and fit within [`MAX_URI_LEN`]. Arbitrary schemes such as `javascript:`
/// or `data:` are rejected because the frontend renders these strings into the
/// DOM, where they would be a stored-XSS vector.
fn validate_uri(env: &Env, uri: &String) {
    if uri.is_empty() {
        return;
    }
    if uri.len() > MAX_URI_LEN {
        panic_with_error!(env, CreatorError::UriTooLong);
    }
    if !(starts_with(uri, b"https://")
        || starts_with(uri, b"http://")
        || starts_with(uri, b"ipfs://"))
    {
        panic_with_error!(env, CreatorError::UriSchemeInvalid);
    }
}

/// Validate the platform and URL of every social link: the platform must be on
/// the allowlist and the URL must be a real `http(s)` link. No `ipfs://` here
/// because a social link that browsers cannot open is useless, and no length
/// surprises: a link is bounded by [`MAX_SOCIAL_URL_LEN`].
fn validate_social_links(env: &Env, links: &Vec<SocialLink>) {
    if links.len() > MAX_SOCIAL_LINKS {
        panic_with_error!(env, CreatorError::TooManySocialLinks);
    }
    for link in links.iter() {
        if link.platform.len() > MAX_PLATFORM_LEN {
            panic_with_error!(env, CreatorError::PlatformNameTooLong);
        }
        if !ALLOWED_PLATFORMS
            .iter()
            .any(|p| eq_ignore_ascii_case(&link.platform, p))
        {
            panic_with_error!(env, CreatorError::UnsupportedPlatform);
        }
        if link.url.is_empty() || link.url.len() > MAX_SOCIAL_URL_LEN {
            panic_with_error!(env, CreatorError::SocialUrlLengthInvalid);
        }
        if !(starts_with(&link.url, b"https://") || starts_with(&link.url, b"http://")) {
            panic_with_error!(env, CreatorError::SocialUrlSchemeInvalid);
        }
    }
}

// ─────────────────────────── Errors ───────────────────────────

/// Typed contract errors.
///
/// A numeric code is part of the contract's public interface and the committed
/// ABI snapshot; callers switch on it instead of substring-matching a message.
/// Codes are grouped by subsystem and are never renumbered once shipped.
///
/// The URI codes are shared by every profile field (avatar and banner), so the
/// offending field is no longer named in the message. Field-level detail is
/// the caller's to add: the client already knows which field it sent.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum CreatorError {
    /// The contract has not been constructed.
    NotInitialized = 1,
    /// Stored schema version does not match this build; run `migrate`.
    StorageVersionMismatch = 2,
    /// `migrate` was given a `from_version` that is not what is stored.
    StoredVersionMismatch = 3,
    /// `migrate` called when storage is already at this build's version.
    AlreadyAtCurrentVersion = 4,
    /// Display name is empty.
    DisplayNameEmpty = 5,
    /// Display name exceeds `MAX_DISPLAY_NAME_LEN`.
    DisplayNameTooLong = 6,
    /// Bio exceeds `MAX_BIO_LEN`.
    BioTooLong = 7,
    /// A profile URI exceeds `MAX_URI_LEN`.
    UriTooLong = 8,
    /// A profile URI does not use an https, http or ipfs scheme.
    UriSchemeInvalid = 9,
    /// The address is already registered.
    AlreadyRegistered = 10,
    /// No profile exists for the address.
    ProfileNotFound = 11,
    /// More links than `MAX_SOCIAL_LINKS`.
    TooManySocialLinks = 12,
    /// Platform name exceeds `MAX_PLATFORM_LEN`.
    PlatformNameTooLong = 13,
    /// Platform is not on the allowlist.
    UnsupportedPlatform = 14,
    /// Social URL is empty or exceeds `MAX_SOCIAL_URL_LEN`.
    SocialUrlLengthInvalid = 15,
    /// Social URL does not use an https or http scheme.
    SocialUrlSchemeInvalid = 16,
    /// `set_admin` was given the all-zero account.
    AdminZeroAddress = 17,
}

// ─────────────────────────── Contract ───────────────────────────

#[contract]
pub struct BezaMintCreator;

#[contractimpl]
impl BezaMintCreator {
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
        env.storage().instance().set(&CreatorKey::Admin, &admin);
        env.storage().instance().set(&CreatorKey::Counter, &0u64);
        env.storage().instance().set(&CreatorKey::Version, &1u32);
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
            .get(&CreatorKey::Admin)
            .unwrap_or_else(|| panic_with_error!(&env, CreatorError::NotInitialized))
    }

    /// Returns `true` once `initialize` has succeeded.
    pub fn is_initialized(env: Env) -> bool {
        env.storage().instance().has(&CreatorKey::Admin)
    }

    /// Stored schema version (`0` before the constructor runs).
    pub fn version(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&CreatorKey::Version)
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
            .get(&CreatorKey::Admin)
            .unwrap_or_else(|| panic_with_error!(&env, CreatorError::NotInitialized));
        admin.require_auth();

        let stored: u32 = env
            .storage()
            .instance()
            .get(&CreatorKey::Version)
            .unwrap_or(0);
        if stored != from_version {
            panic_with_error!(&env, CreatorError::StoredVersionMismatch);
        }
        if from_version == STORAGE_VERSION {
            panic_with_error!(&env, CreatorError::AlreadyAtCurrentVersion);
        }

        env.storage()
            .instance()
            .set(&CreatorKey::Version, &STORAGE_VERSION);
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
            .get(&CreatorKey::Admin)
            .unwrap_or_else(|| panic_with_error!(&env, CreatorError::NotInitialized));
        admin.require_auth();

        env.deployer().update_current_contract_wasm(new_wasm_hash);
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_LEDGERS);
    }

    /// Transfer the admin role to `new_admin`. Admin-only.
    ///
    /// Verification is the platform admin's only power on this contract, so
    /// without rotation a lost or compromised key permanently removes the
    /// ability to verify creators. Rotation is part of the recovery procedure in
    /// `docs/mainnet-readiness.md`.
    ///
    /// The zero account is rejected: an admin that cannot sign is
    /// indistinguishable from no admin at all.
    pub fn set_admin(env: Env, new_admin: Address) {
        assert_version(&env);
        let admin: Address = env
            .storage()
            .instance()
            .get(&CreatorKey::Admin)
            .unwrap_or_else(|| panic_with_error!(&env, CreatorError::NotInitialized));
        admin.require_auth();

        if new_admin == Address::from_str(&env, ZERO_ADDRESS) {
            panic_with_error!(&env, CreatorError::AdminZeroAddress);
        }

        env.storage().instance().set(&CreatorKey::Admin, &new_admin);
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_LEDGERS);

        emit(&env, CreatorEvent::AdminChanged(new_admin));
    }

    pub fn register(
        env: Env,
        creator: Address,
        display_name: String,
        bio: String,
        avatar_uri: String,
        banner_uri: String,
    ) {
        assert_version(&env);
        creator.require_auth();

        if display_name.is_empty() {
            panic_with_error!(&env, CreatorError::DisplayNameEmpty);
        }
        if display_name.len() > MAX_DISPLAY_NAME_LEN {
            panic_with_error!(&env, CreatorError::DisplayNameTooLong);
        }
        if bio.len() > MAX_BIO_LEN {
            panic_with_error!(&env, CreatorError::BioTooLong);
        }
        validate_uri(&env, &avatar_uri);
        validate_uri(&env, &banner_uri);
        if env
            .storage()
            .persistent()
            .has(&CreatorKey::Profile(creator.clone()))
        {
            panic_with_error!(&env, CreatorError::AlreadyRegistered);
        }

        let counter: u64 = env
            .storage()
            .instance()
            .get(&CreatorKey::Counter)
            .unwrap_or(0);

        let profile = CreatorProfile {
            address: creator.clone(),
            display_name,
            bio,
            avatar_uri,
            banner_uri,
            social_links: Vec::new(&env),
            created_at: env.ledger().timestamp(),
            updated_at: env.ledger().timestamp(),
            is_verified: false,
        };

        env.storage()
            .persistent()
            .set(&CreatorKey::Profile(creator.clone()), &profile);
        bump_ttl(&env, &CreatorKey::Profile(creator.clone()));
        env.storage()
            .instance()
            .set(&CreatorKey::Counter, &(counter + 1));
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_LEDGERS);

        emit(&env, CreatorEvent::Registered(creator.clone()));
    }

    pub fn update_profile(
        env: Env,
        creator: Address,
        display_name: String,
        bio: String,
        avatar_uri: String,
        banner_uri: String,
    ) {
        assert_version(&env);
        creator.require_auth();

        // Resolve the profile first so a nonexistent creator gets the clear
        // "profile not found" error rather than a validation error.
        let mut profile: CreatorProfile = env
            .storage()
            .persistent()
            .get(&CreatorKey::Profile(creator.clone()))
            .unwrap_or_else(|| panic_with_error!(&env, CreatorError::ProfileNotFound));

        // The same validation as `register`: an update must not be able to
        // move a profile into a state it could never have been created in
        // (empty display name, oversized bio, or an arbitrary URI scheme).
        if display_name.is_empty() {
            panic_with_error!(&env, CreatorError::DisplayNameEmpty);
        }
        if display_name.len() > MAX_DISPLAY_NAME_LEN {
            panic_with_error!(&env, CreatorError::DisplayNameTooLong);
        }
        if bio.len() > MAX_BIO_LEN {
            panic_with_error!(&env, CreatorError::BioTooLong);
        }
        validate_uri(&env, &avatar_uri);
        validate_uri(&env, &banner_uri);

        profile.display_name = display_name;
        profile.bio = bio;
        profile.avatar_uri = avatar_uri;
        profile.banner_uri = banner_uri;
        profile.updated_at = env.ledger().timestamp();

        env.storage()
            .persistent()
            .set(&CreatorKey::Profile(creator.clone()), &profile);
        bump_ttl(&env, &CreatorKey::Profile(creator.clone()));

        emit(&env, CreatorEvent::ProfileUpdated(creator));
    }

    pub fn set_social_links(env: Env, creator: Address, links: Vec<SocialLink>) {
        assert_version(&env);
        creator.require_auth();

        validate_social_links(&env, &links);

        let mut profile: CreatorProfile = env
            .storage()
            .persistent()
            .get(&CreatorKey::Profile(creator.clone()))
            .unwrap_or_else(|| panic_with_error!(&env, CreatorError::ProfileNotFound));

        profile.social_links = links;
        profile.updated_at = env.ledger().timestamp();

        env.storage()
            .persistent()
            .set(&CreatorKey::Profile(creator.clone()), &profile);
        bump_ttl(&env, &CreatorKey::Profile(creator.clone()));

        emit(&env, CreatorEvent::ProfileUpdated(creator));
    }

    /// Mark a creator profile as verified. Admin-only: authorization comes
    /// from the stored admin, not from any caller-supplied address. The
    /// previous signature accepted a leading `_admin: Address` that was
    /// ignored in favour of the stored admin, which misled callers into
    /// believing their own address authorized the call.
    pub fn verify_creator(env: Env, creator: Address) {
        assert_version(&env);
        let stored_admin: Address = env
            .storage()
            .instance()
            .get(&CreatorKey::Admin)
            .unwrap_or_else(|| panic_with_error!(&env, CreatorError::NotInitialized));
        stored_admin.require_auth();

        let mut profile: CreatorProfile = env
            .storage()
            .persistent()
            .get(&CreatorKey::Profile(creator.clone()))
            .unwrap_or_else(|| panic_with_error!(&env, CreatorError::ProfileNotFound));

        profile.is_verified = true;
        profile.updated_at = env.ledger().timestamp();

        env.storage()
            .persistent()
            .set(&CreatorKey::Profile(creator.clone()), &profile);
        bump_ttl(&env, &CreatorKey::Profile(creator.clone()));

        emit(&env, CreatorEvent::Verified(creator));
    }

    // ── Queries ─────────────────────────────────────────────

    pub fn total_creators(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&CreatorKey::Counter)
            .unwrap_or(0)
    }

    pub fn get_profile(env: Env, creator: Address) -> CreatorProfile {
        let key = CreatorKey::Profile(creator);
        match env
            .storage()
            .persistent()
            .get::<CreatorKey, CreatorProfile>(&key)
        {
            Some(profile) => {
                bump_ttl(&env, &key);
                profile
            }
            None => panic_with_error!(&env, CreatorError::ProfileNotFound),
        }
    }

    pub fn is_registered(env: Env, creator: Address) -> bool {
        env.storage()
            .persistent()
            .has(&CreatorKey::Profile(creator))
    }

    pub fn is_verified(env: Env, creator: Address) -> bool {
        env.storage()
            .persistent()
            .get::<CreatorKey, CreatorProfile>(&CreatorKey::Profile(creator))
            .map(|p| p.is_verified)
            .unwrap_or(false)
    }
}

#[cfg(test)]
mod test;
