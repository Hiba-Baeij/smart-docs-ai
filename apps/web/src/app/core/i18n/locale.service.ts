import { Directionality } from '@angular/cdk/bidi';
import { DOCUMENT } from '@angular/common';
import { Injectable, computed, inject, signal } from '@angular/core';
import { AVAILABLE_LOCALES, DEFAULT_LOCALE, LOCALES, type Locale, isLocale } from './locales';
import type { MessageKey } from './messages.en';

export type { Locale } from './locales';

const KEY = 'smartdocs.locale';
/** Saved next to the language so `bootstrap-prefs.js` can set the direction without a language list. */
const DIR_KEY = 'smartdocs.dir';

@Injectable({ providedIn: 'root' })
export class LocaleService {
  private readonly document = inject(DOCUMENT);
  private readonly directionality = inject(Directionality);
  private readonly window = this.document.defaultView;
  private readonly _current = signal<Locale>(this.initialLocale());
  readonly current = this._current.asReadonly();

  /** Every supported language, in registry order. */
  readonly available = AVAILABLE_LOCALES;
  readonly dir = computed(() => LOCALES[this._current()].dir);
  /** The language the switcher moves to next (the other one, while there are two). */
  readonly next = computed(() => {
    const index = this.available.indexOf(this._current());
    return this.available[(index + 1) % this.available.length];
  });

  constructor() {
    this.apply(this._current());
  }

  /** The text for `key` in the current language; `{name}` placeholders are filled from `params`. */
  t(key: MessageKey, params?: Readonly<Record<string, string | number>>): string {
    const text =
      LOCALES[this._current()].messages[key] ?? LOCALES[DEFAULT_LOCALE].messages[key] ?? key;
    return params
      ? text.replace(/\{(\w+)\}/g, (match, name: string) => String(params[name] ?? match))
      : text;
  }

  /** A language's own name, e.g. for the switcher. */
  nativeName(locale: Locale): string {
    return LOCALES[locale].nativeName;
  }

  set(locale: Locale): void {
    this._current.set(locale);
    this.apply(locale);
    try {
      this.window?.localStorage.setItem(KEY, locale);
    } catch {
      // Language still changes for this page when storage is unavailable.
    }
  }

  private initialLocale(): Locale {
    try {
      const saved = this.window?.localStorage.getItem(KEY);
      return isLocale(saved) ? saved : DEFAULT_LOCALE;
    } catch {
      return DEFAULT_LOCALE;
    }
  }

  private apply(locale: Locale): void {
    const dir = LOCALES[locale].dir;
    this.document.documentElement.lang = locale;
    this.document.documentElement.dir = dir;
    // CDK reads the page direction once, at start-up. Telling it here makes every overlay
    // (dialog, menu, tooltip, paginator) follow a language switch without a reload.
    if (this.directionality.value !== dir) {
      this.directionality.valueSignal.set(dir);
      this.directionality.change.emit(dir);
    }
    try {
      // Also on start-up, so a language saved before this key existed gets its direction too.
      this.window?.localStorage.setItem(DIR_KEY, LOCALES[locale].dir);
    } catch {
      // Without storage the next load starts left-to-right until Angular applies the language.
    }
  }
}
