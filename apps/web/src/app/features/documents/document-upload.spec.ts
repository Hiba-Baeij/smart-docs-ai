import { HttpErrorResponse, HttpEvent, HttpEventType, HttpResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { DocumentSummary } from '@smartdocs/contracts';
import { Observable, Subject } from 'rxjs';
import { toastState } from 'ngx-sonner';
import { DocumentUpload } from './document-upload';
import { DocumentsApi } from './documents.api';

const SUMMARY: DocumentSummary = {
  id: 'd1',
  originalName: 'terms.pdf',
  fileType: 'pdf',
  status: 'COMPLETED',
  errorCode: null,
  chunkCount: 3,
  createdAt: '2026-10-31T00:00:00.000Z',
};

/** Stands in for the HTTP layer: every upload is a Subject the test drives event by event. */
class FakeDocumentsApi {
  uploads: { file: File; events: Subject<HttpEvent<DocumentSummary>> }[] = [];

  upload(file: File): Observable<HttpEvent<DocumentSummary>> {
    const events = new Subject<HttpEvent<DocumentSummary>>();
    this.uploads.push({ file, events });
    return events;
  }
}

const progress = (loaded: number, total: number): HttpEvent<DocumentSummary> => ({
  type: HttpEventType.UploadProgress,
  loaded,
  total,
});

const response = () => new HttpResponse<DocumentSummary>({ body: SUMMARY, status: 201 });

const apiError = (status: number, code: string, details?: Record<string, string[]>) =>
  new HttpErrorResponse({
    status,
    error: { code, message: 'server wording', details: details ?? null, requestId: 'req-9' },
  });

describe('DocumentUpload', () => {
  let api: FakeDocumentsApi;
  let fixture: ComponentFixture<DocumentUpload>;
  let settled: number;

  beforeEach(() => {
    toastState.reset();
    api = new FakeDocumentsApi();
    TestBed.configureTestingModule({ providers: [{ provide: DocumentsApi, useValue: api }] });
    fixture = TestBed.createComponent(DocumentUpload);
    settled = 0;
    fixture.componentInstance.settled.subscribe(() => settled++);
    fixture.detectChanges();
  });
  afterEach(() => toastState.reset());

  const root = () => fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement>(selector: string) => root().querySelector<T>(selector);
  const input = () => q<HTMLInputElement>('input[type="file"]')!;
  const text = () => root().textContent?.replace(/\s+/g, ' ') ?? '';
  const detect = () => fixture.detectChanges();

  /** Picks a file the way the browser would: the input holds it and fires `change`. */
  function choose(name = 'terms.pdf'): File {
    const file = new File(['x'], name);
    Object.defineProperty(input(), 'files', { configurable: true, value: [file] });
    input().dispatchEvent(new Event('change'));
    detect();
    return file;
  }

  const current = () => api.uploads[api.uploads.length - 1].events;

  describe('before anything is chosen', () => {
    it('rejects an unsupported file locally and keeps the file input usable', () => {
      choose('photo.png');
      expect(api.uploads).toHaveLength(0);
      expect(q('[role="alert"]')?.textContent).toContain('PDF, DOCX or XLSX');
      expect(input().disabled).toBe(false);
    });

    it('accepts a dropped PDF through the same upload path as the file input', () => {
      const file = new File(['x'], 'dropped.pdf');
      const event = new Event('drop', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'dataTransfer', { value: { files: [file] } });
      q('.upload')!.dispatchEvent(event);
      detect();
      expect(api.uploads[0].file).toBe(file);
      expect(event.defaultPrevented).toBe(true);
      expect(input()).not.toBeNull();
    });
    it('offers the file input, limited to the three formats, with a label', () => {
      expect(input().accept).toBe('.pdf,.docx,.xlsx');
      expect(q('label[for="document-file"]')).not.toBeNull();
      expect(input().disabled).toBe(false);
      expect(q('progress')).toBeNull();
      expect(q('[role="alert"]')).toBeNull();
    });

    it('does nothing when the dialog was closed without a file', () => {
      Object.defineProperty(input(), 'files', { configurable: true, value: [] });
      input().dispatchEvent(new Event('change'));

      expect(api.uploads).toHaveLength(0);
    });
  });

  describe('while the bytes are going up', () => {
    it('sends the chosen file once and disables the input', () => {
      const file = choose();

      expect(api.uploads).toHaveLength(1);
      expect(api.uploads[0].file).toBe(file);
      expect(input().disabled).toBe(true);
    });

    it('shows the percentage and a progress bar, from synthetic events', () => {
      choose('terms.pdf');

      current().next(progress(25, 100));
      detect();
      expect(text()).toContain('Uploading terms.pdf… 25%');
      expect(q<HTMLProgressElement>('progress')!.value).toBe(25);

      current().next(progress(80, 100));
      detect();
      expect(q<HTMLProgressElement>('progress')!.value).toBe(80);
    });

    it('updates the one upload toast with the percentage in 10% steps, then says it is processing', () => {
      const toast = () => toastState.toasts().filter((item) => item.id === 'document-upload');
      choose('terms.pdf');

      current().next(progress(23, 100));
      expect(toast()[0].title).toBe('Uploading terms.pdf… 23%');
      current().next(progress(27, 100)); // same 10% step: no new text
      expect(toast()[0].title).toBe('Uploading terms.pdf… 23%');
      current().next(progress(100, 100));

      expect(toast()).toHaveLength(1);
      expect(toast()[0].title).toBe('Processing terms.pdf…');
      expect(toast()[0].type).toBe('loading');
    });

    it('ignores a second file chosen while one is still being sent', () => {
      choose('first.pdf');

      choose('second.pdf');

      expect(api.uploads).toHaveLength(1);
    });
  });

  describe('once every byte arrived and the server is reading the file', () => {
    it('says it is processing, which is a different wait from uploading', () => {
      choose('terms.pdf');

      current().next(progress(100, 100));
      detect();

      expect(text()).toContain('Processing terms.pdf');
      expect(q('progress')).toBeNull();
      expect(input().disabled).toBe(true);
    });
  });

  describe('when the server answers', () => {
    it('turns the upload toast from loading to success without stacking a second toast', () => {
      choose('terms.pdf');
      expect(toastState.toasts().find((item) => item.id === 'document-upload')?.type).toBe('loading');
      current().next(response());
      expect(toastState.toasts().filter((item) => item.id === 'document-upload')).toHaveLength(1);
      expect(toastState.toasts().find((item) => item.id === 'document-upload')?.type).toBe('success');
    });
    it('announces success, re-enables the input, clears it and reports that it settled', () => {
      choose('terms.pdf');
      const valueSetter = vi.spyOn(input(), 'value', 'set');

      current().next(progress(100, 100));
      current().next(response());
      detect();

      expect(text()).toContain('terms.pdf was uploaded.');
      expect(q('[role="status"]')?.getAttribute('aria-live')).toBe('polite');
      expect(input().disabled).toBe(false);
      expect(valueSetter).toHaveBeenCalledWith('');
      expect(settled).toBe(1);
    });

    it('allows the next upload after a success', () => {
      choose('one.pdf');
      current().next(response());
      detect();

      choose('two.pdf');

      expect(api.uploads).toHaveLength(2);
      expect(text()).not.toContain('one.pdf was uploaded');
    });
  });

  describe('when it fails, the person is told what is wrong with the file', () => {
    it.each([
      [413, 'FILE_TOO_LARGE', /too large/],
      [415, 'UNSUPPORTED_FILE_TYPE', /PDF, DOCX or XLSX/],
      [422, 'EMPTY_EXTRACTION', /scanned PDF/],
      [422, 'EXTRACTION_FAILED', /corrupted/],
      [504, 'PROCESSING_TIMEOUT', /too long/],
      [429, 'RATE_LIMITED', /Too many/],
      [500, 'INTERNAL', /our side/],
    ])('%s %s', (status, code, expected) => {
      choose('broken.pdf');

      current().error(apiError(status, code));
      detect();

      const alert = q('[role="alert"]')!;
      expect(alert.textContent).toContain('broken.pdf was not uploaded.');
      expect(alert.textContent).toMatch(expected);
      expect(alert.textContent).not.toContain('server wording');
    });

    it('names the rule for an empty file, which the API puts in the details', () => {
      choose('empty.pdf');

      current().error(apiError(422, 'VALIDATION_FAILED', { file: ['The file is empty.'] }));
      detect();

      expect(q('[role="alert"]')!.textContent).toContain('The file is empty.');
    });

    it('says the server cannot be reached when there was no answer at all', () => {
      choose('a.pdf');

      current().error(new HttpErrorResponse({ status: 0 }));
      detect();

      expect(q('[role="alert"]')!.textContent).toContain('Cannot reach the server');
    });

    it('shows the support reference the API sent', () => {
      choose('a.pdf');

      current().error(apiError(500, 'INTERNAL'));
      detect();

      expect(q('.reference')!.textContent).toContain('req-9');
    });

    it('gives each kind of failure a different message', () => {
      const messages = new Set<string>();
      for (const [status, code] of [
        [413, 'FILE_TOO_LARGE'],
        [415, 'UNSUPPORTED_FILE_TYPE'],
        [422, 'EMPTY_EXTRACTION'],
        [422, 'EXTRACTION_FAILED'],
      ] as const) {
        choose('f.pdf');
        current().error(apiError(status, code));
        detect();
        messages.add(q('.reason')!.textContent!);
      }

      expect(messages.size).toBe(4);
    });

    it('re-enables the input, clears it and reports that it settled: a failed upload may have left a row', () => {
      choose('a.pdf');
      const valueSetter = vi.spyOn(input(), 'value', 'set');

      current().error(apiError(422, 'EMPTY_EXTRACTION'));
      detect();

      expect(input().disabled).toBe(false);
      expect(valueSetter).toHaveBeenCalledWith('');
      expect(settled).toBe(1);
    });

    it('clears the old error when the next upload starts', () => {
      choose('a.pdf');
      current().error(apiError(415, 'UNSUPPORTED_FILE_TYPE'));
      detect();

      choose('b.pdf');

      expect(q('[role="alert"]')).toBeNull();
    });
  });

  describe('when the page is left mid-upload', () => {
    it('stops listening, so nothing is written to a destroyed component', () => {
      choose();
      const events = current();
      expect(events.observed).toBe(true);

      fixture.destroy();

      expect(events.observed).toBe(false);
    });
  });
});
