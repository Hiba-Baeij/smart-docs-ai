import { DOCUMENT } from '@angular/common';
import { Injectable, inject, signal } from '@angular/core';
import { arabic } from './messages.ar';
import { english, type MessageKey } from './messages.en';

export type Locale = 'en' | 'ar';
const KEY = 'smartdocs.locale';

@Injectable({ providedIn: 'root' })
export class LocaleService {
  private readonly document = inject(DOCUMENT);
  private readonly window = this.document.defaultView;
  private readonly _current = signal<Locale>(this.initialLocale());
  readonly current = this._current.asReadonly();

  constructor() {
    this.apply(this._current());
  }

  t(key: MessageKey): string {
    return this._current() === 'ar' ? (arabic[key] ?? english[key]) : english[key];
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

  toggle(): void {
    this.set(this._current() === 'ar' ? 'en' : 'ar');
  }

  private initialLocale(): Locale {
    try {
      return this.window?.localStorage.getItem(KEY) === 'ar' ? 'ar' : 'en';
    } catch {
      return 'en';
    }
  }

  private apply(locale: Locale): void {
    this.document.documentElement.lang = locale;
    this.document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
  }
}
