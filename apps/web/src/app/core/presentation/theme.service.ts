import { DOCUMENT } from '@angular/common';
import { Injectable, inject, signal } from '@angular/core';

export type Theme = 'light' | 'dark';
const KEY = 'smartdocs.theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly window = this.document.defaultView;
  private readonly _current = signal<Theme>(this.initialTheme());
  readonly current = this._current.asReadonly();

  constructor() {
    this.apply(this._current());
  }

  set(theme: Theme): void {
    this._current.set(theme);
    this.apply(theme);
    try {
      this.window?.localStorage.setItem(KEY, theme);
    } catch {
      // Storage can be disabled; the current choice still works for this page.
    }
  }

  toggle(): void {
    this.set(this._current() === 'dark' ? 'light' : 'dark');
  }

  private initialTheme(): Theme {
    try {
      const saved = this.window?.localStorage.getItem(KEY);
      if (saved === 'light' || saved === 'dark') return saved;
    } catch {
      // Fall through to the system preference.
    }
    return this.window?.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  private apply(theme: Theme): void {
    this.document.documentElement.dataset['theme'] = theme;
    this.document.documentElement.style.colorScheme = theme;
  }
}
