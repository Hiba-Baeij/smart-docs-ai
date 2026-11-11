import { Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LocaleService } from '../../core/i18n/locale.service';
import type { MessageKey } from '../../core/i18n/messages.en';
import { PreferencesControls } from '../../shared/preferences-controls';

/** The frame shared by the sign-in and sign-up pages; the page puts its content inside. */
@Component({
  selector: 'app-auth-layout',
  imports: [RouterLink, PreferencesControls],
  styleUrl: './auth-layout.scss',
  template: `
    <div class="auth-layout">
      <aside class="auth-story" aria-hidden="true">
        <div class="story-brand">SmartDocs <span>AI</span></div>
        <div class="story-copy">
          <span class="story-kicker">{{ locale.t('auth.hero.kicker') }}</span>
          <h2>{{ locale.t('auth.hero.title') }}</h2>
          <p>{{ locale.t('auth.hero.text') }}</p>
        </div>
        <div class="story-orbit"></div>
      </aside>
      <main class="auth-page min-h-dvh">
        <div class="auth-top">
          <a class="mobile-brand" routerLink="/login">SmartDocs AI</a><app-preferences-controls />
        </div>
        <div class="auth-card">
          <h1>{{ locale.t(heading()) }}</h1>
          <p class="auth-subtitle">{{ locale.t(subtitle()) }}</p>
          <ng-content />
        </div>
      </main>
    </div>
  `,
})
export class AuthLayout {
  protected readonly locale = inject(LocaleService);

  readonly heading = input.required<MessageKey>();
  readonly subtitle = input.required<MessageKey>();
}
