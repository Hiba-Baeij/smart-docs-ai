import { HttpClient, HttpEvent } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { DocumentDetail, DocumentPage, DocumentSummary } from '@smartdocs/contracts';
import { Observable } from 'rxjs';
import { API_BASE_URL } from '../../core/config/api-base';

/**
 * The only place that knows the documents endpoints. Types come from `packages/contracts`, so an
 * API change is a compile error here, not a surprise in a template.
 */
@Injectable({ providedIn: 'root' })
export class DocumentsApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  /** The caller's documents, newest first. Never another user's: the API scopes by session. */
  list(page = 1, pageSize = 20): Observable<DocumentPage> {
    return this.http.get<DocumentPage>(`${this.base}/documents`, { params: { page, pageSize } });
  }

  /** 200, or 404 `DOCUMENT_NOT_FOUND` (also for a document that belongs to someone else). */
  detail(id: string): Observable<DocumentDetail> {
    return this.http.get<DocumentDetail>(`${this.base}/documents/${encodeURIComponent(id)}`);
  }

  /** 204, or 404 when it is already gone. */
  remove(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/documents/${encodeURIComponent(id)}`);
  }

  /**
   * Streams events, not just the body: `UploadProgress` while the bytes go up, then one
   * `Response` once the server has finished extracting. The two are different waits and the UI
   * tells them apart.
   */
  upload(file: File): Observable<HttpEvent<DocumentSummary>> {
    const body = new FormData();
    body.append('file', file);
    return this.http.post<DocumentSummary>(`${this.base}/documents/upload`, body, {
      reportProgress: true,
      observe: 'events',
    });
  }
}
