import { Component, computed, inject, input, output } from '@angular/core';
import { LucideCircleAlert, LucideRotateCw } from '@lucide/angular';
import { AppError } from '../../../core/http/app-error';
import { userMessage } from '../../../core/http/user-message';
import { LocaleService } from '../../../core/i18n/locale.service';
import { Button } from '../button/button';

/**
 * A failed request, said in words, with a way to try again. It announces itself (`role="alert"`)
 * so a screen reader hears it without the user having to find it. It receives a value and emits an
 * event; it knows nothing about stores or HTTP.
 */
@Component({
  selector: 'app-error-banner',
  imports: [Button, LucideCircleAlert, LucideRotateCw],
  template: `
    <div class="banner" role="alert">
      <svg lucideCircleAlert class="icon" aria-hidden="true"></svg>
      <div class="body">
        <p class="text">{{ message() }}</p>
        @if (error().requestId; as reference) {
          <p class="reference">{{ locale.t('common.reference', { ref: reference }) }}</p>
        }
        @if (label(); as text) {
          <button type="button" appButton size="sm" (click)="retry.emit()">
            <svg appButtonIcon lucideRotateCw></svg>{{ text }}
          </button>
        }
      </div>
    </div>
  `,
  styles: `
    .banner {
      display: flex;
      align-items: flex-start;
      gap: 0.75rem;
      padding: 0.9rem 1rem;
      border: 1px solid var(--error);
      border-radius: 1rem;
      background: var(--error-surface);
      color: var(--error);
      animation: rise 0.3s ease-out both;
    }
    .icon {
      flex: none;
      width: 1.35rem;
      height: 1.35rem;
      margin-block-start: 0.1rem;
    }
    .body {
      min-width: 0;
    }
    @keyframes rise {
      from {
        opacity: 0;
        transform: translateY(6px);
      }
      to {
        opacity: 1;
        transform: none;
      }
    }
    .text {
      margin: 0 0 0.5rem;
      font-weight: 600;
    }
    .reference {
      margin: 0 0 0.5rem;
      font-size: 0.875rem;
    }
  `,
})
export class ErrorBanner {
  protected readonly locale = inject(LocaleService);

  readonly error = input.required<AppError>();
  /** The button's text. Defaults to the translated "Try again"; `null` for no retry button. */
  readonly retryLabel = input<string | null | undefined>(undefined);
  readonly retry = output<void>();

  protected readonly message = computed(() => userMessage(this.error()));
  protected readonly label = computed(() => {
    const label = this.retryLabel();
    return label === undefined ? this.locale.t('common.retry') : label;
  });
}
