import { Component, Injectable, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { UserSummary } from '@smartdocs/contracts';
import { Observable, Subject, of, throwError } from 'rxjs';
import { AuthStore } from '../../core/auth/auth.store';
import { PaginatedStore } from './paginated-store';
import { pollWhile } from './poll-while';
import type { ListQuery, Page, RequestOptions } from './types';

interface Item {
  id: string;
}

const USER: UserSummary = { id: 'u1', name: 'U', email: 'u@example.com', createdAt: '' };
const page = (ids: string[]): Page<Item> => ({ items: ids.map((id) => ({ id })), page: 1, pageSize: 20, total: ids.length });

@Injectable({ providedIn: 'root' })
class ItemsStore extends PaginatedStore<Item> {
  readonly calls: RequestOptions[] = [];
  answer: () => Observable<Page<Item>> = () => of(page(['a']));
  constructor() {
    super({ pageSize: 20 });
  }
  protected fetch(_query: ListQuery, options: RequestOptions) {
    this.calls.push(options);
    return this.answer();
  }
  protected idOf(item: Item) {
    return item.id;
  }
}

describe('PaginatedStore background refresh', () => {
  let store: ItemsStore;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: AuthStore, useValue: { user: signal<UserSummary | null>(USER) } }],
    });
    store = TestBed.inject(ItemsStore);
  });

  it('keeps showing the rows while it runs, then shows the new ones', async () => {
    await store.load();
    const answer = new Subject<Page<Item>>();
    store.answer = () => answer;

    const refreshing = store.refresh({ background: true });
    expect(store.view()).toBe('data');
    expect(store.status()).toBe('ready');
    answer.next(page(['a', 'b']));
    answer.complete();
    await refreshing;

    expect(store.items().map((item) => item.id)).toEqual(['a', 'b']);
    expect(store.calls.at(-1)).toEqual({ background: true });
  });

  it('ignores a failure: the last good rows stay, with no error banner', async () => {
    await store.load();
    store.answer = () => throwError(() => new Error('down'));

    await store.refresh({ background: true });

    expect(store.view()).toBe('data');
    expect(store.error()).toBeNull();
  });

  it('does nothing before the first list arrived, or while a visible request runs', async () => {
    await store.refresh({ background: true });
    expect(store.calls).toEqual([]);

    store.answer = () => new Subject<Page<Item>>();
    void store.load();
    await store.refresh({ background: true });
    expect(store.calls).toHaveLength(1);
  });

  it('drops a background answer when the person asked for something since', async () => {
    await store.load();
    const late = new Subject<Page<Item>>();
    store.answer = () => late;
    const background = store.refresh({ background: true });
    store.answer = () => of(page(['fresh']));
    await store.load(1);

    late.next(page(['stale']));
    late.complete();
    await background;

    expect(store.items().map((item) => item.id)).toEqual(['fresh']);
  });
});

describe('pollWhile', () => {
  @Component({ template: '' })
  class Poller {
    readonly active = signal(false);
    runs = 0;
    slow: Promise<void> | null = null;
    constructor() {
      pollWhile(this.active, () => {
        this.runs++;
        return this.slow ?? undefined;
      }, 1000);
    }
  }

  let hidden = false;

  beforeEach(() => {
    vi.useFakeTimers();
    hidden = false;
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => (hidden ? 'hidden' : 'visible'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function create() {
    const fixture = TestBed.createComponent(Poller);
    fixture.detectChanges();
    const tick = async (ms: number) => {
      fixture.detectChanges();
      await vi.advanceTimersByTimeAsync(ms);
    };
    return { fixture, poller: fixture.componentInstance, tick };
  }

  it('runs only while the condition is true', async () => {
    const { poller, tick } = create();
    await tick(3000);
    expect(poller.runs).toBe(0);

    poller.active.set(true);
    await tick(3000);
    expect(poller.runs).toBe(3);

    poller.active.set(false);
    await tick(3000);
    expect(poller.runs).toBe(3);
  });

  it('skips ticks while the tab is hidden', async () => {
    const { poller, tick } = create();
    poller.active.set(true);
    hidden = true;
    await tick(3000);
    expect(poller.runs).toBe(0);

    hidden = false;
    await tick(1000);
    expect(poller.runs).toBe(1);
  });

  it('never runs a slow action twice at once', async () => {
    const { poller, tick } = create();
    let finish: () => void = () => undefined;
    poller.slow = new Promise<void>((resolve) => (finish = resolve));
    poller.active.set(true);

    await tick(3000);
    expect(poller.runs).toBe(1);

    finish();
    poller.slow = null;
    await tick(1000);
    expect(poller.runs).toBe(2);
  });

  it('stops when the component is destroyed', async () => {
    const { fixture, poller, tick } = create();
    poller.active.set(true);
    await tick(1000);
    fixture.destroy();

    await vi.advanceTimersByTimeAsync(5000);

    expect(poller.runs).toBe(1);
  });
});
