import { PinataSDK } from 'pinata';
import { getIpfsGateway } from './ipfsGateway';

/**
 * Pinata SDK instance for server-side IPFS operations.
 * Initialize only when PINATA_JWT is configured.
 */
export function getPinataClient(): PinataSDK | null {
  if (!process.env.PINATA_JWT) {
    return null;
  }

  return new PinataSDK({
    pinataJwt: process.env.PINATA_JWT,
    pinataGateway: getIpfsGateway(),
  });
}

/**
 * Check if IPFS uploads are available
 */
export function isIpfsAvailable(): boolean {
  return !!process.env.PINATA_JWT;
}
