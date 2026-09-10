export {
  STELLAR_NETWORK_CONFIG,
  CURRENT_NETWORK,
  getRpcClient,
  getHorizonServer,
  buildContractTransaction,
  simulateTransaction,
  submitSignedTransaction,
  waitForTransaction,
  fetchXlmBalance,
  checkBalance,
  buildXlmPayment,
  formatAddress,
  isValidStellarAddress,
} from './stellar';

export {
  buildExplorerUrl,
  getExplorerTxUrl,
  getExplorerAccountUrl,
  getExplorerContractUrl,
} from '@/lib/explorer';

export {
  CONTRACT_IDS,
  TxErrorType,
  TxError,
  mintNft,
  mintWithRoyalty,
  burnNft,
  getTotalSupply,
  getOwnerOf,
  getTokenData,
  getTotalCollections,
  getCollectionsByCreator,
  getCollectionById,
  getNftsInCollection,
  getCollectionForNft,
  getCreatorProfile,
  getRoyaltyConfig,
  getTotalCreators,
  createCollection,
  updateCollection,
  archiveCollection,
  signAndSubmit,
} from './contracts';
export type { OnChainTokenData, OnChainCreatorProfile, OnChainRoyaltyConfig } from './contracts';

export { uploadMetadataToIpfs } from './ipfs';
export type { IpfsUploadResult } from './ipfs';
