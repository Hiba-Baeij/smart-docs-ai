import { Component, inject } from '@angular/core';
import { LocaleService } from '../core/i18n/locale.service';
import { isLocale } from '../core/i18n/locales';
import { ThemeService } from '../core/presentation/theme.service';

@Component({
  selector: 'app-preferences-controls',
  template: `
    <div class="preferences" role="group" [attr.aria-label]="locale.t('preferences.label')">
      <button
        type="button"
        class="preference-button"
        [attr.aria-label]="
          theme.current() === 'dark' ? locale.t('theme.light') : locale.t('theme.dark')
        "
        (click)="theme.toggle()"
      >
        <span aria-hidden="true">{{ theme.current() === 'dark' ? '☀' : '☾' }}</span>
      </button>
      @if (locale.available.length > 2) {
        <select
          class="preference-button locale-button"
          [attr.aria-label]="locale.t('locale.label')"
          (change)="choose($event)"
        >
          @for (code of locale.available; track code) {
            <option [value]="code" [attr.lang]="code" [selected]="code === locale.current()">
              {{ locale.nativeName(code) }}
            </option>
          }
        </select>
      } @else {
        <!-- Two languages: one button that names the other one, in that language. -->
        <button
          type="button"
          class="preference-button locale-button"
          [attr.lang]="locale.next()"
          (click)="locale.set(locale.next())"
        >
          {{ locale.nativeName(locale.next()) }}
        </button>
      }
    </div>
  `,
  styles: `
    .preferences {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
    }
    .preference-button {
      min-width: 2.75rem;
      min-height: 2.75rem;
      border: 1px solid var(--border);
      border-radius: 0.75rem;
      background: var(--surface-raised);
      color: var(--text);
      cursor: pointer;
      font: inherit;
    }
    .preference-button:hover {
      border-color: var(--accent);
    }
    .preference-button:focus-visible {
      outline: 3px solid var(--focus);
      outline-offset: 2px;
    }
    .locale-button {
      padding-inline: 0.75rem;
      font-size: 0.85rem;
      font-weight: 700;
    }
  `,
})
export class PreferencesControls {
  protected readonly locale = inject(LocaleService);
  protected readonly theme = inject(ThemeService);

  protected choose(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (isLocale(value)) this.locale.set(value);
  }
}
