'use client';

import { HiOutlinePlus, HiOutlineTrash } from 'react-icons/hi';
import type { SocialLink } from '@bezamint/shared';
import { SOCIAL_PLATFORMS, getPlatformIcon } from '@/lib/socialPlatforms';

interface SocialLinkEditorProps {
  links: SocialLink[];
  onChange: (links: SocialLink[]) => void;
  maxLinks?: number;
}

export default function SocialLinkEditor({ links, onChange, maxLinks = 8 }: SocialLinkEditorProps) {
  const addLink = () => {
    if (links.length >= maxLinks) return;
    onChange([...links, { platform: 'twitter', url: '' }]);
  };

  const removeLink = (idx: number) => {
    onChange(links.filter((_, i) => i !== idx));
  };

  const updateLink = (idx: number, field: keyof SocialLink, value: string) => {
    const updated = links.map((link, i) =>
      i === idx ? { ...link, [field]: value } : link,
    );
    onChange(updated);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="input-label">Social Links</label>
        <span className="text-xs text-gray-500">{links.length}/{maxLinks}</span>
      </div>

      {links.map((link, idx) => {
        const Icon = getPlatformIcon(link.platform);

        return (
          <div key={idx} className="flex items-center gap-2 p-2 rounded-xl bg-bezamint-muted/30 border border-bezamint-border">
            <div className="relative flex-shrink-0">
              <select
                value={link.platform}
                onChange={(e) => updateLink(idx, 'platform', e.target.value)}
                className="input-field text-sm py-2 pl-8 pr-6 w-36 appearance-none bg-bezamint-muted"
              >
                {SOCIAL_PLATFORMS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
              <Icon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            </div>
            <input
              type="url"
              value={link.url}
              onChange={(e) => updateLink(idx, 'url', e.target.value)}
              placeholder={`https://${link.platform}.com/...`}
              className="input-field text-sm py-2 flex-1"
            />
            <button
              onClick={() => removeLink(idx)}
              className="p-2 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-all flex-shrink-0"
            >
              <HiOutlineTrash className="w-4 h-4" />
            </button>
          </div>
        );
      })}

      <button
        onClick={addLink}
        disabled={links.length >= maxLinks}
        className="flex items-center gap-2 text-sm text-bezamint-secondary hover:text-bezamint-primary transition-colors disabled:opacity-30"
      >
        <HiOutlinePlus className="w-4 h-4" />
        Add Social Link
      </button>
    </div>
  );
}
