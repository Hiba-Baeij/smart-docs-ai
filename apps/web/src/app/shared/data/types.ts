/** One page of a list, as every list endpoint answers (`packages/contracts`, e.g. DocumentPage). */
export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export type SortDirection = 'asc' | 'desc';

export interface Sort {
  /** The column key, as the API names it. */
  active: string;
  direction: SortDirection;
}

/**
 * Filter values by name, as an interface of optional string fields, e.g.
 * `interface DocumentFilters { status?: DocumentStatus }`. An empty or missing value means
 * "not filtered". (`object`, not a Record, so a plain interface fits.)
 */
export type Filters = object;

/** Everything that selects which rows a list shows. Also what is kept in the URL. */
export interface ListQuery<F extends Filters = Filters> {
  page: number;
  pageSize: number;
  sort: Sort | null;
  filters: F;
}

export interface RequestOptions {
  /**
   * A request nobody is waiting for (polling): it stays out of the global progress bar, and a
   * list keeps showing its rows as they are (no loading state) until the answer arrives.
   */
  background?: boolean;
}

/** What a list can show, in order of precedence: an empty list only after the answer arrived. */
export type ListView = 'error' | 'loading' | 'empty' | 'data';

/** What a list is doing. `idle` is "never asked"; it is shown like `loading`. */
export type ListStatus = 'idle' | 'loading' | 'ready' | 'error';

/** A query with defaults: page 1, no sort, no filters. */
export function listQuery<F extends Filters = Filters>(
  query: Partial<ListQuery<F>> & Pick<ListQuery<F>, 'pageSize'>,
): ListQuery<F> {
  return { page: 1, sort: null, filters: {} as F, ...query };
}

/** The filters that are actually set, without empty values: for query strings and comparisons. */
export function activeFilters(filters: Filters): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(filters) as [string, unknown][]) {
    if (typeof value === 'string' && value !== '') {
      result[key] = value;
    }
  }
  return result;
}

/** True when two queries select the same rows. */
export function sameQuery(a: ListQuery, b: ListQuery): boolean {
  return (
    a.page === b.page &&
    a.pageSize === b.pageSize &&
    a.sort?.active === b.sort?.active &&
    a.sort?.direction === b.sort?.direction &&
    JSON.stringify(sortedEntries(activeFilters(a.filters))) ===
      JSON.stringify(sortedEntries(activeFilters(b.filters)))
  );
}

function sortedEntries(record: Record<string, string>): [string, string][] {
  return Object.entries(record).sort(([a], [b]) => a.localeCompare(b));
}
