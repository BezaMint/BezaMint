/**
 * Lightweight i18n layer.
 *
 * UI strings were inline English everywhere, making localization a rewrite.
 * This module establishes the plumbing: a typed translation dictionary, a
 * locale resolver (read from the <html lang> attribute so SSR and client
 * agree), and a `t()` lookup. English is the default locale; new locales are
 * added by extending the dictionary and the Locale union.
 */

export type Locale = 'en';

export const SUPPORTED_LOCALES: Locale[] = ['en'];

export const DEFAULT_LOCALE: Locale = 'en';

export type TranslationKey =
  | 'landing.tagline'
  | 'landing.subtitle'
  | 'landing.connect'
  | 'landing.explore'
  | 'landing.create.title'
  | 'landing.create.body'
  | 'landing.organize.title'
  | 'landing.organize.body'
  | 'landing.share.title'
  | 'landing.share.body';

const DICTIONARY: Record<Locale, Record<TranslationKey, string>> = {
  en: {
    'landing.tagline':
      'A comprehensive NFT creation and digital asset management platform built on the Stellar network using Soroban smart contracts.',
    'landing.subtitle': 'Mint unique NFTs with custom metadata and royalties.',
    'landing.connect': 'Connect Wallet',
    'landing.explore': 'Explore Collections',
    'landing.create.title': 'Create',
    'landing.create.body': 'Mint unique NFTs with custom metadata and royalties',
    'landing.organize.title': 'Organize',
    'landing.organize.body': 'Manage collections with powerful search and filtering',
    'landing.share.title': 'Share',
    'landing.share.body': 'Prepare assets for marketplace integration on Stellar',
  },
};

/**
 * Resolve the active locale from the document's lang attribute, falling back
 * to the default. Reads the DOM at call time so it works on both server and
 * client without a state round-trip.
 */
export function getLocale(): Locale {
  if (typeof document !== 'undefined') {
    const lang = document.documentElement.lang;
    if (lang && (SUPPORTED_LOCALES as string[]).includes(lang)) {
      return lang as Locale;
    }
  }
  return DEFAULT_LOCALE;
}

/**
 * Translate a key into the active locale.
 */
export function t(key: TranslationKey): string {
  return DICTIONARY[getLocale()][key];
}
