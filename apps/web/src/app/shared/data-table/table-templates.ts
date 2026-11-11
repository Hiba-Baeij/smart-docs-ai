import { Directive, TemplateRef, inject, input } from '@angular/core';
import type { CellContext } from './data-table.types';

/**
 * A custom cell for the column with this key:
 *
 *   <ng-template appCell="status" [appCellRows]="rows()" let-row>
 *     <app-status-badge [state]="row.state" />
 *   </ng-template>
 *
 * `appCellRows` is optional and only types `let-row` (strict templates infer T from it).
 */
@Directive({ selector: 'ng-template[appCell]' })
export class CellDef<T> {
  readonly key = input.required<string>({ alias: 'appCell' });
  /** Only types `let-row`; the value is not used. */
  readonly appCellRows = input<readonly T[] | null>(null);
  readonly template = inject<TemplateRef<CellContext<T>>>(TemplateRef);

  // Angular's template type-checking hook: the signature is fixed, and `_ctx` exists only for
  // the type predicate.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static ngTemplateContextGuard<T>(_dir: CellDef<T>, _ctx: unknown): _ctx is CellContext<T> {
    return true;
  }
}

/** What the table shows instead of rows when the list is empty. Default: `app-empty-state`. */
@Directive({ selector: 'ng-template[appTableEmpty]' })
export class TableEmpty {
  readonly template = inject<TemplateRef<void>>(TemplateRef);
}
