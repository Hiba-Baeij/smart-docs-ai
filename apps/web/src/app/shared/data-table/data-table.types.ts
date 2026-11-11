import type { LucideIcon } from '@lucide/angular';

export type ColumnType = 'text' | 'number' | 'date' | 'link' | 'custom';

/**
 * One column of `app-data-table`. Define the columns in a `computed()` so their headers follow
 * a language switch:
 *
 *   protected readonly columns = computed<ColumnDef<DocumentSummary>[]>(() => [
 *     { key: 'name', header: this.locale.t('docs.name'), type: 'link', primary: true,
 *       value: (d) => d.originalName, link: (d) => ['/documents', d.id] },
 *     { key: 'createdAt', header: this.locale.t('docs.uploaded'), type: 'date', sortable: true },
 *     { key: 'status', header: this.locale.t('docs.status'), type: 'custom' },   // <ng-template appCell="status">
 *   ]);
 */
export interface ColumnDef<T> {
  /** Unique per table. Also the sort key sent to the API, and the `appCell` name of a custom cell. */
  key: string;
  /** The header text, already translated. */
  header: string;
  /** How the value is shown. `custom` renders the `<ng-template appCell="key">`. Default: `text`. */
  type?: ColumnType;
  /** The value to show. Default: `row[key]`. */
  value?: (row: T) => string | number | null | undefined;
  /** For `link`: the router link of the cell. */
  link?: (row: T) => string | readonly unknown[];
  sortable?: boolean;
  /** Default: `end` for numbers, `start` otherwise (mirrored in RTL). */
  align?: 'start' | 'center' | 'end';
  /** A CSS width, e.g. `8rem`. */
  width?: string;
  /**
   * The row's title in the narrow (card) layout: shown large, without its label. One per table,
   * usually the name.
   */
  primary?: boolean;
  /** Left out of the narrow (card) layout, for details that only fit a wide table. */
  hideWhenNarrow?: boolean;
}

/** A per-row action, shown in the row's "more actions" menu. */
export interface RowAction<T> {
  id: string;
  label: string;
  icon?: LucideIcon;
  tone?: 'default' | 'danger';
  hidden?: (row: T) => boolean;
  disabled?: (row: T) => boolean;
  run: (row: T) => void;
}

/** The context of a custom cell template: `let-row` is the row, `let-i="index"` its position. */
export interface CellContext<T> {
  $implicit: T;
  index: number;
}
