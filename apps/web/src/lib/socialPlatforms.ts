import {
  FaXTwitter,
  FaDiscord,
  FaGithub,
  FaYoutube,
  FaInstagram,
  FaTelegram,
} from 'react-icons/fa6';
import { HiOutlineGlobe } from 'react-icons/hi';
import type { SocialPlatform } from '@bezamint/shared';

export interface PlatformConfig {
  value: SocialPlatform;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const SOCIAL_PLATFORMS: PlatformConfig[] = [
  { value: 'twitter', label: 'X (Twitter)', icon: FaXTwitter },
  { value: 'discord', label: 'Discord', icon: FaDiscord },
  { value: 'github', label: 'GitHub', icon: FaGithub },
  { value: 'youtube', label: 'YouTube', icon: FaYoutube },
  { value: 'instagram', label: 'Instagram', icon: FaInstagram },
  { value: 'telegram', label: 'Telegram', icon: FaTelegram },
  { value: 'website', label: 'Website', icon: HiOutlineGlobe },
  { value: 'other', label: 'Other', icon: HiOutlineGlobe },
];

export function getPlatformIcon(
  platform: SocialPlatform,
): React.ComponentType<{ className?: string }> {
  return SOCIAL_PLATFORMS.find((p) => p.value === platform)?.icon || HiOutlineGlobe;
}
