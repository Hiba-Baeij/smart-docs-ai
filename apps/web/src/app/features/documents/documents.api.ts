import { HttpEvent } from '@angular/common/http';
import { Injectable } from '@angular/core';
import type { DocumentDetail, DocumentStatus, DocumentSummary } from '@smartdocs/contracts';
import { Observable } from 'rxjs';
import { skipGlobalLoading } from '../../core/http/http-context';
import { ResourceApi } from '../../shared/data/resource-api';

/** The filters `GET /api/documents` accepts. */
export interface DocumentFilters {
  status?: DocumentStatus;
}

/**
 * The only place that knows the documents endpoints. `list`, `detail` and `remove` come from
 * `ResourceApi`:
 *  - `list`: the caller's documents, newest first. Never another user's: the API scopes by session.
 *  - `detail`: 200, or 404 `DOCUMENT_NOT_FOUND` (also for a document that belongs to someone else).
 *  - `remove`: 204, or 404 when it is already gone.
 * Types come from `packages/contracts`, so an API change is a compile error here.
 */
@Injectable({ providedIn: 'root' })
export class DocumentsApi extends ResourceApi<DocumentSummary, DocumentDetail, DocumentFilters> {
  protected readonly path = 'documents';

  /**
   * Streams events, not just the body: `UploadProgress` while the bytes go up, then one
   * `Response` once the server has finished extracting. The two are different waits and the UI
   * tells them apart. It shows its own percentage, so it stays out of the global progress bar.
   */
  upload(file: File): Observable<HttpEvent<DocumentSummary>> {
    const body = new FormData();
    body.append('file', file);
    return this.http.post<DocumentSummary>(`${this.url}/upload`, body, {
      reportProgress: true,
      observe: 'events',
      context: skipGlobalLoading(),
    });
  }
}
