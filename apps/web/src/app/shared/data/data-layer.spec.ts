import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, Injectable, inject, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import type { UserSummary } from '@smartdocs/contracts';
import { Observable, of } from 'rxjs';
import { AuthStore } from '../../core/auth/auth.store';
import { bindListToUrl } from './list-url-state';
import { PaginatedStore } from './paginated-store';
import { ResourceApi } from './resource-api';
import { type ListQuery, type Page, listQuery, sameQuery } from './types';

interface Item {
  key: string;
}
interface ItemFilters {
  state?: string;
  kind?: string;
}

const USER: UserSummary = { id: 'u1', name: 'U', email: 'u@example.com', createdAt: '' };

class FakeAuthStore {
  readonly user = signal<UserSummary | null>(USER);
}

/** A store for a made-up resource, to test the base class on its own. */
@Injectable({ providedIn: 'root' })
class ItemsStore extends PaginatedStore<Item, ItemFilters> {
  readonly queries: ListQuery<ItemFilters>[] = [];
  answer: (query: ListQuery<ItemFilters>) => Observable<Page<Item>> = (query) =>
    of({ items: [{ key: `p${query.page}` }], page: query.page, pageSize: query.pageSize, total: 100 });

  constructor() {
    super({ pageSize: 25 });
  }
  protected fetch(query: ListQuery<ItemFilters>) {
    this.queries.push(query);
    return this.answer(query);
  }
  protected idOf(item: Item) {
    return item.key;
  }
}

describe('types', () => {
  it('sameQuery ignores empty filters and filter order', () => {
    const a = listQuery({ pageSize: 20, filters: { state: 'x', kind: '' } });
    const b = listQuery({ pageSize: 20, filters: { kind: undefined, state: 'x' } });

    expect(sameQuery(a, b)).toBe(true);
    expect(sameQuery(a, { ...b, page: 2 })).toBe(false);
    expect(sameQuery(a, { ...b, sort: { active: 'name', direction: 'asc' } })).toBe(false);
  });
});

describe('ResourceApi', () => {
  @Injectable({ providedIn: 'root' })
  class ItemsApi extends ResourceApi<Item, Item, ItemFilters> {
    protected readonly path = 'items';
  }

  let api: ItemsApi;
  let backend: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(ItemsApi);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  it('lists with the page, the set filters, and the sort', () => {
    api
      .list(listQuery({ page: 3, pageSize: 10, filters: { state: 'open', kind: '' }, sort: { active: 'name', direction: 'desc' } }))
      .subscribe();

    backend.expectOne('/api/items?page=3&pageSize=10&state=open&sort=name&order=desc').flush({});
  });

  it('gets and deletes one item with its id escaped', () => {
    api.detail('a/b?c').subscribe();
    backend.expectOne('/api/items/a%2Fb%3Fc').flush({});

    api.remove('x').subscribe();
    expect(backend.expectOne('/api/items/x').request.method).toBe('DELETE');
  });
});

describe('PaginatedStore', () => {
  let store: ItemsStore;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [{ provide: AuthStore, useClass: FakeAuthStore }] });
    store = TestBed.inject(ItemsStore);
  });

  it('starts from its defaults', () => {
    expect(store.query()).toEqual({ page: 1, pageSize: 25, sort: null, filters: {} });
    expect(store.view()).toBe('loading');
  });

  it('keeps the filters and sort when paging', async () => {
    await store.setFilters({ state: 'open' });
    await store.setSort({ active: 'name', direction: 'asc' });
    await store.load(3);

    expect(store.queries.at(-1)).toEqual({
      page: 3,
      pageSize: 25,
      sort: { active: 'name', direction: 'asc' },
      filters: { state: 'open' },
    });
  });

  it('goes back to page 1 when the filters, the sort or the page size change', async () => {
    await store.load(4);
    await store.setFilters({ state: 'open' });
    expect(store.page()).toBe(1);

    await store.load(4);
    await store.setSort({ active: 'name', direction: 'desc' });
    expect(store.page()).toBe(1);

    await store.load(4);
    await store.setPageSize(50);
    expect(store.page()).toBe(1);
    expect(store.pageCount()).toBe(2);
  });

  it('shows the requested query while it loads, and keeps it after a failure so a retry asks again', async () => {
    store.answer = () => new Observable<Page<Item>>((subscriber) => subscriber.error(new Error('down')));

    await store.load(2);

    expect(store.view()).toBe('error');
    expect(store.page()).toBe(2);
    store.answer = (query) => of({ items: [{ key: 'ok' }], page: query.page, pageSize: 25, total: 60 });
    await store.refresh();
    expect(store.queries.at(-1)!.page).toBe(2);
    expect(store.view()).toBe('data');
  });

  it('forgets an item by the id the subclass names', async () => {
    await store.load();
    store.forget('p1');

    expect(store.items()).toEqual([]);
    expect(store.total()).toBe(99);
  });
});

describe('bindListToUrl', () => {
  @Component({ template: '' })
  class ListPage {
    readonly store = inject(ItemsStore);
    readonly list = bindListToUrl(this.store, {
      pageSizes: [25, 50],
      filters: { state: ['open', 'closed'] },
      sortable: ['name'],
    });
  }

  let harness: RouterTestingHarness;
  let store: ItemsStore;
  let page: ListPage;

  async function open(url: string): Promise<void> {
    harness = await RouterTestingHarness.create();
    page = await harness.navigateByUrl(url, ListPage);
    store = TestBed.inject(ItemsStore);
    await settle();
  }

  async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve));
    await harness.fixture.whenStable();
  }

  const url = () => TestBed.inject(Router).url;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'items', component: ListPage }]),
        { provide: AuthStore, useClass: FakeAuthStore },
      ],
    });
  });

  it('reads the list once, fresh, with what the URL says', async () => {
    await open('/items?page=3&pageSize=50&state=open&sort=name:desc');

    expect(store.queries).toEqual([
      { page: 3, pageSize: 50, sort: { active: 'name', direction: 'desc' }, filters: { state: 'open' } },
    ]);
  });

  it('ignores values that are wrong or not allowed, instead of sending them to the API', async () => {
    await open('/items?page=-2&pageSize=7&state=hacked&sort=password:asc&kind=x');

    expect(store.queries).toEqual([{ page: 1, pageSize: 25, sort: null, filters: { state: undefined } }]);
  });

  it('writes a page change to the URL, and the URL change reads the page', async () => {
    await open('/items');

    await page.list.goTo(2);
    await settle();

    expect(url()).toBe('/items?page=2');
    expect(store.queries.map((q) => q.page)).toEqual([1, 2]);
  });

  it('starts filters at page 1 and leaves defaults out of the URL', async () => {
    await open('/items?page=4');

    await page.list.setFilters({ state: 'closed' });
    await settle();

    expect(url()).toBe('/items?state=closed');
    expect(store.queries.at(-1)).toMatchObject({ page: 1, filters: { state: 'closed' } });
  });

  it('follows Back to the previous query', async () => {
    await open('/items');
    await page.list.goTo(2);
    await settle();

    await harness.navigateByUrl('/items');
    await settle();

    expect(store.page()).toBe(1);
    expect(store.queries.map((q) => q.page)).toEqual([1, 2, 1]);
  });

  it('reads the list again when asked for the query it already shows (the URL does not change)', async () => {
    await open('/items');

    await page.list.goTo(1);

    expect(url()).toBe('/items');
    expect(store.queries).toHaveLength(2);
  });
});
