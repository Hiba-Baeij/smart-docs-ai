import { Component, computed, input, output } from '@angular/core';
import { AppError } from '../core/http/app-error';
import { userMessage } from '../core/http/user-message';

/**
 * A failed request, said in words, with a way to try again. It announces itself (`role="alert"`)
 * so a screen reader hears it without the user having to find it. It receives a value and emits an
 * event; it knows nothing about stores or HTTP.
 */
@Component({
  selector: 'app-error-banner',
  template: `
    <div class="banner" role="alert">
      <p class="text">{{ message() }}</p>
      @if (error().requestId; as reference) {
        <p class="reference">Reference for support: {{ reference }}</p>
      }
      @if (retryLabel(); as label) {
        <button type="button" (click)="retry.emit()">{{ label }}</button>
      }
    </div>
  `,
  styles: `
    .banner {
      padding: 0.75rem 1rem;
      border: 1px solid var(--error);
      border-radius: 1rem;
      background: var(--error-surface);
      color: var(--error);
      animation: rise 0.3s ease-out both;
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
    button {
      min-height: 2.75rem;
      padding: 0.375rem 1rem;
      border: 1px solid var(--error);
      border-radius: 0.75rem;
      background: var(--surface);
      font: inherit;
      cursor: pointer;
    }
    button:focus-visible {
      outline: 3px solid var(--focus);
      outline-offset: 2px;
    }
  `,
})
export class ErrorBanner {
  readonly error = input.required<AppError>();
  /** The button's text; `null` for an error that cannot be retried. */
  readonly retryLabel = input<string | null>('Try again');
  readonly retry = output<void>();

  protected readonly message = computed(() => userMessage(this.error()));
}
