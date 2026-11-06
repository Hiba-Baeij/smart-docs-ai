import { Component, computed, inject, input } from '@angular/core';
import type { DocumentState } from '../features/documents/document-state';
import { LocaleService } from '../core/i18n/locale.service';

/**
 * The state of a document as a word, never as a colour alone: the text carries the meaning and
 * the colour only helps the eye.
 */
@Component({
  selector: 'app-status-badge',
  template: `<span class="badge" [class]="'badge ' + state()"
    ><i class="dot" aria-hidden="true"></i>{{ label() }}</span
  >`,
  styles: `
    .dot {
      display: inline-block;
      width: 0.5rem;
      height: 0.5rem;
      margin-inline-end: 0.4rem;
      border-radius: 50%;
      background: currentColor;
    }
    .processing .dot {
      animation: pulse 1.2s ease-in-out infinite;
    }
    @keyframes pulse {
      50% {
        opacity: 0.3;
        transform: scale(0.7);
      }
    }
    .badge {
      display: inline-block;
      padding: 0.125rem 0.5rem;
      border-radius: 999px;
      font-size: 0.875rem;
      font-weight: 600;
      white-space: nowrap;
    }
    .processing {
      background: var(--accent-surface);
      color: var(--accent);
    }
    .completed {
      background: var(--success-surface);
      color: var(--success);
    }
    .failed {
      background: var(--error-surface);
      color: var(--error);
    }
    .stalled {
      background: var(--warning-surface);
      color: var(--warning);
    }
  `,
})
export class StatusBadge {
  readonly state = input.required<DocumentState>();
  private readonly locale = inject(LocaleService);
  protected readonly label = computed(() => {
    this.locale.current();
    return this.locale.t(`docs.state.${this.state()}`);
  });
}
