/**
 * GENERATED FILE - do not edit by hand.
 *
 * Source: the #[contracterror] enum in contracts/<name>/src/lib.rs
 * Generator: scripts/generate-error-catalog.py
 * Regenerate: pnpm run contract:errors
 * CI verifies this file with: pnpm run contract:errors:check
 *
 * Every BezaMint contract raises typed numeric codes rather than panic strings,
 * so a failed call surfaces as `Error(Contract, #N)` with no name attached. This
 * catalog restores the name and the documented meaning for a bare integer, which
 * is what lets `normalizeError` turn an opaque host error into something a
 * caller can branch on. It is generated from the Rust enums so it cannot drift.
 *
 * Both this file and docs/error-codes.md are listed in `.prettierignore`: the
 * generator is their formatter, and `contract:errors:check` compares its output
 * with what is committed, byte for byte.
 */

export const CONTRACT_NAMES = [
  'nft',
  'collection',
  'royalty',
  'creator',
  'factory',
] as const;

export type ContractName = (typeof CONTRACT_NAMES)[number];

export interface ContractErrorDescriptor {
  /** Numeric code as reported by the host in `Error(Contract, #N)`. */
  readonly code: number;
  /** Rust enum variant name. */
  readonly variant: string;
  /** One-line description, taken from the variant's Rust doc comment. */
  readonly meaning: string;
  /** Contract functions that can raise this code, in source order. */
  readonly raisedBy: readonly string[];
}

/** The Rust enum each contract's codes come from. */
export const CONTRACT_ERROR_ENUMS = {
  nft: 'NftError',
  collection: 'CollectionError',
  royalty: 'RoyaltyError',
  creator: 'CreatorError',
  factory: 'FactoryError',
} as const satisfies Record<ContractName, string>;

/** Every code, keyed by contract and then by numeric code. */
export const CONTRACT_ERRORS = {
  nft: {
    1: {
      code: 1,
      variant: 'NotInitialized',
      meaning: 'The contract has not been constructed.',
      raisedBy: ['get_admin', 'migrate', 'mint', 'set_admin', 'upgrade'],
    },
    2: {
      code: 2,
      variant: 'StorageVersionMismatch',
      meaning: 'Stored schema version does not match this build; run `migrate`.',
      raisedBy: ['assert_version'],
    },
    3: {
      code: 3,
      variant: 'StoredVersionMismatch',
      meaning: '`migrate` was given a `from_version` that is not what is stored.',
      raisedBy: ['migrate'],
    },
    4: {
      code: 4,
      variant: 'AlreadyAtCurrentVersion',
      meaning: '`migrate` called when storage is already at this build\'s version.',
      raisedBy: ['migrate'],
    },
    5: {
      code: 5,
      variant: 'MetadataUriEmpty',
      meaning: 'Metadata URI is empty.',
      raisedBy: ['mint'],
    },
    6: {
      code: 6,
      variant: 'MetadataUriTooLong',
      meaning: 'Metadata URI exceeds `MAX_METADATA_URI_LEN`.',
      raisedBy: ['mint'],
    },
    7: {
      code: 7,
      variant: 'MetadataUriSchemeInvalid',
      meaning: 'Metadata URI does not use an https, http or ipfs scheme.',
      raisedBy: ['mint'],
    },
    8: {
      code: 8,
      variant: 'ZeroAddress',
      meaning: 'The all-zero account was supplied where a real account is required.',
      raisedBy: ['assert_not_zero', 'set_admin'],
    },
    9: {
      code: 9,
      variant: 'MaxSupplyReached',
      meaning: '`MAX_SUPPLY` has been reached.',
      raisedBy: ['mint'],
    },
    10: {
      code: 10,
      variant: 'TokenNotFound',
      meaning: 'No token exists with the supplied id.',
      raisedBy: ['approve', 'burn', 'owner_of', 'transfer', 'transfer_from'],
    },
    11: {
      code: 11,
      variant: 'CallerNotOwner',
      meaning: '`transfer` caller is not the current owner.',
      raisedBy: ['transfer'],
    },
    12: {
      code: 12,
      variant: 'FromIsNotOwner',
      meaning: '`transfer_from` `from` is not the current owner.',
      raisedBy: ['transfer_from'],
    },
    13: {
      code: 13,
      variant: 'SpenderNotApproved',
      meaning: '`transfer_from` spender holds no per-token or blanket approval.',
      raisedBy: ['transfer_from'],
    },
    14: {
      code: 14,
      variant: 'TokenDataNotFound',
      meaning: 'The token exists but its data record is gone (for example after a burn).',
      raisedBy: ['token_data'],
    },
    15: {
      code: 15,
      variant: 'OwnershipIndexInconsistent',
      meaning: 'The per-owner index is inconsistent. Indicates a logic defect, not caller error; reachable only if the swap-removal invariant is broken.',
      raisedBy: ['index_remove'],
    },
  },
  collection: {
    1: {
      code: 1,
      variant: 'NotInitialized',
      meaning: 'The contract has not been constructed.',
      raisedBy: ['create_collection', 'get_admin', 'migrate', 'set_admin', 'upgrade'],
    },
    2: {
      code: 2,
      variant: 'StorageVersionMismatch',
      meaning: 'Stored schema version does not match this build; run `migrate`.',
      raisedBy: ['assert_version'],
    },
    3: {
      code: 3,
      variant: 'StoredVersionMismatch',
      meaning: '`migrate` was given a `from_version` that is not what is stored.',
      raisedBy: ['migrate'],
    },
    4: {
      code: 4,
      variant: 'AlreadyAtCurrentVersion',
      meaning: '`migrate` called when storage is already at this build\'s version.',
      raisedBy: ['migrate'],
    },
    5: {
      code: 5,
      variant: 'MetadataUriEmpty',
      meaning: 'Metadata URI is empty.',
      raisedBy: ['validate_metadata_uri'],
    },
    6: {
      code: 6,
      variant: 'MetadataUriTooLong',
      meaning: 'Metadata URI exceeds `MAX_METADATA_URI_LEN`.',
      raisedBy: ['validate_metadata_uri'],
    },
    7: {
      code: 7,
      variant: 'MetadataUriSchemeInvalid',
      meaning: 'Metadata URI does not use an https, http or ipfs scheme.',
      raisedBy: ['validate_metadata_uri'],
    },
    8: {
      code: 8,
      variant: 'CollectionNotFound',
      meaning: 'No collection exists with the supplied id.',
      raisedBy: ['add_nft', 'archive_collection', 'get_collection', 'remove_nft', 'update_collection'],
    },
    9: {
      code: 9,
      variant: 'NotCollectionCreator',
      meaning: 'Caller is not the collection\'s creator.',
      raisedBy: ['archive_collection', 'update_collection'],
    },
    10: {
      code: 10,
      variant: 'CollectionArchived',
      meaning: 'The collection is archived and cannot be mutated.',
      raisedBy: ['add_nft', 'update_collection'],
    },
    11: {
      code: 11,
      variant: 'CollectionFull',
      meaning: '`MAX_NFTS_PER_COLLECTION` reached.',
      raisedBy: ['add_nft'],
    },
    12: {
      code: 12,
      variant: 'TokenAlreadyInCollection',
      meaning: 'The token already belongs to a collection.',
      raisedBy: ['add_nft'],
    },
    13: {
      code: 13,
      variant: 'NftIndexOutOfBounds',
      meaning: 'Internal membership index is out of bounds. Indicates a logic defect, not caller error.',
      raisedBy: ['remove_nft'],
    },
    14: {
      code: 14,
      variant: 'AdminZeroAddress',
      meaning: '`set_admin` was given the all-zero account.',
      raisedBy: ['set_admin'],
    },
  },
  royalty: {
    1: {
      code: 1,
      variant: 'NotInitialized',
      meaning: 'The contract has not been constructed.',
      raisedBy: ['configure_royalty', 'freeze_royalty', 'get_admin', 'migrate', 'remove_royalty', 'set_admin', 'update_royalty', 'upgrade'],
    },
    2: {
      code: 2,
      variant: 'StorageVersionMismatch',
      meaning: 'Stored schema version does not match this build; run `migrate`.',
      raisedBy: ['assert_version'],
    },
    3: {
      code: 3,
      variant: 'StoredVersionMismatch',
      meaning: '`migrate` was given a `from_version` that is not what is stored.',
      raisedBy: ['migrate'],
    },
    4: {
      code: 4,
      variant: 'AlreadyAtCurrentVersion',
      meaning: '`migrate` called when storage is already at this build\'s version.',
      raisedBy: ['migrate'],
    },
    5: {
      code: 5,
      variant: 'NoConfig',
      meaning: 'No royalty terms exist for the target.',
      raisedBy: ['freeze_royalty', 'get_royalty', 'remove_royalty', 'update_royalty'],
    },
    6: {
      code: 6,
      variant: 'ConfigAlreadyExists',
      meaning: 'Terms already exist; use `update_royalty` instead.',
      raisedBy: ['configure_royalty'],
    },
    7: {
      code: 7,
      variant: 'BasisPointsTooHigh',
      meaning: 'Rate exceeds `MAX_BASIS_POINTS`.',
      raisedBy: ['configure_royalty', 'update_royalty'],
    },
    8: {
      code: 8,
      variant: 'CallerCannotUpdate',
      meaning: 'Caller is neither the recorded creator nor the royalty admin.',
      raisedBy: ['update_royalty'],
    },
    9: {
      code: 9,
      variant: 'ConfigFrozen',
      meaning: 'Terms are frozen and cannot be amended or removed.',
      raisedBy: ['remove_royalty', 'update_royalty'],
    },
    10: {
      code: 10,
      variant: 'TooManyRecipients',
      meaning: 'More recipients than `MAX_RECIPIENTS`.',
      raisedBy: ['validate_recipients'],
    },
    11: {
      code: 11,
      variant: 'ZeroShare',
      meaning: 'A recipient was given a zero share.',
      raisedBy: ['validate_recipients'],
    },
    12: {
      code: 12,
      variant: 'SharesMustSumToTotal',
      meaning: 'Recipient shares do not sum to exactly `TOTAL_SHARE`.',
      raisedBy: ['validate_recipients'],
    },
    13: {
      code: 13,
      variant: 'SalePriceNegative',
      meaning: '`quote_royalty` was given a negative sale price.',
      raisedBy: ['quote_royalty'],
    },
    14: {
      code: 14,
      variant: 'SalePriceTooLarge',
      meaning: '`sale_price * basis_points` overflowed i128.',
      raisedBy: ['quote_royalty'],
    },
    15: {
      code: 15,
      variant: 'AdminZeroAddress',
      meaning: '`set_admin` was given the all-zero account.',
      raisedBy: ['set_admin'],
    },
  },
  creator: {
    1: {
      code: 1,
      variant: 'NotInitialized',
      meaning: 'The contract has not been constructed.',
      raisedBy: ['get_admin', 'migrate', 'set_admin', 'upgrade', 'verify_creator'],
    },
    2: {
      code: 2,
      variant: 'StorageVersionMismatch',
      meaning: 'Stored schema version does not match this build; run `migrate`.',
      raisedBy: ['assert_version'],
    },
    3: {
      code: 3,
      variant: 'StoredVersionMismatch',
      meaning: '`migrate` was given a `from_version` that is not what is stored.',
      raisedBy: ['migrate'],
    },
    4: {
      code: 4,
      variant: 'AlreadyAtCurrentVersion',
      meaning: '`migrate` called when storage is already at this build\'s version.',
      raisedBy: ['migrate'],
    },
    5: {
      code: 5,
      variant: 'DisplayNameEmpty',
      meaning: 'Display name is empty.',
      raisedBy: ['register', 'update_profile'],
    },
    6: {
      code: 6,
      variant: 'DisplayNameTooLong',
      meaning: 'Display name exceeds `MAX_DISPLAY_NAME_LEN`.',
      raisedBy: ['register', 'update_profile'],
    },
    7: {
      code: 7,
      variant: 'BioTooLong',
      meaning: 'Bio exceeds `MAX_BIO_LEN`.',
      raisedBy: ['register', 'update_profile'],
    },
    8: {
      code: 8,
      variant: 'UriTooLong',
      meaning: 'A profile URI exceeds `MAX_URI_LEN`.',
      raisedBy: ['validate_uri'],
    },
    9: {
      code: 9,
      variant: 'UriSchemeInvalid',
      meaning: 'A profile URI does not use an https, http or ipfs scheme.',
      raisedBy: ['validate_uri'],
    },
    10: {
      code: 10,
      variant: 'AlreadyRegistered',
      meaning: 'The address is already registered.',
      raisedBy: ['register'],
    },
    11: {
      code: 11,
      variant: 'ProfileNotFound',
      meaning: 'No profile exists for the address.',
      raisedBy: ['get_profile', 'set_social_links', 'update_profile', 'verify_creator'],
    },
    12: {
      code: 12,
      variant: 'TooManySocialLinks',
      meaning: 'More links than `MAX_SOCIAL_LINKS`.',
      raisedBy: ['validate_social_links'],
    },
    13: {
      code: 13,
      variant: 'PlatformNameTooLong',
      meaning: 'Platform name exceeds `MAX_PLATFORM_LEN`.',
      raisedBy: ['validate_social_links'],
    },
    14: {
      code: 14,
      variant: 'UnsupportedPlatform',
      meaning: 'Platform is not on the allowlist.',
      raisedBy: ['validate_social_links'],
    },
    15: {
      code: 15,
      variant: 'SocialUrlLengthInvalid',
      meaning: 'Social URL is empty or exceeds `MAX_SOCIAL_URL_LEN`.',
      raisedBy: ['validate_social_links'],
    },
    16: {
      code: 16,
      variant: 'SocialUrlSchemeInvalid',
      meaning: 'Social URL does not use an https or http scheme.',
      raisedBy: ['validate_social_links'],
    },
    17: {
      code: 17,
      variant: 'AdminZeroAddress',
      meaning: '`set_admin` was given the all-zero account.',
      raisedBy: ['set_admin'],
    },
  },
  factory: {
    1: {
      code: 1,
      variant: 'NotInitialized',
      meaning: 'The contract has not been constructed.',
      raisedBy: ['get_admin', 'migrate', 'set_admin', 'set_contracts', 'set_royalty_admin', 'upgrade'],
    },
    2: {
      code: 2,
      variant: 'StorageVersionMismatch',
      meaning: 'Stored schema version does not match this build; run `migrate`.',
      raisedBy: ['assert_version'],
    },
    3: {
      code: 3,
      variant: 'StoredVersionMismatch',
      meaning: '`migrate` was given a `from_version` that is not what is stored.',
      raisedBy: ['migrate'],
    },
    4: {
      code: 4,
      variant: 'AlreadyAtCurrentVersion',
      meaning: '`migrate` called when storage is already at this build\'s version.',
      raisedBy: ['migrate'],
    },
    5: {
      code: 5,
      variant: 'RoyaltyAdminZeroAddress',
      meaning: '`set_royalty_admin` was given the all-zero account.',
      raisedBy: ['set_royalty_admin'],
    },
    6: {
      code: 6,
      variant: 'WiringZeroAddress',
      meaning: 'A wired contract address is the all-zero account.',
      raisedBy: ['validate_wiring'],
    },
    7: {
      code: 7,
      variant: 'WiringSelfReference',
      meaning: 'A wired contract slot points at the Factory itself.',
      raisedBy: ['validate_wiring'],
    },
    8: {
      code: 8,
      variant: 'WiringDuplicate',
      meaning: 'Two or more wired slots resolve to the same contract.',
      raisedBy: ['validate_wiring'],
    },
    9: {
      code: 9,
      variant: 'BatchEmpty',
      meaning: '`mint_batch_with_royalty` was given an empty batch.',
      raisedBy: ['mint_batch_with_royalty'],
    },
    10: {
      code: 10,
      variant: 'BatchTooLarge',
      meaning: '`mint_batch_with_royalty` exceeded `MAX_BATCH_MINT`.',
      raisedBy: ['mint_batch_with_royalty'],
    },
    11: {
      code: 11,
      variant: 'NftContractNotSet',
      meaning: 'The NFT contract slot is not wired.',
      raisedBy: ['burn_nft', 'get_nft_contract', 'mint_contracts'],
    },
    12: {
      code: 12,
      variant: 'CollectionContractNotSet',
      meaning: 'The Collection contract slot is not wired.',
      raisedBy: ['burn_nft', 'create_collection_for_creator', 'get_collection_contract', 'mint_contracts'],
    },
    13: {
      code: 13,
      variant: 'RoyaltyContractNotSet',
      meaning: 'The Royalty contract slot is not wired.',
      raisedBy: ['get_royalty_contract', 'mint_contracts', 'set_royalty_admin'],
    },
    14: {
      code: 14,
      variant: 'CreatorContractNotSet',
      meaning: 'The Creator contract slot is not wired.',
      raisedBy: ['create_collection_for_creator', 'get_creator_contract'],
    },
    15: {
      code: 15,
      variant: 'AdminZeroAddress',
      meaning: '`set_admin` was given the all-zero account.',
      raisedBy: ['set_admin'],
    },
  },
} as const satisfies Record<ContractName, Record<number, ContractErrorDescriptor>>;

/** Total number of codes across every contract (76). */
export const CONTRACT_ERROR_CODE_COUNT = 76;

/**
 * Look up a code within one contract.
 *
 * Returns `null` for a code the catalog does not know — a contract deployed
 * ahead of this build, or a host error that is not a contract error at all.
 * Callers get the numeric code either way; the lookup only adds the name.
 */
export function describeContractError(
  contract: ContractName,
  code: number,
): ContractErrorDescriptor | null {
  const table: Record<number, ContractErrorDescriptor> =
    CONTRACT_ERRORS[contract];
  return table[code] ?? null;
}
