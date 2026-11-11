import { Component, booleanAttribute, effect, inject, input } from '@angular/core';
import { MatTooltip } from '@angular/material/tooltip';

/**
 * A button that shows only an icon. `label` is required: it is the accessible name and the
 * tooltip, so an icon is never the only way to know what the button does.
 *
 *   <button appIconButton [label]="locale.t('common.copy')"><svg lucideCopy></svg></button>
 */
@Component({
  // On the native element for the same reason as `appButton`.
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: 'button[appIconButton], a[appIconButton]',
  hostDirectives: [MatTooltip],
  host: {
    class: 'app-icon-button',
    '[class.tone-danger]': 'tone() === "danger"',
    '[attr.aria-label]': 'label()',
    '[attr.disabled]': 'disabled() ? "" : null',
  },
  template: '<ng-content />',
  styles: `
    :host {
      display: inline-grid;
      place-items: center;
      flex: none;
      width: 2.75rem;
      height: 2.75rem;
      padding: 0;
      border: 1px solid transparent;
      border-radius: 0.75rem;
      background: transparent;
      color: var(--text-muted);
      cursor: pointer;
      transition:
        background-color 0.18s ease,
        color 0.18s ease,
        transform 0.15s ease;
    }
    :host(:hover:not([disabled])) {
      background: var(--surface-muted);
      color: var(--text);
    }
    :host(.tone-danger:hover:not([disabled])) {
      background: var(--error-surface);
      color: var(--error);
    }
    :host(:active:not([disabled])) {
      transform: scale(0.94);
    }
    :host(:focus-visible) {
      outline: 3px solid var(--focus);
      outline-offset: 2px;
    }
    :host([disabled]) {
      cursor: not-allowed;
      opacity: 0.5;
    }
    :host ::ng-deep svg {
      width: 1.25rem;
      height: 1.25rem;
    }
  `,
})
export class IconButton {
  readonly label = input.required<string>();
  readonly tone = input<'default' | 'danger'>('default');
  readonly disabled = input(false, { transform: booleanAttribute });

  constructor() {
    const tooltip = inject(MatTooltip);
    effect(() => (tooltip.message = this.label()));
  }
}
