'use client';

import { useState } from 'react';
import { HiOutlinePlus, HiOutlineX } from 'react-icons/hi';
import type { CollectionCategory, CollectionFormState } from '@bezamint/shared';
import ImagePreview from '@/components/mint/ImagePreview';
import { useWallet } from '@/context';

const CATEGORIES: { value: CollectionCategory; label: string }[] = [
  { value: 'art', label: 'Art' },
  { value: 'music', label: 'Music' },
  { value: 'gaming', label: 'Gaming' },
  { value: 'sports', label: 'Sports' },
  { value: 'photography', label: 'Photography' },
  { value: 'brand', label: 'Brand' },
  { value: 'membership', label: 'Membership' },
  { value: 'ticketing', label: 'Ticketing' },
  { value: 'real_estate', label: 'Real Estate' },
  { value: 'other', label: 'Other' },
];

const INITIAL: CollectionFormState = {
  name: '',
  description: '',
  imageUri: '',
  externalUrl: '',
  category: 'art',
  tags: [],
};

interface CollectionFormProps {
  onSubmit: (data: CollectionFormState) => void;
  onCancel: () => void;
  initialData?: CollectionFormState;
  isSubmitting?: boolean;
}

export default function CollectionForm({
  onSubmit,
  onCancel,
  initialData,
  isSubmitting = false,
}: CollectionFormProps) {
  const { isConnected } = useWallet();
  const [form, setForm] = useState<CollectionFormState>(initialData || INITIAL);
  const [tagInput, setTagInput] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const update = <K extends keyof CollectionFormState>(field: K, value: CollectionFormState[K]) => {
    setForm((p) => ({ ...p, [field]: value }));
    if (errors[field]) setErrors((p) => { const n = { ...p }; delete n[field]; return n; });
  };

  const addTag = () => {
    const trimmed = tagInput.trim().toLowerCase();
    if (!trimmed || form.tags.length >= 10 || form.tags.includes(trimmed)) return;
    update('tags', [...form.tags, trimmed]);
    setTagInput('');
  };

  const removeTag = (tag: string) => {
    update('tags', form.tags.filter((t) => t !== tag));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = 'Name is required';
    if (!form.imageUri.trim()) errs.imageUri = 'Collection image is required';
    if (Object.keys(errs).length) { setErrors(errs); return; }
    onSubmit(form);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-white">
          {initialData ? 'Edit Collection' : 'Create Collection'}
        </h2>
        <button type="button" onClick={onCancel} className="p-2 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-bezamint-muted">
          <HiOutlineX className="w-5 h-5" />
        </button>
      </div>

      {/* Name */}
      <div>
        <label className="input-label">Name <span className="text-red-400">*</span></label>
        <input type="text" value={form.name} onChange={(e) => update('name', e.target.value)}
          placeholder="My Collection" maxLength={64}
          className={`input-field ${errors.name ? 'border-red-500/50' : ''}`} />
        {errors.name && <p className="text-xs text-red-400 mt-1">{errors.name}</p>}
      </div>

      {/* Description */}
      <div>
        <label className="input-label">Description</label>
        <textarea value={form.description} onChange={(e) => update('description', e.target.value)}
          placeholder="Describe your collection..." maxLength={1000} rows={3}
          className="input-field resize-none" />
        <span className="text-xs text-gray-500">{form.description.length}/1000</span>
      </div>

      {/* Image */}
      <ImagePreview label="Collection Image" value={form.imageUri}
        onChange={(v) => update('imageUri', v)} placeholder="https://ipfs.io/ipfs/..." required />
      {errors.imageUri && <p className="text-xs text-red-400 -mt-3">{errors.imageUri}</p>}

      {/* External URL */}
      <div>
        <label className="input-label">External URL (optional)</label>
        <input type="url" value={form.externalUrl} onChange={(e) => update('externalUrl', e.target.value)}
          placeholder="https://my-site.com/collection" className="input-field" />
      </div>

      {/* Category */}
      <div>
        <label className="input-label">Category</label>
        <select value={form.category} onChange={(e) => update('category', e.target.value as CollectionCategory)}
          className="input-field">
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>

      {/* Tags */}
      <div>
        <label className="input-label">Tags</label>
        <div className="flex gap-2">
          <input type="text" value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
            placeholder="Add a tag..." maxLength={20} className="input-field flex-1" />
          <button type="button" onClick={addTag}
            disabled={form.tags.length >= 10}
            className="btn-secondary py-2 px-4 flex items-center gap-1 disabled:opacity-30">
            <HiOutlinePlus className="w-4 h-4" /> Add
          </button>
        </div>
        {form.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {form.tags.map((tag) => (
              <span key={tag}
                className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs bg-bezamint-primary/10 text-bezamint-secondary border border-bezamint-primary/20">
                {tag}
                <button type="button" onClick={() => removeTag(tag)}
                  className="hover:text-red-400 transition-colors">
                  <HiOutlineX className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Submit */}
      <div className="flex gap-3 pt-4 border-t border-bezamint-border">
        <button type="button" onClick={onCancel} className="btn-secondary flex-1">Cancel</button>
        <button type="submit" disabled={isSubmitting || !isConnected}
          className="btn-primary flex-1 disabled:opacity-50">
          {isSubmitting ? 'Creating...' : initialData ? 'Save Changes' : 'Create Collection'}
        </button>
      </div>
    </form>
  );
}
