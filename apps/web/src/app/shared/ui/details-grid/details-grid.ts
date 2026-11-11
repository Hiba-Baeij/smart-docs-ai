import { Component, input } from '@angular/core';

/**
 * Label/value pairs in a responsive grid, as a description list (`<dl>`), so the pairing is
 * announced by screen readers.
 *
 *   <app-details-grid>
 *     <app-detail [label]="…">PDF</app-detail>
 *     <app-detail [label]="…"><app-badge …/></app-detail>
 *   </app-details-grid>
 */
@Component({
  selector: 'app-details-grid',
  template: '<dl><ng-content /></dl>',
  styles: `
    dl {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
      gap: 1rem 1.5rem;
      margin: 0;
    }
  `,
})
export class DetailsGrid {}

/** One pair inside `app-details-grid`. The projected content is the value. */
@Component({
  selector: 'app-detail',
  template: `
    <dt>{{ label() }}</dt>
    <dd><ng-content /></dd>
  `,
  styles: `
    :host {
      display: grid;
      gap: 0.25rem;
      min-width: 0;
    }
    dt {
      color: var(--text-muted);
      font-size: 0.8rem;
      font-weight: 600;
      letter-spacing: 0.02em;
      text-transform: uppercase;
    }
    dd {
      margin: 0;
      font-weight: 600;
      overflow-wrap: anywhere;
    }
  `,
})
export class Detail {
  readonly label = input.required<string>();
}
