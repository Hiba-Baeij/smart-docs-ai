import { Component, booleanAttribute, input } from '@angular/core';

export type BadgeTone = 'info' | 'success' | 'warning' | 'danger' | 'neutral';

/**
 * A short status label in a pill. The text carries the meaning; the colour only helps the eye.
 * `pulse` animates the dot for a state that is still changing (processing).
 */
@Component({
  selector: 'app-badge',
  host: { '[class]': '"tone-" + tone()', '[class.pulse]': 'pulse()' },
  template: `<i class="dot" aria-hidden="true"></i><ng-content />`,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.15rem 0.6rem;
      border-radius: 999px;
      font-size: 0.85rem;
      font-weight: 600;
      white-space: nowrap;
    }
    .dot {
      width: 0.5rem;
      height: 0.5rem;
      border-radius: 50%;
      background: currentColor;
    }
    :host(.pulse) .dot {
      animation: pulse 1.2s ease-in-out infinite;
    }
    @keyframes pulse {
      50% {
        opacity: 0.3;
        transform: scale(0.7);
      }
    }
    :host(.tone-info) {
      background: var(--accent-surface);
      color: var(--accent);
    }
    :host(.tone-success) {
      background: var(--success-surface);
      color: var(--success);
    }
    :host(.tone-warning) {
      background: var(--warning-surface);
      color: var(--warning);
    }
    :host(.tone-danger) {
      background: var(--error-surface);
      color: var(--error);
    }
    :host(.tone-neutral) {
      background: var(--surface-muted);
      color: var(--text-muted);
    }
  `,
})
export class Badge {
  readonly tone = input<BadgeTone>('neutral');
  readonly pulse = input(false, { transform: booleanAttribute });
}
