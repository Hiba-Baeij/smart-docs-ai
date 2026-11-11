import { Component, input } from '@angular/core';

/** A small indeterminate spinner that takes the current text colour. Decorative: aria-hidden. */
@Component({
  selector: 'app-spinner',
  host: { 'aria-hidden': 'true', '[style.--spinner-size]': 'size()' },
  template: '',
  styles: `
    :host {
      display: inline-block;
      flex: none;
      width: var(--spinner-size);
      height: var(--spinner-size);
      border: 2px solid currentColor;
      border-inline-end-color: transparent;
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
    }
    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      :host {
        animation-duration: 1.6s !important;
      }
    }
  `,
})
export class Spinner {
  /** Any CSS length. */
  readonly size = input('1em');
}
