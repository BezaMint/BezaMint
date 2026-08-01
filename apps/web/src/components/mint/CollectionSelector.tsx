'use client';

import { HiOutlineCollection } from 'react-icons/hi';

interface CollectionSelectorProps {
  value: string;
  onChange: (value: string) => void;
  collections?: { id: string; name: string }[];
}

export default function CollectionSelector({
  value,
  onChange,
  collections = [],
}: CollectionSelectorProps) {
  return (
    <div>
      <label className="input-label">Collection</label>
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
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>
      <p className="text-xs text-gray-500 mt-1">
        Select a collection to add this NFT to, or leave empty for standalone.
      </p>
    </div>
  );
}
