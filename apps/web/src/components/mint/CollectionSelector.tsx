'use client';

import { useState } from 'react';
import { HiOutlineCollection, HiOutlinePlus, HiOutlineX } from 'react-icons/hi';

interface CollectionSelectorProps {
  value: string;
  onChange: (value: string) => void;
  collections?: { id: string; name: string }[];
  onCreateCollection?: (data: { name: string; imageUri: string }) => Promise<number>;
}

export default function CollectionSelector({
  value,
  onChange,
  collections = [],
  onCreateCollection,
}: CollectionSelectorProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState('');
  const [imageUri, setImageUri] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!onCreateCollection) return;
    if (!name.trim()) {
      setError('Collection name is required');
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      const newId = await onCreateCollection({ name: name.trim(), imageUri: imageUri.trim() });
      onChange(String(newId));
      setIsCreating(false);
      setName('');
      setImageUri('');
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Failed to create collection');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      <label className="input-label">Collection</label>
      <p className="text-xs text-gray-500 mb-2">
        {collections.length > 0
          ? `${collections.length} ${collections.length === 1 ? 'collection' : 'collections'} available`
          : 'No collections yet — create one below or mint standalone.'}
      </p>

      {isCreating ? (
        <div className="space-y-3 p-4 rounded-xl bg-bezamint-muted/20 border border-bezamint-border">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-300">Create New Collection</p>
            <button
              onClick={() => {
                setIsCreating(false);
                setError(null);
              }}
              className="p-1 rounded-lg text-gray-500 hover:text-gray-300"
              aria-label="Cancel collection creation"
            >
              <HiOutlineX className="w-4 h-4" />
            </button>
          </div>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Collection name"
            maxLength={64}
            className="input-field text-sm py-2"
            aria-label="New collection name"
          />
          <input
            type="url"
            value={imageUri}
            onChange={(e) => setImageUri(e.target.value)}
            placeholder="Image URL (https://... or ipfs://...)"
            className="input-field text-sm py-2"
            aria-label="New collection image URL"
          />
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button
            onClick={handleCreate}
            disabled={isSubmitting}
            className="btn-primary w-full text-sm py-2 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <HiOutlinePlus className="w-4 h-4" />
            {isSubmitting ? 'Creating on-chain...' : 'Create Collection'}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="relative">
            <HiOutlineCollection className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <select
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className="input-field pl-11 appearance-none"
            >
              <option value="">No Collection (Standalone NFT)</option>
              {collections.map((col) => (
                <option key={col.id} value={col.id}>
                  {col.name}
                </option>
              ))}
            </select>
            <svg
              className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </div>
          {onCreateCollection && (
            <button
              onClick={() => setIsCreating(true)}
              className="flex items-center gap-1 text-xs text-bezamint-secondary hover:text-bezamint-primary transition-colors"
            >
              <HiOutlinePlus className="w-3 h-3" />
              Create a new collection
            </button>
          )}
        </div>
      )}
      <p className="text-xs text-gray-500 mt-1">
        Select a collection to add this NFT to, or leave empty for standalone.
      </p>
    </div>
  );
}
