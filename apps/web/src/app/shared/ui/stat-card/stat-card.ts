import { Component, input } from '@angular/core';

export type StatTone = 'accent' | 'success' | 'warning' | 'danger' | 'neutral';

/**
 * One number with its label, such as "Chunks · 42". The icon goes in the `statIcon` slot.
 *
 *   <app-stat-card [label]="…" [value]="doc.chunkCount" tone="accent">
 *     <svg statIcon lucideLayers></svg>
 *   </app-stat-card>
 */
@Component({
  selector: 'app-stat-card',
  host: { '[class]': '"tone-" + tone()' },
  template: `
    <span class="icon" aria-hidden="true"><ng-content select="[statIcon]" /></span>
    <div class="text">
      <p class="label">{{ label() }}</p>
      <p class="value" dir="auto">{{ value() }}</p>
      @if (hint(); as text) {
        <p class="hint">{{ text }}</p>
      }
    </div>
  `,
  styles: `
    :host {
      display: flex;
      align-items: center;
      gap: 0.85rem;
      padding: 1rem 1.1rem;
      border: 1px solid var(--border);
      border-radius: 1rem;
      background: var(--surface);
      animation: stat-in 0.35s ease-out both;
    }
    .icon {
      display: grid;
      place-items: center;
      flex: none;
      width: 2.5rem;
      height: 2.5rem;
      border-radius: 0.75rem;
      background: var(--tone-surface);
      color: var(--tone);
    }
    .icon:empty {
      display: none;
    }
    .icon ::ng-deep svg {
      width: 1.25rem;
      height: 1.25rem;
    }
    .text {
      min-width: 0;
    }
    p {
      margin: 0;
    }
    .label {
      color: var(--text-muted);
      font-size: 0.8rem;
      font-weight: 600;
    }
    .value {
      font-size: 1.2rem;
      font-weight: 700;
      overflow-wrap: anywhere;
    }
    .hint {
      color: var(--text-muted);
      font-size: 0.8rem;
    }
    :host(.tone-accent) {
      --tone: var(--accent);
      --tone-surface: var(--accent-surface);
    }
    :host(.tone-success) {
      --tone: var(--success);
      --tone-surface: var(--success-surface);
    }
    :host(.tone-warning) {
      --tone: var(--warning);
      --tone-surface: var(--warning-surface);
    }
    :host(.tone-danger) {
      --tone: var(--error);
      --tone-surface: var(--error-surface);
    }
    :host(.tone-neutral) {
      --tone: var(--text-muted);
      --tone-surface: var(--surface-muted);
    }
    @keyframes stat-in {
      from {
        opacity: 0;
        transform: translateY(6px);
      }
    }
  `,
})
export class StatCard {
  readonly label = input.required<string>();
  readonly value = input.required<string | number>();
  readonly hint = input<string | null>(null);
  readonly tone = input<StatTone>('accent');
}
