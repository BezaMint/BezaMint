'use client';

import { useState, useCallback } from 'react';
import { HiOutlineSparkles, HiOutlineShieldCheck } from 'react-icons/hi';
import type { MintFormState, NftAttribute, RoyaltyConfig as RoyaltyConfigType } from '@bezamint/shared';
import { useWallet } from '@/context';
import { useToast } from '@/context';
import { useTransaction } from '@/hooks/useTransaction';
import { mintNft, signAndSubmit } from '@/services';
import AttributeEditor from './AttributeEditor';
import ImagePreview from './ImagePreview';
import CollectionSelector from './CollectionSelector';
import RoyaltyConfig from './RoyaltyConfig';
import TransactionStatus from './TransactionStatus';

const INITIAL_FORM: MintFormState = {
  name: '',
  description: '',
  imageUri: '',
  animationUri: '',
  externalUrl: '',
  attributes: [],
  collectionId: '',
  royalties: null,
};

export default function MintForm() {
  const { address, isConnected, connect } = useWallet();
  const { showSuccess, showError } = useToast();
  const tx = useTransaction();

  const [form, setForm] = useState<MintFormState>(INITIAL_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const updateField = useCallback(
    <K extends keyof MintFormState>(field: K, value: MintFormState[K]) => {
      setForm((prev) => ({ ...prev, [field]: value }));
      if (errors[field]) {
        setErrors((prev) => {
          const next = { ...prev };
          delete next[field];
          return next;
        });
      }
    },
    [errors],
  );

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!form.name.trim()) newErrors.name = 'Name is required';
    if (form.name.length > 128) newErrors.name = 'Name must be 128 characters or fewer';
    if (!form.imageUri.trim()) newErrors.imageUri = 'Image URI is required';
    if (form.description.length > 2000) newErrors.description = 'Description must be 2000 characters or fewer';

    // Validate royalty recipients
    if (form.royalties) {
      const totalShare = form.royalties.recipients.reduce((sum, r) => sum + r.share, 0);
      if (form.royalties.recipients.length > 0 && totalShare !== 100) {
        newErrors.royalties = 'Royalty shares must total 100%';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleMint = async () => {
    if (!isConnected) {
      showError('Please connect your Freighter wallet first');
      return;
    }

    if (!validate()) return;

    try {
      await tx.execute(async (onStatus) => {
        // Build metadata URI (in production, upload to IPFS first)
        const metadataUri = `beza://metadata/${Date.now()}`;
        const collectionId = form.collectionId ? Number(form.collectionId) : 0;

        // Build the minting transaction
        onStatus('preparing');
        const txXdr = await mintNft(address!, address!, collectionId, metadataUri);

        // Sign and submit via Freighter
        const result = await signAndSubmit(txXdr, (s) => {
          if (s === 'signing') onStatus('signing');
          else if (s === 'submitting') onStatus('submitting');
          else if (s === 'confirming') onStatus('confirming');
        });

        return { txHash: result.txHash };
      });

      showSuccess('NFT minted successfully!');
    } catch (err: any) {
      showError(err?.message || 'Minting failed');
      throw err;
    }
  };

  // Show connect prompt if not connected
  if (!isConnected) {
    return (
      <div className="card max-w-xl mx-auto text-center py-12">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-bezamint-muted/50 border border-bezamint-border mb-4">
          <HiOutlineShieldCheck className="w-8 h-8 text-gray-500" />
        </div>
        <h3 className="text-lg font-semibold text-gray-300 mb-2">Connect Your Wallet</h3>
        <p className="text-sm text-gray-500 max-w-sm mx-auto mb-6">
          Connect your Freighter wallet to start minting NFTs on the Stellar network.
        </p>
        <button onClick={connect} className="btn-primary text-sm">
          Connect Wallet
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      {/* Transaction Status */}
      <TransactionStatus
        status={tx.status}
        txHash={tx.txHash}
        error={tx.error}
        tokenId={tx.tokenId}
        onClose={tx.reset}
      />

      {/* Form */}
      {!tx.isPending && !tx.isSuccess && (
        <div className="card">
          <h2 className="text-xl font-semibold text-white mb-6">Mint a New NFT</h2>

          <div className="space-y-6">
            {/* Name */}
            <div>
              <label className="input-label">
                Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => updateField('name', e.target.value)}
                placeholder="My Amazing NFT"
                maxLength={128}
                className={`input-field ${errors.name ? 'border-red-500/50 focus:ring-red-500' : ''}`}
              />
              {errors.name && <p className="text-xs text-red-400 mt-1">{errors.name}</p>}
            </div>

            {/* Description */}
            <div>
              <label className="input-label">Description</label>
              <textarea
                value={form.description}
                onChange={(e) => updateField('description', e.target.value)}
                placeholder="Describe your NFT..."
                maxLength={2000}
                rows={3}
                className={`input-field resize-none ${errors.description ? 'border-red-500/50' : ''}`}
              />
              <div className="flex justify-between">
                {errors.description && <p className="text-xs text-red-400 mt-1">{errors.description}</p>}
                <span className="text-xs text-gray-500 ml-auto mt-1">
                  {form.description.length}/2000
                </span>
              </div>
            </div>

            {/* Image URI */}
            <ImagePreview
              label="Image"
              value={form.imageUri}
              onChange={(v) => updateField('imageUri', v)}
              placeholder="https://ipfs.io/ipfs/... or https://..."
              required
            />
            {errors.imageUri && <p className="text-xs text-red-400 -mt-4">{errors.imageUri}</p>}

            {/* Animation URI */}
            <ImagePreview
              label="Animation (optional)"
              value={form.animationUri}
              onChange={(v) => updateField('animationUri', v)}
              placeholder="https://ipfs.io/ipfs/..."
            />

            {/* External URL */}
            <div>
              <label className="input-label">External URL (optional)</label>
              <input
                type="url"
                value={form.externalUrl}
                onChange={(e) => updateField('externalUrl', e.target.value)}
                placeholder="https://my-website.com/nft"
                className="input-field"
              />
            </div>

            {/* Collection */}
            <CollectionSelector
              value={form.collectionId}
              onChange={(v) => updateField('collectionId', v)}
            />

            {/* Attributes */}
            <AttributeEditor
              attributes={form.attributes}
              onChange={(attrs: NftAttribute[]) => updateField('attributes', attrs)}
            />

            {/* Royalties */}
            <RoyaltyConfig
              config={form.royalties}
              onChange={(v: RoyaltyConfigType | null) => updateField('royalties', v)}
              userAddress={address ?? undefined}
            />
            {errors.royalties && <p className="text-xs text-red-400 -mt-2">{errors.royalties}</p>}

            {/* Submit */}
            <div className="pt-4 border-t border-bezamint-border">
              <button
                onClick={handleMint}
                className="btn-primary w-full flex items-center justify-center gap-2 text-base py-3"
              >
                <HiOutlineSparkles className="w-5 h-5" />
                Mint NFT
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
