/**
 * Contract registry — stores deployed contract IDs
 */
export const CONTRACT_IDS = {
  nft: process.env.NEXT_PUBLIC_NFT_CONTRACT_ID || '',
  collection: process.env.NEXT_PUBLIC_COLLECTION_CONTRACT_ID || '',
  royalty: process.env.NEXT_PUBLIC_ROYALTY_CONTRACT_ID || '',
  creator: process.env.NEXT_PUBLIC_CREATOR_CONTRACT_ID || '',
};

/**
 * Contract Wasm hashes for deployment verification
 */
export const CONTRACT_HASHES = {
  nft: process.env.NEXT_PUBLIC_NFT_CONTRACT_HASH || '',
  collection: process.env.NEXT_PUBLIC_COLLECTION_CONTRACT_HASH || '',
  royalty: process.env.NEXT_PUBLIC_ROYALTY_CONTRACT_HASH || '',
  creator: process.env.NEXT_PUBLIC_CREATOR_CONTRACT_HASH || '',
};

/**
 * Soroban RPC methods commonly used
 */
export const SOROBAN_METHODS = {
  nft: {
    mint: 'mint',
    transfer: 'transfer',
    burn: 'burn',
    getMetadata: 'get_metadata',
    ownerOf: 'owner_of',
    totalSupply: 'total_supply',
  },
  collection: {
    create: 'create_collection',
    update: 'update_collection',
    addNft: 'add_nft',
    removeNft: 'remove_nft',
    archive: 'archive',
  },
  royalty: {
    configure: 'configure_royalty',
    update: 'update_royalty',
    get: 'get_royalty',
  },
  creator: {
    register: 'register',
    updateProfile: 'update_profile',
    getProfile: 'get_profile',
  },
} as const;

export const FACTORY_METHODS = {
  initialize: 'initialize',
  setContracts: 'set_contracts',
  mintWithRoyalty: 'mint_with_royalty',
  createCollectionForCreator: 'create_collection_for_creator',
  getNftContract: 'get_nft_contract',
  getCollectionContract: 'get_collection_contract',
  getRoyaltyContract: 'get_royalty_contract',
  getCreatorContract: 'get_creator_contract',
} as const;
