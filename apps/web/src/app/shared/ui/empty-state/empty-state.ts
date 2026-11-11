import { Component, input, output } from '@angular/core';

/** "There is nothing here", and what to do about it. Only ever shown after the answer arrived. */
@Component({
  selector: 'app-empty-state',
  template: `
    <div class="empty" role="status">
      <svg class="art" viewBox="0 0 120 120" aria-hidden="true">
        <rect x="30" y="18" width="54" height="72" rx="10" class="a" />
        <path d="M44 42h26M44 56h26M44 70h14" class="line" />
        <circle cx="86" cy="84" r="16" class="b" />
        <path d="M80 84h12M86 78v12" class="line" />
      </svg>
      <p class="text">{{ message() }}</p>
      @if (actionLabel(); as label) {
        <button type="button" (click)="action.emit()">{{ label }}</button>
      }
    </div>
  `,
  styles: `
    .empty {
      padding: 2rem 1rem;
      border: 1px dashed var(--border);
      border-radius: 1.25rem;
      background: var(--surface);
      text-align: center;
      animation: rise 0.4s ease-out both;
    }
    .art {
      width: 6rem;
      height: 6rem;
      margin-bottom: 0.5rem;
      animation: float 4s ease-in-out infinite;
    }
    .a {
      fill: var(--accent-surface);
      stroke: var(--accent);
      stroke-width: 2;
    }
    .b {
      fill: var(--surface);
      stroke: var(--accent);
      stroke-width: 2;
    }
    .line {
      fill: none;
      stroke: var(--accent);
      stroke-width: 2.5;
      stroke-linecap: round;
    }
    @keyframes rise {
      from {
        opacity: 0;
        transform: translateY(8px);
      }
      to {
        opacity: 1;
        transform: none;
      }
    }
    @keyframes float {
      50% {
        transform: translateY(-5px);
      }
    }
    .text {
      margin: 0 0 0.75rem;
    }
    button {
      min-height: 2.75rem;
      padding: 0.375rem 1rem;
      border: 1px solid var(--accent);
      border-radius: 0.75rem;
      background: var(--surface);
      color: var(--accent);
      font: inherit;
      cursor: pointer;
    }
    button:focus-visible {
      outline: 3px solid var(--focus);
      outline-offset: 2px;
    }
  `,
})
export class EmptyState {
  readonly message = input.required<string>();
  readonly actionLabel = input<string | null>(null);
  readonly action = output<void>();
}
