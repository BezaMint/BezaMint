'use client';

import { useState } from 'react';
import { HiOutlineUser, HiOutlineX } from 'react-icons/hi';
import type { CreatorFormState } from '@bezamint/shared';
import ImagePreview from '@/components/mint/ImagePreview';
import SocialLinkEditor from './SocialLinkEditor';
import { useWallet } from '@/context';

const INITIAL: CreatorFormState = {
  displayName: '',
  bio: '',
  avatarUri: '',
  bannerUri: '',
  socialLinks: [],
};

interface CreatorProfileFormProps {
  onSubmit: (data: CreatorFormState) => void;
  onCancel: () => void;
  initialData?: CreatorFormState;
  isSubmitting?: boolean;
}

export default function CreatorProfileForm({
  onSubmit,
  onCancel,
  initialData,
  isSubmitting = false,
}: CreatorProfileFormProps) {
  const { isConnected } = useWallet();
  const [form, setForm] = useState<CreatorFormState>(initialData || INITIAL);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const update = <K extends keyof CreatorFormState>(field: K, value: CreatorFormState[K]) => {
    setForm((p) => ({ ...p, [field]: value }));
    if (errors[field]) setErrors((p) => { const n = { ...p }; delete n[field]; return n; });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.displayName.trim()) errs.displayName = 'Display name is required';
    if (!form.avatarUri.trim()) errs.avatarUri = 'Avatar image is required';
    if (Object.keys(errs).length) { setErrors(errs); return; }
    onSubmit(form);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-white">
          {initialData ? 'Edit Profile' : 'Create Profile'}
        </h2>
        <button type="button" onClick={onCancel} className="p-2 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-bezamint-muted">
          <HiOutlineX className="w-5 h-5" />
        </button>
      </div>

      {/* Display Name */}
      <div>
        <label className="input-label">Display Name <span className="text-red-400">*</span></label>
        <input type="text" value={form.displayName} onChange={(e) => update('displayName', e.target.value)}
          placeholder="Your creator name" maxLength={64}
          className={`input-field ${errors.displayName ? 'border-red-500/50' : ''}`} />
        {errors.displayName && <p className="text-xs text-red-400 mt-1">{errors.displayName}</p>}
      </div>

      {/* Bio */}
      <div>
        <label className="input-label">Bio</label>
        <textarea value={form.bio} onChange={(e) => update('bio', e.target.value)}
          placeholder="Tell the world about yourself..." maxLength={500} rows={3}
          className="input-field resize-none" />
        <span className="text-xs text-gray-500">{form.bio.length}/500</span>
      </div>

      {/* Avatar */}
      <ImagePreview label="Avatar" value={form.avatarUri}
        onChange={(v) => update('avatarUri', v)} placeholder="https://ipfs.io/ipfs/avatar..." required />
      {errors.avatarUri && <p className="text-xs text-red-400 -mt-3">{errors.avatarUri}</p>}

      {/* Banner */}
      <ImagePreview label="Banner (optional)" value={form.bannerUri}
        onChange={(v) => update('bannerUri', v)} placeholder="https://ipfs.io/ipfs/banner..." />

      {/* Social Links */}
      <SocialLinkEditor
        links={form.socialLinks}
        onChange={(v) => update('socialLinks', v)}
      />

      {/* Submit */}
      <div className="flex gap-3 pt-4 border-t border-bezamint-border">
        <button type="button" onClick={onCancel} className="btn-secondary flex-1">Cancel</button>
        <button type="submit" disabled={isSubmitting || !isConnected}
          className="btn-primary flex-1 disabled:opacity-50">
          {isSubmitting ? 'Saving...' : initialData ? 'Save Changes' : 'Create Profile'}
        </button>
      </div>
    </form>
  );
}
