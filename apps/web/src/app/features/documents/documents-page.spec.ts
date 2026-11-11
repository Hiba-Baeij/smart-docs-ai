import { HttpErrorResponse, HttpEvent } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import type { DocumentPage, DocumentSummary, UserSummary } from '@smartdocs/contracts';
import { Observable, Subject, of, throwError } from 'rxjs';
import { AuthStore } from '../../core/auth/auth.store';
import { LocaleService } from '../../core/i18n/locale.service';
import type { ListQuery, RequestOptions } from '../../shared/data/types';
import { STALLED_AFTER_MS } from './document-state';
import { DocumentsApi } from './documents.api';
import { DocumentsPage, POLL_INTERVAL_MS } from './documents-page';
import { PAGE_SIZE } from './documents.store';

const user = (id: string): UserSummary => ({
  id,
  name: id,
  email: `${id}@example.com`,
  createdAt: '2026-10-31T00:00:00.000Z',
});

const doc = (id: string, over: Partial<DocumentSummary> = {}): DocumentSummary => ({
  id,
  originalName: `${id}.pdf`,
  fileType: 'pdf',
  status: 'COMPLETED',
  errorCode: null,
  chunkCount: 4,
  createdAt: new Date().toISOString(),
  ...over,
});

const page = (items: DocumentSummary[], pageNumber = 1, total = items.length): DocumentPage => ({
  items,
  page: pageNumber,
  pageSize: PAGE_SIZE,
  total,
});

class FakeAuthStore {
  readonly user = signal<UserSummary | null>(user('sara'));
}

class FakeDocumentsApi {
  listCalls: number[] = [];
  answer: (pageNumber: number) => Observable<DocumentPage> = () => of(page([]));

  queries: ListQuery[] = [];

  options: RequestOptions[] = [];

  list(query: ListQuery, options: RequestOptions = {}): Observable<DocumentPage> {
    this.queries.push(query);
    this.options.push(options);
    this.listCalls.push(query.page);
    return this.answer(query.page);
  }
  upload(): Observable<HttpEvent<DocumentSummary>> {
    return new Subject<HttpEvent<DocumentSummary>>();
  }
}

describe('DocumentsPage', () => {
  let api: FakeDocumentsApi;
  let auth: FakeAuthStore;
  let fixture: ComponentFixture<DocumentsPage>;

  beforeEach(() => {
    api = new FakeDocumentsApi();
    auth = new FakeAuthStore();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthStore, useValue: auth },
        { provide: DocumentsApi, useValue: api },
      ],
    });
    TestBed.inject(LocaleService).set('en');
  });

  const root = () => fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement>(selector: string) => root().querySelector<T>(selector);
  const qa = (selector: string) => Array.from(root().querySelectorAll<HTMLElement>(selector));

  async function open(): Promise<void> {
    fixture = TestBed.createComponent(DocumentsPage);
    fixture.detectChanges();
    await settle();
  }

  async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const listText = () => q('section[aria-labelledby="list-heading"]')!.textContent ?? '';

  describe('the four states, in order of precedence', () => {
    it('loading: says so while the request is in flight, and never "no documents"', () => {
      api.answer = () => new Subject<DocumentPage>();
      fixture = TestBed.createComponent(DocumentsPage);

      fixture.detectChanges();

      expect(q('.loading')?.textContent).toContain('Loading');
      expect(listText()).not.toContain('no documents');
      // Skeleton rows hold the table's shape; there are no real rows yet.
      expect(qa('tbody .skeleton-row').length).toBeGreaterThan(0);
      expect(q('tbody .data-row')).toBeNull();
      expect(q('table')!.getAttribute('aria-busy')).toBe('true');
    });

    it('error: shows the banner with a retry, and neither the list nor the empty state', async () => {
      api.answer = () => throwError(() => new HttpErrorResponse({ status: 0 }));

      await open();

      expect(q('app-error-banner [role="alert"]')?.textContent).toContain(
        'Cannot reach the server',
      );
      expect(q('table')).toBeNull();
      expect(q('app-empty-state')).toBeNull();
    });

    it('error: the retry asks again and shows the data when it works', async () => {
      api.answer = () => throwError(() => new HttpErrorResponse({ status: 0 }));
      await open();
      api.answer = () => of(page([doc('a')]));

      q<HTMLButtonElement>('app-error-banner button')!.click();
      await settle();

      expect(api.listCalls).toHaveLength(2);
      expect(q('app-error-banner')).toBeNull();
      expect(qa('tbody tr')).toHaveLength(1);
    });

    it('empty: after an empty answer, says there is nothing yet and points at the upload', async () => {
      api.answer = () => of(page([]));

      await open();

      expect(q('app-empty-state')?.textContent).toContain('no documents yet');
      expect(q('table')).toBeNull();
      expect(q('.loading')).toBeNull();
      // The upload form is still there, so the empty state is a place to start.
      expect(q('input[type="file"]')).not.toBeNull();
    });

    it('data: a table of documents, and no other state', async () => {
      api.answer = () => of(page([doc('a'), doc('b')]));

      await open();

      expect(qa('tbody tr')).toHaveLength(2);
      expect(q('app-empty-state')).toBeNull();
      expect(q('app-error-banner')).toBeNull();
      expect(q('.loading')).toBeNull();
    });
  });

  describe('a row', () => {
    it('shows the name as a link to the document, the type, the date, the badge and the chunks', async () => {
      api.answer = () =>
        of(
          page([
            doc('abc', {
              originalName: 'handbook.docx',
              fileType: 'docx',
              chunkCount: 12,
              createdAt: '2026-10-31T09:30:00.000Z',
            }),
          ]),
        );

      await open();

      const cells = qa('tbody tr td');
      expect(cells[0].querySelector('a')?.getAttribute('href')).toBe('/documents/abc');
      expect(cells[0].textContent).toContain('handbook.docx');
      expect(cells[1].textContent).toContain('DOCX');
      expect(cells[1].querySelector('[aria-hidden="true"]')).not.toBeNull();
      expect(cells[2].textContent).toContain('2026');
      expect(cells[3].textContent?.trim()).toBe('Ready');
      expect(cells[4].textContent?.trim()).toBe('12');
    });

    it('switches the document labels, status and date to Arabic without navigation', async () => {
      api.answer = () => of(page([doc('abc', { createdAt: '2026-10-31T09:30:00.000Z' })]));
      await open();
      const locale = TestBed.inject(LocaleService);
      locale.set('ar');
      fixture.detectChanges();

      expect(q('h1')?.textContent).toBe('المستندات');
      expect(q('tbody app-status-badge')?.textContent).toContain('جاهز');
      expect(q('tbody tr td:nth-child(3)')?.textContent).toContain('2026');
      locale.set('en');
    });

    it('shows a file name as text, never as markup', async () => {
      api.answer = () => of(page([doc('x', { originalName: '<img src=x onerror=alert(1)>.pdf' })]));

      await open();

      expect(q('tbody td a')!.textContent).toBe('<img src=x onerror=alert(1)>.pdf');
      expect(q('tbody img')).toBeNull();
    });

    it('explains a failed document in words, from its error code', async () => {
      api.answer = () =>
        of(page([doc('f', { status: 'FAILED', errorCode: 'EMPTY_EXTRACTION', chunkCount: 0 })]));

      await open();

      expect(q('tbody tr')!.textContent).toContain('Failed');
      expect(q('tbody .note')!.textContent).toContain('scanned PDF');
    });

    it('says a recent PROCESSING document is processing, with nothing to alarm anyone', async () => {
      api.answer = () => of(page([doc('p', { status: 'PROCESSING', chunkCount: 0 })]));

      await open();

      expect(q('tbody app-status-badge')!.textContent?.trim()).toBe('Processing');
      expect(q('tbody .note')).toBeNull();
    });

    it('says an old PROCESSING document did not finish, and what to do about it', async () => {
      const old = new Date(Date.now() - STALLED_AFTER_MS - 60_000).toISOString();
      api.answer = () =>
        of(page([doc('s', { status: 'PROCESSING', chunkCount: 0, createdAt: old })]));

      await open();

      expect(q('tbody app-status-badge')!.textContent?.trim()).toBe('Did not finish');
      expect(q('tbody .note')!.textContent).toMatch(/Delete it and upload the file again/);
    });
  });

  describe('paging (app-data-table)', () => {
    const range = () => q('.mat-mdc-paginator-range-label')?.textContent?.trim();
    const next = () => q<HTMLButtonElement>('.mat-mdc-paginator-navigation-next')!;
    const previous = () => q<HTMLButtonElement>('.mat-mdc-paginator-navigation-previous')!;
    /** Material keeps a disabled paginator button focusable and marks it with aria-disabled. */
    const disabled = (button: HTMLButtonElement) =>
      button.disabled || button.getAttribute('aria-disabled') === 'true';

    it('has no paginator for a single page', async () => {
      api.answer = () => of(page([doc('a')]));

      await open();

      expect(q('mat-paginator')).toBeNull();
    });

    it('shows where you are, and disables Previous on the first page', async () => {
      api.answer = () => of(page([doc('a')], 1, 45));

      await open();

      expect(range()).toBe('1–20 of 45');
      expect(disabled(previous())).toBe(true);
      expect(disabled(next())).toBe(false);
    });

    it('Next and Previous ask the API for the neighbouring page', async () => {
      api.answer = (n) => of(page([doc(`p${n}`)], n, 45));
      await open();

      next().click();
      await settle();
      expect(range()).toBe('21–40 of 45');

      previous().click();
      await settle();
      expect(api.listCalls).toEqual([1, 2, 1]);
    });

    it('disables Next on the last page', async () => {
      api.answer = (n) => of(page([doc('z')], n, 45));
      await open();
      next().click();
      await settle();
      next().click();
      await settle();

      expect(disabled(next())).toBe(true);
    });

    it('a new page size starts again at page 1 with that size', async () => {
      api.answer = (n) => of(page([doc(`p${n}`)], n, 45));
      await open();
      next().click();
      await settle();

      (
        fixture.debugElement.query((d) => d.name === 'app-data-table').componentInstance as {
          pageSizeChange: { emit: (size: number) => void };
        }
      ).pageSizeChange.emit(50);
      await settle();

      expect(api.queries.at(-1)).toMatchObject({ page: 1, pageSize: 50 });
    });
  });

  describe('row actions', () => {
    it('offers Open and Delete for each row, named after the document', async () => {
      api.answer = () => of(page([doc('report')]));
      await open();

      const trigger = q<HTMLButtonElement>('td.actions-col button')!;
      expect(trigger.getAttribute('aria-label')).toBe('Actions for report.pdf');
      trigger.click();
      await settle();

      const items = Array.from(document.querySelectorAll('.app-menu-panel [mat-menu-item]')).map((item) =>
        item.textContent?.trim(),
      );
      expect(items).toEqual(['Open', 'Delete this document']);
    });
  });

  describe('after an upload ends', () => {
    it('reads the first page again, where the newest document is', async () => {
      api.answer = (n) => of(page([doc(`p${n}`)], n, 45));
      await open();
      q<HTMLButtonElement>('.mat-mdc-paginator-navigation-next')!.click();
      await settle();
      expect(api.listCalls).toEqual([1, 2]);

      // The upload child announces that it settled.
      (
        fixture.debugElement.query((d) => d.name === 'app-document-upload').componentInstance as {
          settled: { emit: () => void };
        }
      ).settled.emit();
      await settle();

      expect(api.listCalls).toEqual([1, 2, 1]);
    });
  });

  describe('the status filter', () => {
    const chip = (label: string) => qa('app-filter-chips button').find((b) => b.textContent!.trim() === label)!;

    it('offers All and each status, with All selected by default', async () => {
      await open();

      expect(qa('app-filter-chips button').map((b) => b.textContent!.trim())).toEqual([
        'All',
        'Processing',
        'Ready',
        'Failed',
      ]);
      expect(q('app-filter-chips')!.getAttribute('aria-label')).toBe('Filter by status');
      expect(chip('All').getAttribute('aria-pressed')).toBe('true');
    });

    it('asks the API for that status only, from page 1, and marks the chip', async () => {
      api.answer = (n) => of(page([doc(`p${n}`)], n, 45));
      await open();
      q<HTMLButtonElement>('.mat-mdc-paginator-navigation-next')!.click();
      await settle();

      chip('Failed').click();
      await settle();

      expect(api.queries.at(-1)).toMatchObject({ page: 1, filters: { status: 'FAILED' } });
      expect(chip('Failed').getAttribute('aria-pressed')).toBe('true');
      expect(TestBed.inject(Router).url).toBe('/?status=FAILED');
    });

    it('says when nothing has that status, and offers the way back to all documents', async () => {
      await open();
      chip('Failed').click();
      await settle();

      expect(listText()).toContain('No documents with this status.');
      qa('app-empty-state button')[0].click();
      await settle();

      expect(api.queries.at(-1)!.filters).toEqual({ status: undefined });
      expect(listText()).toContain('You have no documents yet');
    });
  });

  describe('while a document is processing', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    async function openWithFakeTime(): Promise<void> {
      fixture = TestBed.createComponent(DocumentsPage);
      fixture.detectChanges();
      await vi.advanceTimersByTimeAsync(0);
      fixture.detectChanges();
    }

    it('reads the list again in the background until it is done, then stops', async () => {
      let status: DocumentSummary['status'] = 'PROCESSING';
      api.answer = () => of(page([doc('fresh', { status })]));
      await openWithFakeTime();
      expect(api.options).toEqual([{}]);

      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
      fixture.detectChanges();
      expect(api.options).toEqual([{}, { background: true }]);
      // A background read keeps the rows: no skeleton, no dimming.
      expect(q('tbody .data-row')).not.toBeNull();

      status = 'COMPLETED';
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
      fixture.detectChanges();
      expect(q('app-status-badge')!.textContent!.trim()).toBe('Ready');

      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 3);
      expect(api.options).toHaveLength(3);
    });

    it('does not poll for a list with nothing processing, or a stalled upload that will never finish', async () => {
      api.answer = () =>
        of(
          page([
            doc('ready'),
            doc('stuck', { status: 'PROCESSING', createdAt: new Date(Date.now() - STALLED_AFTER_MS - 1).toISOString() }),
          ]),
        );
      await openWithFakeTime();

      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 3);

      expect(api.options).toHaveLength(1);
    });
  });

  describe('another user in the same tab', () => {
    it('shows none of the previous user\'s documents, and loading, not "none yet"', async () => {
      api.answer = () => of(page([doc('sara-private')]));
      await open();
      expect(listText()).toContain('sara-private');

      api.answer = () => new Subject<DocumentPage>();
      auth.user.set(user('omar'));
      fixture.detectChanges();

      expect(listText()).not.toContain('sara-private');
      expect(q('.loading')).not.toBeNull();
      expect(listText()).not.toContain('no documents');
    });
  });
});
