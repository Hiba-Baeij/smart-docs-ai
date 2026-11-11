import { arabic } from './messages.ar';
import { english, type MessageKey } from './messages.en';

/** What the app needs to know about a language. */
export interface LocaleDefinition {
  /** The language's name in itself, as shown in the language switcher. */
  readonly nativeName: string;
  readonly dir: 'ltr' | 'rtl';
  /** Missing keys fall back to the default language. */
  readonly messages: Partial<Record<MessageKey, string>>;
}

/**
 * The supported languages: the ONLY place that lists them. To add one, write its
 * `messages.<code>.ts` and add an entry here; nothing else in the app names a language.
 */
export const LOCALES = {
  en: { nativeName: 'English', dir: 'ltr', messages: english },
  ar: { nativeName: 'العربية', dir: 'rtl', messages: arabic },
} as const satisfies Record<string, LocaleDefinition>;

export type Locale = keyof typeof LOCALES;

/** Used when nothing is saved, and for any text a language does not have yet. */
export const DEFAULT_LOCALE: Locale = 'en';

/**
 * The language the API writes its validation details in. Those texts are shown as they are only
 * to readers of this language; everyone else gets a generic line in their own.
 */
export const SERVER_LOCALE: Locale = 'en';

export const AVAILABLE_LOCALES = Object.keys(LOCALES) as Locale[];

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && Object.hasOwn(LOCALES, value);
}
