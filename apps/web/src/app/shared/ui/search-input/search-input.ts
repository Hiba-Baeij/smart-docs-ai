import { Component, input, model, output } from '@angular/core';
import { LucideSearch, LucideX } from '@lucide/angular';

/**
 * A search box: a labelled `type="search"` field with a clear button. `value` is a two-way model
 * updated on every keystroke; `submitted` fires on Enter (e.g. "go to the next match").
 *
 *   <app-search-input [label]="…" [(value)]="query" (submitted)="next()" />
 */
@Component({
  selector: 'app-search-input',
  imports: [LucideSearch, LucideX],
  template: `
    <svg lucideSearch class="icon" aria-hidden="true"></svg>
    <input
      type="search"
      [attr.aria-label]="label()"
      [placeholder]="label()"
      [value]="value()"
      autocomplete="off"
      (input)="value.set($any($event.target).value)"
      (keydown.enter)="submitted.emit()"
      (keydown.escape)="clear($event)"
    />
    @if (value()) {
      <button type="button" class="clear" [attr.aria-label]="clearLabel()" (click)="clear()">
        <svg lucideX aria-hidden="true"></svg>
      </button>
    }
  `,
  styles: `
    :host {
      position: relative;
      display: flex;
      align-items: center;
      min-width: 0;
    }
    .icon {
      position: absolute;
      inset-inline-start: 0.8rem;
      width: 1.05rem;
      height: 1.05rem;
      color: var(--text-muted);
      pointer-events: none;
    }
    input {
      width: 100%;
      min-height: 2.75rem;
      padding-inline: 2.5rem;
      border: 1px solid var(--border-control);
      border-radius: 0.75rem;
      background: var(--surface);
      color: var(--text);
      font: inherit;
      transition:
        border-color 0.18s ease,
        box-shadow 0.18s ease;
    }
    input::placeholder {
      color: var(--text-muted);
    }
    input:hover {
      border-color: var(--accent);
    }
    input:focus-visible {
      outline: 3px solid var(--focus);
      outline-offset: 1px;
    }
    input::-webkit-search-cancel-button {
      display: none;
    }
    .clear {
      position: absolute;
      inset-inline-end: 0.35rem;
      display: grid;
      place-items: center;
      width: 2.1rem;
      height: 2.1rem;
      border: 0;
      border-radius: 0.5rem;
      background: none;
      color: var(--text-muted);
      cursor: pointer;
    }
    .clear:hover {
      background: var(--surface-muted);
      color: var(--text);
    }
    .clear:focus-visible {
      outline: 3px solid var(--focus);
    }
    .clear svg {
      width: 1rem;
      height: 1rem;
    }
  `,
})
export class SearchInput {
  /** The accessible name and the placeholder. */
  readonly label = input.required<string>();
  readonly clearLabel = input('Clear');
  readonly value = model('');
  readonly submitted = output<void>();

  protected clear(event?: Event): void {
    if (event && !this.value()) {
      return; // Esc on an empty box keeps its normal meaning (closing a dialog, for example)
    }
    event?.stopPropagation();
    this.value.set('');
  }
}
