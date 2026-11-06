import { HttpErrorResponse } from '@angular/common/http';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import type { DocumentDetail as DocumentDetailData } from '@smartdocs/contracts';
import { LocaleService } from '../../core/i18n/locale.service';
import { Observable, Subject, of, throwError } from 'rxjs';
import { STALLED_AFTER_MS } from './document-state';
import { DocumentDetail, TEXT_PREVIEW_CHARACTERS } from './document-detail';
import { DocumentsApi } from './documents.api';
import { DocumentsStore } from './documents.store';

const detail = (over: Partial<DocumentDetailData> = {}): DocumentDetailData => ({
  id: 'd1',
  originalName: 'handbook.pdf',
  fileType: 'pdf',
  status: 'COMPLETED',
  errorCode: null,
  chunkCount: 2,
  createdAt: new Date().toISOString(),
  extractedText: 'The extracted text of the handbook.',
  chunks: [
    { chunkIndex: 0, pageNumber: 1, sheetName: null, preview: 'First chunk starts here' },
    { chunkIndex: 1, pageNumber: null, sheetName: 'Q3 Budget', preview: 'Second chunk' },
  ],
  ...over,
});

const notFound = () =>
  new HttpErrorResponse({
    status: 404,
    error: { code: 'DOCUMENT_NOT_FOUND', message: 'Document not found.' },
  });

@Component({ template: '<h1>the list</h1>' })
class ListStub {}

class FakeDocumentsApi {
  detailCalls: string[] = [];
  removeCalls: string[] = [];
  detailAnswer: (id: string) => Observable<DocumentDetailData> = () => of(detail());
  removeAnswer: () => Observable<void> = () => of(undefined);

  detail(id: string): Observable<DocumentDetailData> {
    this.detailCalls.push(id);
    return this.detailAnswer(id);
  }
  remove(id: string): Observable<void> {
    this.removeCalls.push(id);
    return this.removeAnswer();
  }
}

class FakeDocumentsStore {
  forgotten: string[] = [];
  forget(id: string): void {
    this.forgotten.push(id);
  }
}

describe('DocumentDetail', () => {
  let api: FakeDocumentsApi;
  let store: FakeDocumentsStore;
  let harness: RouterTestingHarness;

  beforeEach(() => {
    api = new FakeDocumentsApi();
    store = new FakeDocumentsStore();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'documents', component: ListStub },
          { path: 'documents/:id', component: DocumentDetail },
        ]),
        { provide: DocumentsApi, useValue: api },
        { provide: DocumentsStore, useValue: store },
      ],
    });
    TestBed.inject(LocaleService).set('en');
  });

  const root = () => harness.routeNativeElement as HTMLElement;
  const q = <T extends HTMLElement>(selector: string) => root().querySelector<T>(selector);
  const text = () => root().textContent?.replace(/\s+/g, ' ') ?? '';
  const url = () => TestBed.inject(Router).url;

  async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve));
    await harness.fixture.whenStable();
    harness.detectChanges();
  }

  async function open(id = 'd1'): Promise<void> {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(`/documents/${id}`, DocumentDetail);
    await settle();
  }

  const button = (label: RegExp) =>
    Array.from(root().querySelectorAll<HTMLButtonElement>('button')).find((b) =>
      label.test(b.textContent ?? ''),
    )!;

  describe('the four states', () => {
    it('loading: says so while the document is being fetched', async () => {
      api.detailAnswer = () => new Subject<DocumentDetailData>();
      harness = await RouterTestingHarness.create();

      await harness.navigateByUrl('/documents/d1', DocumentDetail);
      harness.detectChanges();

      expect(q('.loading')?.textContent).toContain('Loading');
      expect(q('h1')).toBeNull();
    });

    it('loaded: shows the document', async () => {
      await open();

      expect(q('h1')!.textContent).toBe('handbook.pdf');
      expect(api.detailCalls).toEqual(['d1']);
    });

    it('not found: a calm screen, not an error banner, for a missing or foreign document', async () => {
      api.detailAnswer = () => throwError(() => notFound());

      await open();

      expect(text()).toContain('does not exist, or it is not yours');
      expect(q('app-error-banner')).toBeNull();
      expect(q('h1')).toBeNull();
    });

    it('error: a banner with a retry for any other failure, and the retry works', async () => {
      api.detailAnswer = () => throwError(() => new HttpErrorResponse({ status: 0 }));
      await open();
      expect(q('app-error-banner')?.textContent).toContain('Cannot reach the server');

      api.detailAnswer = () => of(detail());
      q<HTMLButtonElement>('app-error-banner button')!.click();
      await settle();

      expect(q('app-error-banner')).toBeNull();
      expect(q('h1')!.textContent).toBe('handbook.pdf');
    });
  });

  describe('a loaded document', () => {
    it('updates detail labels and the delete confirmation when Arabic is selected', async () => {
      await open();
      const locale = TestBed.inject(LocaleService);
      locale.set('ar');
      harness.detectChanges();

      expect(text()).toContain('النص المستخرج');
      expect(text()).toContain('تاريخ الرفع');
      button(/حذف هذا المستند/).click();
      harness.detectChanges();
      expect(q('[role="alertdialog"]')?.textContent).toContain('لا يمكن التراجع');
      locale.set('en');
    });
    it('shows its facts', async () => {
      await open();

      expect(text()).toContain('PDF');
      expect(text()).toContain('Ready');
      expect(q('.facts')!.textContent).toContain('2');
    });

    it('shows the extracted text as text, never as markup', async () => {
      api.detailAnswer = () =>
        of(detail({ extractedText: '<script>alert(1)</script> <b>bold?</b>' }));

      await open();

      expect(q('pre.text')!.textContent).toBe('<script>alert(1)</script> <b>bold?</b>');
      expect(q('pre.text b')).toBeNull();
      expect(q('pre.text script')).toBeNull();
    });

    it('shows a long text cut, and all of it on request', async () => {
      const long = 'x'.repeat(TEXT_PREVIEW_CHARACTERS + 500);
      api.detailAnswer = () => of(detail({ extractedText: long }));
      await open();

      expect(q('pre.text')!.textContent).toHaveLength(TEXT_PREVIEW_CHARACTERS);
      expect(button(/Show all/).textContent).toContain(String(long.length));

      button(/Show all/).click();
      harness.detectChanges();
      expect(q('pre.text')!.textContent).toHaveLength(long.length);

      button(/Show less/).click();
      harness.detectChanges();
      expect(q('pre.text')!.textContent).toHaveLength(TEXT_PREVIEW_CHARACTERS);
    });

    it('offers no show-all for a short text', async () => {
      await open();

      expect(root().querySelector('button.link')).toBeNull();
    });

    it('lists the chunks with their page or sheet and how they start', async () => {
      await open();

      const rows = Array.from(root().querySelectorAll('tbody tr'));
      expect(rows).toHaveLength(2);
      expect(rows[0].textContent).toContain('1');
      expect(rows[0].textContent).toContain('Page 1');
      expect(rows[0].textContent).toContain('First chunk starts here');
      expect(rows[1].textContent).toContain('Sheet Q3 Budget');
    });

    it('shows a file name and a chunk preview as text, never as markup', async () => {
      api.detailAnswer = () =>
        of(
          detail({
            originalName: '<img src=x onerror=alert(1)>.pdf',
            chunks: [{ chunkIndex: 0, pageNumber: 1, sheetName: null, preview: '<b>preview</b>' }],
          }),
        );

      await open();

      expect(q('h1')!.textContent).toBe('<img src=x onerror=alert(1)>.pdf');
      expect(root().querySelector('img')).toBeNull();
      expect(q('.preview')!.textContent).toBe('<b>preview</b>');
    });
  });

  describe('a document that is not a success', () => {
    it('failed: says why, and shows no text or chunks to read', async () => {
      api.detailAnswer = () =>
        of(
          detail({
            status: 'FAILED',
            errorCode: 'EMPTY_EXTRACTION',
            extractedText: '',
            chunks: [],
            chunkCount: 0,
          }),
        );

      await open();

      expect(q('.note')!.textContent).toContain('scanned PDF');
      expect(q('pre.text')).toBeNull();
      expect(q('#chunks-heading')).toBeNull();
      expect(button(/Delete this document/)).toBeDefined();
    });

    it('stalled: says the upload did not finish and that delete and re-upload is the way out', async () => {
      const old = new Date(Date.now() - STALLED_AFTER_MS - 60_000).toISOString();
      api.detailAnswer = () =>
        of(
          detail({
            status: 'PROCESSING',
            createdAt: old,
            extractedText: '',
            chunks: [],
            chunkCount: 0,
          }),
        );

      await open();

      expect(text()).toContain('Did not finish');
      expect(q('.note')!.textContent).toMatch(/Delete it and upload the file again/);
    });
  });

  describe('deleting', () => {
    it('moves focus into confirmation and returns it after cancellation', async () => {
      await open();
      button(/Delete this document/).click();
      harness.detectChanges();
      await harness.fixture.whenStable();
      expect(document.activeElement).toBe(button(/Yes, delete it/));
      button(/Cancel/).click();
      harness.detectChanges();
      await harness.fixture.whenStable();
      expect(document.activeElement).toBe(button(/Delete this document/));
    });
    it('asks first, and cancelling deletes nothing', async () => {
      await open();

      button(/Delete this document/).click();
      harness.detectChanges();
      expect(q('[role="alertdialog"]')!.textContent).toContain('This cannot be undone');
      expect(q('[role="alertdialog"]')!.textContent).toContain('handbook.pdf');

      button(/Cancel/).click();
      harness.detectChanges();

      expect(q('[role="alertdialog"]')).toBeNull();
      expect(api.removeCalls).toEqual([]);
    });

    it('says "1 chunk", not "1 chunks"', async () => {
      api.detailAnswer = () => of(detail({ chunkCount: 1 }));
      await open();

      button(/Delete this document/).click();
      harness.detectChanges();

      expect(q('[role="alertdialog"]')!.textContent).toMatch(/its\s+1 chunk\?/);
    });

    it('confirming deletes it, forgets it in the list, and goes back to the list', async () => {
      await open();
      button(/Delete this document/).click();
      harness.detectChanges();

      button(/Yes, delete it/).click();
      await settle();

      expect(api.removeCalls).toEqual(['d1']);
      expect(store.forgotten).toEqual(['d1']);
      expect(url()).toBe('/documents');
    });

    it('disables itself while the delete is in flight, so a double click sends one request', async () => {
      const pending = new Subject<void>();
      api.removeAnswer = () => pending;
      await open();
      button(/Delete this document/).click();
      harness.detectChanges();

      button(/Yes, delete it/).click();
      harness.detectChanges();
      const second = button(/Deleting/);
      second.click();

      expect(second.disabled).toBe(true);
      expect(api.removeCalls).toHaveLength(1);
      pending.next();
      pending.complete();
    });

    it('sends one delete even if the handler runs twice before the first answer (not only a disabled button)', async () => {
      const pending = new Subject<void>();
      api.removeAnswer = () => pending;
      await open();
      const page = harness.routeDebugElement!.componentInstance as {
        confirmDelete: () => Promise<void>;
      };

      void page.confirmDelete();
      void page.confirmDelete();

      expect(api.removeCalls).toHaveLength(1);
      pending.next();
      pending.complete();
    });

    it('shows a failure in words and lets the person try again', async () => {
      api.removeAnswer = () => throwError(() => new HttpErrorResponse({ status: 0 }));
      await open();
      button(/Delete this document/).click();
      harness.detectChanges();

      button(/Yes, delete it/).click();
      await settle();

      expect(q('.failure')!.textContent).toContain('Cannot reach the server');
      expect(url()).toBe('/documents/d1');
      expect(button(/Yes, delete it/).disabled).toBe(false);
      expect(store.forgotten).toEqual([]);
    });

    describe('the document was already deleted somewhere else (the failure drill)', () => {
      beforeEach(async () => {
        api.removeAnswer = () => throwError(() => notFound());
        await open();
        button(/Delete this document/).click();
        harness.detectChanges();
        button(/Yes, delete it/).click();
        await settle();
      });

      it('is not a crash and not an error: the screen says it is already gone', () => {
        expect(text()).toContain('already deleted');
        expect(q('app-error-banner')).toBeNull();
        expect(q('.failure')).toBeNull();
        expect(q('h1')).toBeNull();
      });

      it('drops it from the list too, and offers the way back', () => {
        expect(store.forgotten).toEqual(['d1']);
        expect(q('a.back')!.getAttribute('href')).toBe('/documents');
      });

      it('and a repeat is impossible: there is no delete button left to press', () => {
        expect(root().querySelector('button.delete')).toBeNull();
      });
    });
  });

  describe('moving from one document to another', () => {
    it('loads the new one, because the route parameter is read as a stream', async () => {
      api.detailAnswer = (id) => of(detail({ id, originalName: `${id}.pdf` }));
      await open('first');
      expect(q('h1')!.textContent).toBe('first.pdf');

      await harness.navigateByUrl('/documents/second');
      await settle();

      expect(q('h1')!.textContent).toBe('second.pdf');
      expect(api.detailCalls).toEqual(['first', 'second']);
    });

    it('drops a late answer for the document it has already left', async () => {
      const slow = new Subject<DocumentDetailData>();
      api.detailAnswer = (id) =>
        id === 'slow' ? slow : of(detail({ id, originalName: `${id}.pdf` }));
      harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/documents/slow', DocumentDetail);

      await harness.navigateByUrl('/documents/fast');
      await settle();
      slow.next(detail({ id: 'slow', originalName: 'slow.pdf' }));
      slow.complete();
      await settle();

      expect(q('h1')!.textContent).toBe('fast.pdf');
    });
  });
});
