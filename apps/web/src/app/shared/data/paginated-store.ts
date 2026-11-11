import { type WritableSignal, computed, effect, inject, signal, untracked } from '@angular/core';
import { Observable, firstValueFrom } from 'rxjs';
import { AuthStore } from '../../core/auth/auth.store';
import { AppError, toAppError } from '../../core/http/app-error';
import type { Filters, ListQuery, ListStatus, ListView, Page, RequestOptions, Sort } from './types';

export interface PaginatedStoreOptions {
  pageSize: number;
}

/**
 * The state of one paged list of the signed-in user's records, written once for every resource.
 * A feature store only says how to fetch a page and what an item's id is:
 *
 *   @Injectable({ providedIn: 'root' })
 *   export class DocumentsStore extends PaginatedStore<DocumentSummary, DocumentFilters> {
 *     private readonly api = inject(DocumentsApi);
 *     constructor() { super({ pageSize: 20 }); }
 *     protected fetch(query, options) { return this.api.list(query, options); }
 *     protected idOf(item) { return item.id; }
 *   }
 *
 * What it guarantees, so no feature has to think about it again:
 *  - Four views in a fixed precedence (error, loading, empty, data): "empty" only after an answer.
 *  - The latest request wins. An answer to an older request is dropped (a ticket per request).
 *  - Rows belong to a user. Everything exposed is empty unless its owner is the user signed in
 *    now, so user B never sees user A's rows, not even for an instant, and a late answer to A's
 *    request is dropped instead of stored.
 *  - Asking for a page past the end (its last row was deleted) shows the last page instead.
 *  - `load`/`apply` never reject: a failure becomes `status = 'error'` for the page to show.
 */
export abstract class PaginatedStore<T, F extends Filters = Filters> {
  private readonly auth = inject(AuthStore);
  private readonly defaults: ListQuery<F>;

  private readonly _items = signal<T[]>([]);
  private readonly _status = signal<ListStatus>('idle');
  private readonly _error = signal<AppError | null>(null);
  private readonly _query: WritableSignal<ListQuery<F>>;
  private readonly _total = signal(0);
  private readonly _loadedAt = signal(0);
  private readonly _owner = signal<string | null>(null);

  /** True only while what is held belongs to the user who is signed in now. */
  private readonly current = computed(
    () => this._owner() !== null && this._owner() === (this.auth.user()?.id ?? null),
  );

  readonly items = computed(() => (this.current() ? this._items() : []));
  readonly status = computed<ListStatus>(() => (this.current() ? this._status() : 'idle'));
  readonly error = computed(() => (this.current() ? this._error() : null));
  /** The query the list shows (or is loading). The defaults for another user's list. */
  readonly query = computed(() => (this.current() ? this._query() : this.defaults));
  readonly page = computed(() => this.query().page);
  readonly pageSize = computed(() => this.query().pageSize);
  readonly sort = computed(() => this.query().sort);
  readonly filters = computed(() => this.query().filters);
  readonly total = computed(() => (this.current() ? this._total() : 0));
  /** When the list was last read; a page can use it to judge how old a row's state is. */
  readonly loadedAt = computed(() => (this.current() ? this._loadedAt() : 0));
  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize())));

  readonly view = computed<ListView>(() => {
    if (this.status() === 'error') {
      return 'error';
    }
    // An empty list is only true after the answer arrived; before that the person must see loading.
    if (this.status() !== 'ready') {
      return 'loading';
    }
    return this.items().length === 0 ? 'empty' : 'data';
  });

  /** Incremented by every request; an answer that is not for the latest one is ignored. */
  private ticket = 0;

  protected constructor(options: PaginatedStoreOptions) {
    this.defaults = { page: 1, pageSize: options.pageSize, sort: null, filters: {} as F };
    this._query = signal<ListQuery<F>>(this.defaults);

    // Memory hygiene on top of the guard above: when the user changes, forget the old user's rows.
    effect(() => {
      const user = this.auth.user()?.id ?? null;
      untracked(() => {
        if (user !== this._owner()) {
          this.clear();
        }
      });
    });
  }

  /** Reads one page. Pass `options` on to the API (`background` keeps polling out of the progress bar). */
  protected abstract fetch(query: ListQuery<F>, options: RequestOptions): Observable<Page<T>>;

  /** The id `forget` matches on. */
  protected abstract idOf(item: T): string;

  /** Reads `page` (default: the current page) with the current page size, sort and filters. */
  load(page?: number): Promise<void> {
    return this.apply(page === undefined ? {} : { page });
  }

  /**
   * Reads the current query again. With `{ background: true }` (polling) the rows stay as they are
   * while it runs, a failure is ignored (the last good rows stay), and it does nothing while a
   * visible request is already running.
   */
  refresh(options: RequestOptions = {}): Promise<void> {
    return this.apply({}, options);
  }

  /** Changes part of the query and reads it. Changing anything but the page starts at page 1. */
  async apply(changes: Partial<ListQuery<F>>, options: RequestOptions = {}): Promise<void> {
    const owner = this.auth.user()?.id ?? null;
    if (owner === null) {
      return; // nobody is signed in; there is nothing to read
    }
    if (owner !== this._owner()) {
      this.clear();
      this._owner.set(owner);
    }
    const background = options.background === true;
    // A background refresh never interrupts what the person asked for, and never runs before
    // there is a list to refresh.
    if (background && this._status() !== 'ready') {
      return;
    }
    // After the owner check on purpose: a query read before it would be the PREVIOUS user's.
    const query: ListQuery<F> = { ...this._query(), ...changes };
    const ticket = ++this.ticket;
    this._query.set(query);
    if (!background) {
      this._status.set('loading');
      this._error.set(null);
    }

    try {
      const result = await firstValueFrom(this.fetch(query, options));
      if (this.isStale(ticket, owner)) {
        return;
      }
      this._items.set(result.items);
      this._query.set({ ...query, page: result.page });
      this._total.set(result.total);
      this._loadedAt.set(Date.now());
      this._status.set('ready');

      // The page asked for no longer exists (its last row was deleted): show the last one. Only
      // when the last page is really before this one, so an odd answer cannot loop.
      const lastPage = Math.ceil(result.total / query.pageSize);
      if (result.items.length === 0 && result.total > 0 && lastPage < result.page) {
        await this.apply({ page: lastPage } as Partial<ListQuery<F>>);
      }
    } catch (error) {
      if (this.isStale(ticket, owner) || background) {
        return;
      }
      this._error.set(toAppError(error));
      this._status.set('error');
    }
  }

  setFilters(filters: F): Promise<void> {
    return this.apply({ filters, page: 1 } as Partial<ListQuery<F>>);
  }

  setSort(sort: Sort | null): Promise<void> {
    return this.apply({ sort, page: 1 } as Partial<ListQuery<F>>);
  }

  setPageSize(pageSize: number): Promise<void> {
    return this.apply({ pageSize, page: 1 } as Partial<ListQuery<F>>);
  }

  /**
   * Drops an item from what is held, without asking the server: for after it was deleted, or
   * found to be already gone, somewhere else.
   */
  forget(id: string): void {
    if (!this.current() || !this._items().some((item) => this.idOf(item) === id)) {
      return;
    }
    this._items.update((items) => items.filter((item) => this.idOf(item) !== id));
    this._total.update((total) => Math.max(0, total - 1));
  }

  private isStale(ticket: number, owner: string): boolean {
    return ticket !== this.ticket || owner !== (this.auth.user()?.id ?? null);
  }

  private clear(): void {
    this.ticket++; // whatever is still in flight was for someone else
    this._items.set([]);
    this._status.set('idle');
    this._error.set(null);
    this._query.set(this.defaults);
    this._total.set(0);
    this._loadedAt.set(0);
    this._owner.set(null);
  }
}
