/**
 * The document pinned to IPFS for a token.
 *
 * Two shapes meet here, and conflating them caused a live defect. The upload
 * *request* is the app's own camelCase intent (`imageUri`, `royalties` as basis
 * points) and is validated by `NFT_METADATA_SCHEMA`. The *document* pinned to
 * IPFS uses the conventional ERC-721 metadata keys (`image`, `animation_url`,
 * `external_url`) so that any wallet, marketplace or block explorer can render
 * it without knowing anything about this app.
 *
 * The metadata proxy validated fetched documents against the request schema, so
 * it answered 422 for every document this app had written. Keeping the
 * conversion in one function -- rather than inline in the upload route -- is
 * what makes it testable against the schema the read path enforces.
 */

/** Longest token name the document may carry, matching the request schema. */
export const NAME_MAX = 128;

export interface MetadataDocument {
  name: string;
  description: string;
  image: string;
  animation_url: string;
  external_url: string;
  attributes: Array<{ trait_type?: unknown; value?: unknown; display_type?: unknown }>;
  properties: { collection_id: string; royalties: unknown };
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * Convert a validated upload request into the document to pin.
 *
 * `safeName` is the caller's already-trimmed name; every other field is
 * normalised to a string so the pinned JSON has a stable shape regardless of
 * which optional fields the client omitted.
 */
export function buildMetadataDocument(
  input: Record<string, unknown>,
  safeName: string,
): MetadataDocument {
  const attributes = Array.isArray(input.attributes) ? input.attributes : [];

  return {
    name: safeName,
    description: asString(input.description),
    image: asString(input.imageUri),
    animation_url: asString(input.animationUri),
    external_url: asString(input.externalUrl),
    attributes: attributes.map((attribute) => {
      // The request accepts either spelling of each key; the document uses the
      // snake_case form the ERC-721 convention documents.
      const record = (attribute ?? {}) as Record<string, unknown>;
      return {
        trait_type: record.traitType || record.trait_type,
        value: record.value,
        display_type: record.displayType || record.display_type,
      };
    }),
    properties: {
      collection_id: asString(input.collectionId),
      // Basis points, or null when the mint has no royalty. Only meaningful as
      // provenance: the royalty terms enforced on chain are the contract's.
      royalties: input.royalties ?? null,
    },
  };
}
