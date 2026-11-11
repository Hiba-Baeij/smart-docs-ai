import { NgTemplateOutlet } from '@angular/common';
import {
  Component,
  type TemplateRef,
  computed,
  contentChild,
  contentChildren,
  inject,
  input,
  output,
} from '@angular/core';
import { MatPaginator, MatPaginatorIntl, type PageEvent } from '@angular/material/paginator';
import { RouterLink } from '@angular/router';
import { LucideArrowDown, LucideArrowUp, LucideChevronsUpDown } from '@lucide/angular';
import type { AppError } from '../../core/http/app-error';
import { LocaleService } from '../../core/i18n/locale.service';
import { LocalePaginatorIntl } from '../../core/i18n/paginator-intl';
import type { Sort } from '../data/types';
import { EmptyState } from '../ui/empty-state/empty-state';
import { ErrorBanner } from '../ui/error-banner/error-banner';
import { Menu, type MenuItem } from '../ui/menu/menu';
import { Skeleton } from '../ui/skeleton/skeleton';
import type { CellContext, ColumnDef, RowAction } from './data-table.types';
import { CellDef, TableEmpty } from './table-templates';

type TableView = 'error' | 'loading' | 'empty' | 'data';

/**
 * The one table of the app. A page gives it rows, column definitions and (optionally) paging,
 * sort and row actions; the table draws every state:
 *
 *  - loading with no rows: skeleton rows the size of a page;
 *  - loading with rows (next page, new filter): the rows stay, dimmed, so nothing jumps;
 *  - error: the error banner with a retry; empty: the empty state (or `appTableEmpty`);
 *  - narrow containers: each row becomes a card (container query, not viewport).
 *
 * Paging and sorting are controlled: the table emits `pageChange`/`sortChange`, the page passes
 * them to its store (usually through `bindListToUrl`), and the new rows come back in. It works the
 * same with rows paged on the server or in memory.
 *
 *   <app-data-table [rows]="store.items()" [columns]="columns()" [trackBy]="byId"
 *     [caption]="…" [loading]="store.view() === 'loading'" [error]="store.error()"
 *     [page]="store.page()" [pageSize]="store.pageSize()" [total]="store.total()"
 *     [actions]="actions()" (pageChange)="list.goTo($event)" (retry)="list.refresh()">
 *     <ng-template appCell="status" [appCellRows]="store.items()" let-row>…</ng-template>
 *   </app-data-table>
 */
@Component({
  selector: 'app-data-table',
  imports: [
    EmptyState,
    ErrorBanner,
    MatPaginator,
    Menu,
    NgTemplateOutlet,
    RouterLink,
    Skeleton,
    LucideArrowDown,
    LucideArrowUp,
    LucideChevronsUpDown,
  ],
  providers: [{ provide: MatPaginatorIntl, useClass: LocalePaginatorIntl }],
  host: { '[class.refreshing]': 'loading() && rows().length > 0' },
  templateUrl: './data-table.html',
  styleUrl: './data-table.scss',
})
export class DataTable<T> {
  protected readonly locale = inject(LocaleService);

  readonly rows = input.required<readonly T[]>();
  readonly columns = input.required<readonly ColumnDef<T>[]>();
  /** A stable key per row (usually its id), for DOM reuse and animations. */
  readonly trackBy = input.required<(row: T) => string>();
  /** What the table lists, for screen readers (a visually hidden `<caption>`). */
  readonly caption = input.required<string>();
  readonly loading = input(false);
  readonly error = input<AppError | null>(null);

  /** 1-based. */
  readonly page = input(1);
  readonly pageSize = input(20);
  /** Rows in the whole list. `null` (default) shows no paginator. */
  readonly total = input<number | null>(null);
  /** Page sizes to choose from; none hides the chooser. */
  readonly pageSizeOptions = input<readonly number[]>([]);
  readonly sort = input<Sort | null>(null);

  readonly actions = input<readonly RowAction<T>[]>([]);
  /** The accessible name of a row's action menu, e.g. "Actions for report.pdf". */
  readonly rowLabel = input<((row: T) => string) | null>(null);
  readonly emptyMessage = input<string | null>(null);

  readonly pageChange = output<number>();
  readonly pageSizeChange = output<number>();
  readonly sortChange = output<Sort | null>();
  readonly retry = output<void>();

  private readonly cellDefs = contentChildren(CellDef);
  protected readonly emptyDef = contentChild(TableEmpty);

  protected readonly cellTemplates = computed(() => {
    const map = new Map<string, TemplateRef<CellContext<T>>>();
    for (const def of this.cellDefs()) {
      map.set(def.key(), def.template as TemplateRef<CellContext<T>>);
    }
    return map;
  });

  protected readonly view = computed<TableView>(() => {
    if (this.error()) return 'error';
    if (this.rows().length > 0) return 'data';
    return this.loading() ? 'loading' : 'empty';
  });

  protected readonly skeletonRows = computed(() =>
    Array.from({ length: Math.min(Math.max(this.pageSize(), 1), 8) }),
  );

  protected readonly showPaginator = computed(() => {
    const total = this.total();
    if (total === null || total === 0) return false;
    const smallest = Math.min(this.pageSize(), ...this.pageSizeOptions());
    return total > smallest;
  });

  /** Each row once, with its key and its action menu, so templates do no work per render. */
  protected readonly viewRows = computed(() => {
    const key = this.trackBy();
    const actions = this.actions();
    const label = this.rowLabel();
    return this.rows().map((row, index) => ({
      row,
      index,
      key: key(row),
      menuLabel: label ? this.locale.t('table.rowActions', { name: label(row) }) : this.locale.t('table.actions'),
      menu: actions.map(
        (action): MenuItem => ({
          id: action.id,
          label: action.label,
          icon: action.icon,
          tone: action.tone,
          hidden: action.hidden?.(row) ?? false,
          disabled: action.disabled?.(row) ?? false,
          run: () => action.run(row),
        }),
      ),
    }));
  });

  private readonly formats = computed(() => {
    const locale = this.locale.current();
    return {
      number: new Intl.NumberFormat(locale),
      date: new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }),
    };
  });

  protected align(column: ColumnDef<T>): 'start' | 'center' | 'end' {
    return column.align ?? (column.type === 'number' ? 'end' : 'start');
  }

  protected cellText(column: ColumnDef<T>, row: T): string {
    const value = column.value
      ? column.value(row)
      : ((row as Record<string, unknown>)[column.key] as string | number | null | undefined);
    if (value === null || value === undefined || value === '') {
      return '—';
    }
    switch (column.type) {
      case 'number':
        return typeof value === 'number' ? this.formats().number.format(value) : String(value);
      case 'date':
        return this.formats().date.format(new Date(value));
      default:
        return String(value);
    }
  }

  protected link(column: ColumnDef<T>, row: T): string | readonly unknown[] {
    return column.link?.(row) ?? [];
  }

  protected sortState(column: ColumnDef<T>): 'ascending' | 'descending' | 'none' {
    const sort = this.sort();
    if (sort?.active !== column.key) return 'none';
    return sort.direction === 'asc' ? 'ascending' : 'descending';
  }

  /** None → ascending → descending → none. */
  protected toggleSort(column: ColumnDef<T>): void {
    const sort = this.sort();
    if (sort?.active !== column.key) {
      this.sortChange.emit({ active: column.key, direction: 'asc' });
    } else if (sort.direction === 'asc') {
      this.sortChange.emit({ active: column.key, direction: 'desc' });
    } else {
      this.sortChange.emit(null);
    }
  }

  protected onPage(event: PageEvent): void {
    if (event.pageSize !== this.pageSize()) {
      this.pageSizeChange.emit(event.pageSize);
    } else {
      this.pageChange.emit(event.pageIndex + 1);
    }
  }
}
