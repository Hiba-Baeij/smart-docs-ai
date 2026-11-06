import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { DocumentPage, DocumentSummary, UserSummary } from '@smartdocs/contracts';
import { Observable, Subject, of, throwError } from 'rxjs';
import { AuthStore } from '../../core/auth/auth.store';
import { DocumentsApi } from './documents.api';
import { DocumentsStore, PAGE_SIZE } from './documents.store';

const user = (id: string): UserSummary => ({
  id,
  name: id,
  email: `${id}@example.com`,
  createdAt: '2026-10-31T00:00:00.000Z',
});

const doc = (id: string): DocumentSummary => ({
  id,
  originalName: `${id}.pdf`,
  fileType: 'pdf',
  status: 'COMPLETED',
  errorCode: null,
  chunkCount: 1,
  createdAt: '2026-10-31T00:00:00.000Z',
});

const page = (items: DocumentSummary[], pageNumber = 1, total = items.length): DocumentPage => ({
  items,
  page: pageNumber,
  pageSize: PAGE_SIZE,
  total,
});

/** Stands in for the session: a user the test can change, the way a sign-out and sign-in would. */
class FakeAuthStore {
  readonly user = signal<UserSummary | null>(user('sara'));
}

/** Stands in for the HTTP layer: each call is recorded and its answer is set by the test. */
class FakeDocumentsApi {
  calls: { page: number; pageSize: number }[] = [];
  answer: (page: number) => Observable<DocumentPage> = () => of(page([]));

  list(pageNumber: number, pageSize: number): Observable<DocumentPage> {
    this.calls.push({ page: pageNumber, pageSize });
    return this.answer(pageNumber);
  }
}

describe('DocumentsStore', () => {
  let auth: FakeAuthStore;
  let api: FakeDocumentsApi;
  let store: DocumentsStore;

  beforeEach(() => {
    auth = new FakeAuthStore();
    api = new FakeDocumentsApi();
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthStore, useValue: auth },
        { provide: DocumentsApi, useValue: api },
      ],
    });
    store = TestBed.inject(DocumentsStore);
  });

  const flush = () => TestBed.tick();

  describe('the four states, and their precedence', () => {
    it('is loading before anything was asked, never empty', () => {
      expect(store.view()).toBe('loading');
      expect(store.items()).toEqual([]);
    });

    it('is loading while the request is in flight, even with nothing yet to show', () => {
      api.answer = () => new Subject<DocumentPage>();

      void store.load();

      expect(store.status()).toBe('loading');
      expect(store.view()).toBe('loading');
    });

    it('is empty only after an empty answer', async () => {
      api.answer = () => of(page([]));

      await store.load();

      expect(store.view()).toBe('empty');
    });

    it('is data after an answer with documents', async () => {
      api.answer = () => of(page([doc('a'), doc('b')]));

      await store.load();

      expect(store.view()).toBe('data');
      expect(store.items().map((d) => d.id)).toEqual(['a', 'b']);
    });

    it('is error when the request failed, and error wins over everything else', async () => {
      api.answer = () => throwError(() => new HttpErrorResponse({ status: 0 }));

      await store.load();

      expect(store.view()).toBe('error');
      expect(store.error()?.code).toBe('NETWORK');
    });

    it('keeps showing the error while a retry is not yet answered? no: a retry is loading', async () => {
      api.answer = () => throwError(() => new HttpErrorResponse({ status: 0 }));
      await store.load();
      api.answer = () => new Subject<DocumentPage>();

      void store.load();

      expect(store.view()).toBe('loading');
      expect(store.error()).toBeNull();
    });

    it('recovers: a retry that works replaces the error with the data', async () => {
      api.answer = () => throwError(() => new HttpErrorResponse({ status: 0 }));
      await store.load();
      api.answer = () => of(page([doc('a')]));

      await store.load();

      expect(store.view()).toBe('data');
      expect(store.error()).toBeNull();
    });

    it('never rejects: a failure is state, not an exception', async () => {
      api.answer = () => throwError(() => new HttpErrorResponse({ status: 500 }));

      await expect(store.load()).resolves.toBeUndefined();
    });
  });

  describe('paging', () => {
    it('asks for the page it was given, with the fixed page size', async () => {
      api.answer = () => of(page([doc('a')], 3, 41));

      await store.load(3);

      expect(api.calls).toEqual([{ page: 3, pageSize: PAGE_SIZE }]);
      expect(store.page()).toBe(3);
      expect(store.total()).toBe(41);
      expect(store.pageCount()).toBe(3);
    });

    it('refresh reads the page it is on', async () => {
      api.answer = (n) => of(page([doc('a')], n, 60));
      await store.load(2);

      await store.refresh();

      expect(api.calls.map((call) => call.page)).toEqual([2, 2]);
    });

    it('steps back to the last page when the page it asked for is past the end', async () => {
      // 41 documents are 3 pages; page 4 is empty.
      api.answer = (n) => (n === 4 ? of(page([], 4, 41)) : of(page([doc('x')], n, 41)));

      await store.load(4);

      expect(api.calls.map((call) => call.page)).toEqual([4, 3]);
      expect(store.items().map((d) => d.id)).toEqual(['x']);
      expect(store.page()).toBe(3);
    });

    it('does not loop when the server keeps answering an empty page', async () => {
      api.answer = (n) => of(page([], n, 41));

      await store.load(3);

      expect(api.calls).toHaveLength(1);
    });

    it('has one page for an empty list, not zero', () => {
      expect(store.pageCount()).toBe(1);
    });
  });

  describe('forget', () => {
    it('removes a document from what is held and lowers the total', async () => {
      api.answer = () => of(page([doc('a'), doc('b')], 1, 2));
      await store.load();

      store.forget('a');

      expect(store.items().map((d) => d.id)).toEqual(['b']);
      expect(store.total()).toBe(1);
    });

    it('does nothing for a document it does not hold', async () => {
      api.answer = () => of(page([doc('a')], 1, 5));
      await store.load();

      store.forget('zzz');

      expect(store.total()).toBe(5);
    });
  });

  describe('another user in the same tab', () => {
    it("shows none of the previous user's rows, even before the new answer arrives", async () => {
      api.answer = () => of(page([doc('sara-1'), doc('sara-2')]));
      await store.load();
      expect(store.items()).toHaveLength(2);

      auth.user.set(user('omar'));

      // Synchronously, before any effect ran and before omar's request exists.
      expect(store.items()).toEqual([]);
      expect(store.total()).toBe(0);
      expect(store.view()).toBe('loading');
    });

    it("forgets the previous user's rows in memory too", async () => {
      api.answer = () => of(page([doc('sara-1')]));
      await store.load();

      auth.user.set(user('omar'));
      flush();
      auth.user.set(user('sara'));

      expect(store.items()).toEqual([]);
    });

    it("drops a late answer to the previous user's request", async () => {
      const slow = new Subject<DocumentPage>();
      api.answer = () => slow;
      const pending = store.load();

      auth.user.set(user('omar'));
      slow.next(page([doc('sara-late')]));
      slow.complete();
      await pending;

      expect(store.items()).toEqual([]);
      expect(store.view()).toBe('loading');
    });

    it("loads the new user's own rows", async () => {
      api.answer = () => of(page([doc('sara-1')]));
      await store.load();
      auth.user.set(user('omar'));
      api.answer = () => of(page([doc('omar-1')]));

      await store.load();

      expect(store.items().map((d) => d.id)).toEqual(['omar-1']);
    });

    it('starts again from page 1 for the new user', async () => {
      api.answer = (n) => of(page([doc('s')], n, 60));
      await store.load(3);

      auth.user.set(user('omar'));

      expect(store.page()).toBe(1);
    });

    it("asks for page 1, not the old user's page, when the new user opens the list", async () => {
      api.answer = (n) => of(page([doc('s')], n, 60));
      await store.load(3);
      auth.user.set(user('omar'));

      await store.load();

      expect(api.calls.map((call) => call.page)).toEqual([3, 1]);
    });
  });

  describe('a stale answer for the same user', () => {
    it('the latest request wins when answers arrive out of order', async () => {
      const first = new Subject<DocumentPage>();
      const second = new Subject<DocumentPage>();
      const answers = [first, second];
      api.answer = () => answers.shift()!;

      const a = store.load(1);
      const b = store.load(2);
      second.next(page([doc('page-2')], 2, 40));
      second.complete();
      await b;
      first.next(page([doc('page-1')], 1, 40));
      first.complete();
      await a;

      expect(store.items().map((d) => d.id)).toEqual(['page-2']);
      expect(store.page()).toBe(2);
    });
  });

  describe('nobody signed in', () => {
    it('does not call the API', async () => {
      auth.user.set(null);

      await store.load();

      expect(api.calls).toEqual([]);
    });
  });
});
