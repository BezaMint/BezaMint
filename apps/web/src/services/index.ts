export {
  STELLAR_NETWORK_CONFIG,
  CURRENT_NETWORK,
  getRpcClient,
  getHorizonServer,
  buildContractTransaction,
  simulateTransaction,
  submitSignedTransaction,
  waitForTransaction,
  getExplorerTxUrl,
  getExplorerAccountUrl,
  fetchXlmBalance,
  checkBalance,
  buildXlmPayment,
  formatAddress,
  isValidStellarAddress,
} from './stellar';

export {
  CONTRACT_IDS,
  TxErrorType,
  TxError,
  mintNft,
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
