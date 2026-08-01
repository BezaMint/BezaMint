'use client';

import { HiOutlinePlus, HiOutlineTrash, HiOutlineGlobe } from 'react-icons/hi';
import { FaXTwitter, FaDiscord, FaGithub, FaYoutube, FaInstagram, FaTelegram } from 'react-icons/fa6';
import type { SocialLink, SocialPlatform } from '@bezamint/shared';

const PLATFORMS: { value: SocialPlatform; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'twitter', label: 'X (Twitter)', icon: FaXTwitter },
  { value: 'discord', label: 'Discord', icon: FaDiscord },
  { value: 'github', label: 'GitHub', icon: FaGithub },
  { value: 'youtube', label: 'YouTube', icon: FaYoutube },
  { value: 'instagram', label: 'Instagram', icon: FaInstagram },
  { value: 'telegram', label: 'Telegram', icon: FaTelegram },
  { value: 'website', label: 'Website', icon: HiOutlineGlobe },
  { value: 'other', label: 'Other', icon: HiOutlineGlobe },
];

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
        const platform = PLATFORMS.find((p) => p.value === link.platform);
        const Icon = platform?.icon || HiOutlineGlobe;

        return (
          <div key={idx} className="flex items-center gap-2 p-2 rounded-xl bg-bezamint-muted/30 border border-bezamint-border">
            <div className="relative flex-shrink-0">
              <select
                value={link.platform}
                onChange={(e) => updateLink(idx, 'platform', e.target.value)}
                className="input-field text-sm py-2 pl-8 pr-6 w-36 appearance-none bg-bezamint-muted"
              >
                {PLATFORMS.map((p) => (
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
