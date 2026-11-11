import { Component, input, output } from '@angular/core';
import { LucideCheck } from '@lucide/angular';

export interface ChipOption {
  /** `null` is the "all / not filtered" choice. */
  value: string | null;
  label: string;
}

/**
 * A single-choice filter as a row of chips ("All · Processing · Ready · Failed"). Each chip is a
 * toggle button with `aria-pressed`, in a group named by `label`. Selection is controlled: the
 * page passes `selected` and handles `selectedChange` (usually by writing it to the URL).
 */
@Component({
  selector: 'app-filter-chips',
  imports: [LucideCheck],
  host: { role: 'group', '[attr.aria-label]': 'label()' },
  template: `
    @for (option of options(); track option.value) {
      <button
        type="button"
        class="chip"
        [attr.aria-pressed]="option.value === selected()"
        (click)="option.value !== selected() && selectedChange.emit(option.value)"
      >
        @if (option.value === selected()) {
          <svg lucideCheck class="check" aria-hidden="true"></svg>
        }
        {{ option.label }}
      </button>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      min-height: 2.25rem;
      padding: 0 0.9rem;
      border: 1px solid var(--border-control);
      border-radius: 999px;
      background: var(--surface);
      color: var(--text-muted);
      font: inherit;
      font-size: 0.875rem;
      font-weight: 600;
      cursor: pointer;
      transition:
        background-color 0.18s ease,
        border-color 0.18s ease,
        color 0.18s ease,
        transform 0.15s ease;
    }
    .chip:hover {
      border-color: var(--accent);
      color: var(--text);
    }
    .chip:active {
      transform: scale(0.96);
    }
    .chip[aria-pressed='true'] {
      border-color: var(--accent);
      background: var(--accent-surface);
      color: var(--accent);
    }
    .chip:focus-visible {
      outline: 3px solid var(--focus);
      outline-offset: 2px;
    }
    .check {
      width: 0.95rem;
      height: 0.95rem;
      animation: pop 0.2s ease-out;
    }
    @keyframes pop {
      from {
        transform: scale(0.4);
        opacity: 0;
      }
    }
  `,
})
export class FilterChips {
  readonly options = input.required<readonly ChipOption[]>();
  readonly selected = input<string | null>(null);
  /** The group's accessible name, e.g. "Filter by status". */
  readonly label = input.required<string>();
  readonly selectedChange = output<string | null>();
}
