import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import type { DocumentSummary } from '@smartdocs/contracts';
import { firstValueFrom } from 'rxjs';
import { AuthStore } from '../../core/auth/auth.store';
import { AppError, toAppError } from '../../core/http/app-error';
import { DocumentsApi } from './documents.api';

/** What the list is doing. `idle` is "never asked"; the page treats it like `loading`. */
export type ListStatus = 'idle' | 'loading' | 'ready' | 'error';

/** The four things the list can show, in the order of precedence (docs/tracks/angular/02 section 6). */
export type ListView = 'error' | 'loading' | 'empty' | 'data';

export const PAGE_SIZE = 20;

/**
 * The signed-in user's document list.
 *
 * Whose rows these are is part of the state: the store remembers the owner of what it holds, and
 * everything it exposes is empty unless that owner is the current user. So when user B signs in
 * after user A in the same tab, A's rows cannot be shown to B, not even for the instant before B's
 * list arrives, and a late answer to A's request is dropped instead of being stored.
 */
@Injectable({ providedIn: 'root' })
export class DocumentsStore {
  private readonly api = inject(DocumentsApi);
  private readonly auth = inject(AuthStore);

  private readonly _items = signal<DocumentSummary[]>([]);
  private readonly _status = signal<ListStatus>('idle');
  private readonly _error = signal<AppError | null>(null);
  private readonly _page = signal(1);
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
  readonly page = computed(() => (this.current() ? this._page() : 1));
  readonly total = computed(() => (this.current() ? this._total() : 0));
  /** When the list was last read; the page uses it to tell a stalled upload from a running one. */
  readonly loadedAt = computed(() => (this.current() ? this._loadedAt() : 0));
  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.total() / PAGE_SIZE)));

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

  constructor() {
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

  /** Reads one page. Never rejects: a failure becomes `status = 'error'` for the page to show. */
  async load(requestedPage?: number): Promise<void> {
    const owner = this.auth.user()?.id ?? null;
    if (owner === null) {
      return; // nobody is signed in; there is nothing to read
    }

    if (owner !== this._owner()) {
      this.clear();
      this._owner.set(owner);
    }
    // After the owner check on purpose: a default evaluated before it would be the PREVIOUS
    // user's page, so a new user would open the list on page 3 of their own documents.
    const page = requestedPage ?? this._page();
    const ticket = ++this.ticket;
    this._status.set('loading');
    this._error.set(null);

    try {
      const result = await firstValueFrom(this.api.list(page, PAGE_SIZE));
      if (this.isStale(ticket, owner)) {
        return;
      }
      this._items.set(result.items);
      this._page.set(result.page);
      this._total.set(result.total);
      this._loadedAt.set(Date.now());
      this._status.set('ready');

      // The page we asked for no longer exists (its last document was deleted): show the last one.
      // Only when the last page is really before this one, so an odd answer cannot loop.
      const lastPage = Math.ceil(result.total / PAGE_SIZE);
      if (result.items.length === 0 && result.total > 0 && lastPage < result.page) {
        await this.load(lastPage);
      }
    } catch (error) {
      if (this.isStale(ticket, owner)) {
        return;
      }
      this._error.set(toAppError(error));
      this._status.set('error');
    }
  }

  /** Reads the current page again. */
  refresh(): Promise<void> {
    return this.load(this._page());
  }

  /**
   * Drops a document from what is held, without asking the server: for after it was deleted, or
   * found to be already gone, somewhere else.
   */
  forget(id: string): void {
    if (!this.current() || !this._items().some((item) => item.id === id)) {
      return;
    }
    this._items.update((items) => items.filter((item) => item.id !== id));
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
    this._page.set(1);
    this._total.set(0);
    this._loadedAt.set(0);
    this._owner.set(null);
  }
}
