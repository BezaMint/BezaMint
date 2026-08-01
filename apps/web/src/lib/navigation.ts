import {
  HiOutlineHome,
  HiOutlineCollection,
  HiOutlinePlusCircle,
  HiOutlineUser,
  HiOutlineSearch,
  HiOutlineCog,
  HiOutlineShieldCheck,
} from 'react-icons/hi';

export const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: HiOutlineHome },
  { href: '/collections', label: 'Collections', icon: HiOutlineCollection },
  { href: '/mint', label: 'Mint NFT', icon: HiOutlinePlusCircle },
  { href: '/explore', label: 'Explore', icon: HiOutlineSearch },
  { href: '/verify', label: 'Verify', icon: HiOutlineShieldCheck },
  { href: '/profile', label: 'Profile', icon: HiOutlineUser },
  { href: '/settings', label: 'Settings', icon: HiOutlineCog },
] as const;
