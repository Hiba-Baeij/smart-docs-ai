import { Component, booleanAttribute, computed, input } from '@angular/core';
import { Spinner } from '../spinner/spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

/**
 * The app's button. It is an attribute on a real `<button>` (or `<a>`), so the native element
 * keeps its semantics, keyboard behaviour and form submission:
 *
 *   <button appButton variant="primary" [loading]="save.pending()">Save</button>
 *
 * `loading` shows a spinner, sets `aria-busy` and disables the button, so it cannot be pressed
 * twice. Bind it to `mutation.pending()`.
 */
@Component({
  // An attribute on the native element (like Material's `button[matButton]`), not a wrapper
  // element, so the real <button> keeps its role, keyboard behaviour and form submission.
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: 'button[appButton], a[appButton]',
  imports: [Spinner],
  host: {
    '[class]': 'classes()',
    '[attr.disabled]': 'isDisabled() ? "" : null',
    '[attr.aria-disabled]': 'isDisabled() ? "true" : null',
    '[attr.aria-busy]': 'loading() ? "true" : null',
  },
  template: `
    @if (loading()) {
      <app-spinner class="app-button-spinner" />
    }
    <ng-content select="[appButtonIcon]" />
    <span class="app-button-label"><ng-content /></span>
  `,
  styles: `
    :host {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      min-height: 2.75rem;
      padding-inline: 1rem;
      border: 1px solid transparent;
      border-radius: 0.75rem;
      font: inherit;
      font-weight: 600;
      line-height: 1.2;
      text-decoration: none;
      white-space: nowrap;
      cursor: pointer;
      user-select: none;
      transition:
        background-color 0.18s ease,
        border-color 0.18s ease,
        color 0.18s ease,
        box-shadow 0.18s ease,
        transform 0.15s ease;
    }
    :host(.size-sm) {
      min-height: 2.25rem;
      padding-inline: 0.75rem;
      border-radius: 0.6rem;
      font-size: 0.875rem;
    }
    :host(:focus-visible) {
      outline: 3px solid var(--focus);
      outline-offset: 2px;
    }
    :host(:active:not([disabled])) {
      transform: scale(0.97);
    }
    :host([disabled]) {
      cursor: not-allowed;
      opacity: 0.55;
    }
    :host([aria-busy='true']) {
      cursor: progress;
      opacity: 0.85;
    }
    :host(.variant-primary) {
      background: var(--accent);
      color: var(--surface);
    }
    :host(.variant-primary:hover:not([disabled])) {
      background: var(--accent-strong);
      box-shadow: 0 6px 18px hsl(220 80% 40% / 0.25);
    }
    :host(.variant-secondary) {
      border-color: var(--border-control);
      background: var(--surface-raised);
      color: var(--text);
    }
    :host(.variant-secondary:hover:not([disabled])) {
      border-color: var(--accent);
      color: var(--accent);
    }
    :host(.variant-ghost) {
      background: transparent;
      color: var(--text-muted);
    }
    :host(.variant-ghost:hover:not([disabled])) {
      background: var(--surface-muted);
      color: var(--text);
    }
    :host(.variant-danger) {
      border-color: var(--error);
      background: var(--error-surface);
      color: var(--error);
    }
    :host(.variant-danger:hover:not([disabled])) {
      background: var(--error);
      color: var(--surface);
    }
    :host ::ng-deep [appButtonIcon] {
      flex: none;
      width: 1.1em;
      height: 1.1em;
    }
  `,
})
export class Button {
  readonly variant = input<ButtonVariant>('secondary');
  readonly size = input<ButtonSize>('md');
  readonly loading = input(false, { transform: booleanAttribute });
  readonly disabled = input(false, { transform: booleanAttribute });

  protected readonly isDisabled = computed(() => this.disabled() || this.loading());
  protected readonly classes = computed(
    () => `app-button variant-${this.variant()} size-${this.size()}`,
  );
}
