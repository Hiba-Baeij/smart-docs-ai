import { DestroyRef, inject } from '@angular/core';
import { ActivatedRoute, type ParamMap, Router } from '@angular/router';
import type { PaginatedStore } from './paginated-store';
import { type Filters, type ListQuery, type Sort, activeFilters, sameQuery } from './types';

export interface ListUrlOptions<F extends Filters> {
  /** Page sizes a person may choose; any other `pageSize` in the URL falls back to the default. */
  pageSizes?: readonly number[];
  /** The accepted values of each filter. A filter not listed here is never read from the URL. */
  filters?: Readonly<Partial<Record<keyof F & string, readonly string[]>>>;
  /** The columns that may be sorted. A `sort` for any other column is ignored. */
  sortable?: readonly string[];
}

export interface ListUrlState<F extends Filters> {
  goTo(page: number): Promise<void>;
  setPageSize(pageSize: number): Promise<void>;
  setSort(sort: Sort | null): Promise<void>;
  setFilters(filters: F): Promise<void>;
  /** Reads the list again with the query it shows. */
  refresh(): Promise<void>;
}

/**
 * Keeps a list's page, page size, sort and filters in the URL (`?page=2&status=FAILED&sort=name:asc`),
 * so reload, Back/Forward and a shared link all show the same rows. The URL is the source of truth:
 *
 *  - every change (pager, filter chip, column header) navigates;
 *  - every URL change (including Back) is read, checked, and given to the store;
 *  - opening the page always reads the list fresh.
 *
 * Values that are wrong or not allowed in the URL are ignored, never sent to the API. Defaults
 * (page 1, the default page size, no sort, no filters) are left out of the URL to keep it short.
 * Call in an injection context (a field initializer of the page component).
 */
export function bindListToUrl<T, F extends Filters>(
  store: PaginatedStore<T, F>,
  options: ListUrlOptions<F> = {},
): ListUrlState<F> {
  const route = inject(ActivatedRoute);
  const router = inject(Router);
  const defaultPageSize = store.pageSize();
  let first = true;

  const subscription = route.queryParamMap.subscribe((params) => {
    const query = parse(params);
    if (first || !sameQuery(query, store.query())) {
      first = false;
      void store.apply(query);
    }
  });
  inject(DestroyRef).onDestroy(() => subscription.unsubscribe());

  function parse(params: ParamMap): ListQuery<F> {
    const page = Number(params.get('page'));
    const pageSize = Number(params.get('pageSize'));
    const filters: Record<string, string | undefined> = {};
    for (const [key, allowed] of Object.entries(options.filters ?? {}) as [string, readonly string[]][]) {
      const value = params.get(key);
      filters[key] = value !== null && allowed.includes(value) ? value : undefined;
    }
    return {
      page: Number.isInteger(page) && page >= 1 ? page : 1,
      pageSize: options.pageSizes?.includes(pageSize) ? pageSize : defaultPageSize,
      sort: parseSort(params.get('sort')),
      filters: filters as unknown as F,
    };
  }

  function parseSort(value: string | null): Sort | null {
    const [active, direction] = value?.split(':') ?? [];
    if (!active || !options.sortable?.includes(active)) {
      return null;
    }
    return { active, direction: direction === 'desc' ? 'desc' : 'asc' };
  }

  /** Writes a query to the URL; when the URL would not change, reads the list again instead. */
  async function navigate(query: ListQuery<F>): Promise<void> {
    if (sameQuery(query, parse(route.snapshot.queryParamMap))) {
      await store.apply(query);
      return;
    }
    const filterKeys = Object.keys(options.filters ?? {});
    const set = activeFilters(query.filters);
    const queryParams: Record<string, string | number | null> = {
      page: query.page === 1 ? null : query.page,
      pageSize: query.pageSize === defaultPageSize ? null : query.pageSize,
      sort: query.sort ? `${query.sort.active}:${query.sort.direction}` : null,
    };
    for (const key of filterKeys) {
      queryParams[key] = set[key] ?? null;
    }
    await router.navigate([], { relativeTo: route, queryParams, queryParamsHandling: 'merge' });
  }

  const current = () => store.query();

  return {
    goTo: (page) => navigate({ ...current(), page }),
    setPageSize: (pageSize) => navigate({ ...current(), pageSize, page: 1 }),
    setSort: (sort) => navigate({ ...current(), sort, page: 1 }),
    setFilters: (filters) => navigate({ ...current(), filters, page: 1 }),
    refresh: () => store.refresh(),
  };
}
