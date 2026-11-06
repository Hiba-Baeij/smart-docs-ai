import { Component, inject } from '@angular/core';
import { LocaleService } from '../core/i18n/locale.service';
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
      <button
        type="button"
        class="preference-button locale-button"
        [attr.aria-label]="locale.t('locale.switch')"
        (click)="locale.toggle()"
      >
        {{ locale.t('locale.switch') }}
      </button>
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
}
