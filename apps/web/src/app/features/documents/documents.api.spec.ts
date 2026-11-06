import { HttpEventType, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { DocumentDetail, DocumentPage, DocumentSummary } from '@smartdocs/contracts';
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

describe('DocumentsApi', () => {
  let api: DocumentsApi;
  let backend: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(DocumentsApi);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  it('list asks for the page and the page size, and returns the page', () => {
    let result: DocumentPage | undefined;
    const page: DocumentPage = { items: [SUMMARY], page: 2, pageSize: 10, total: 11 };

    api.list(2, 10).subscribe((value) => (result = value));
    const request = backend.expectOne('/api/documents?page=2&pageSize=10');
    request.flush(page);

    expect(request.request.method).toBe('GET');
    expect(result).toEqual(page);
  });

  it('list defaults to the first page of 20', () => {
    api.list().subscribe();

    backend.expectOne('/api/documents?page=1&pageSize=20').flush({ items: [] });
  });

  it('detail gets /api/documents/:id', () => {
    let result: DocumentDetail | undefined;
    const detail: DocumentDetail = { ...SUMMARY, extractedText: 'text', chunks: [] };

    api.detail('d1').subscribe((value) => (result = value));
    const request = backend.expectOne('/api/documents/d1');
    request.flush(detail);

    expect(request.request.method).toBe('GET');
    expect(result).toEqual(detail);
  });

  it('puts an id into the path escaped, so it cannot add path segments or a query', () => {
    api.detail('a/b?x=1').subscribe();

    backend.expectOne('/api/documents/a%2Fb%3Fx%3D1').flush({});
  });

  it('remove sends DELETE to /api/documents/:id', () => {
    let done = false;

    api.remove('d1').subscribe(() => (done = true));
    const request = backend.expectOne('/api/documents/d1');
    request.flush(null, { status: 204, statusText: 'No Content' });

    expect(request.request.method).toBe('DELETE');
    expect(done).toBe(true);
  });

  it('upload posts the file as multipart field "file" and reports progress and the response', () => {
    const file = new File(['%PDF-1.4'], 'terms.pdf', { type: 'application/pdf' });
    const events: HttpEventType[] = [];
    let summary: DocumentSummary | null = null;

    api.upload(file).subscribe((event) => {
      events.push(event.type);
      if (event.type === HttpEventType.Response) {
        summary = event.body;
      }
    });
    const request = backend.expectOne('/api/documents/upload');
    request.event({ type: HttpEventType.UploadProgress, loaded: 4, total: 8 });
    request.flush(SUMMARY);

    expect(request.request.method).toBe('POST');
    expect(request.request.reportProgress).toBe(true);
    const body = request.request.body as FormData;
    expect(body.get('file')).toBeInstanceOf(File);
    expect((body.get('file') as File).name).toBe('terms.pdf');
    expect(events).toContain(HttpEventType.UploadProgress);
    expect(events).toContain(HttpEventType.Response);
    expect(summary).toEqual(SUMMARY);
  });
});
