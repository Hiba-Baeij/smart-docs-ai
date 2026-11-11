import { Injectable, inject } from '@angular/core';
import type { DocumentSummary } from '@smartdocs/contracts';
import { PaginatedStore } from '../../shared/data/paginated-store';
import type { ListQuery, RequestOptions } from '../../shared/data/types';
import { DocumentsApi, type DocumentFilters } from './documents.api';

export type { ListStatus, ListView } from '../../shared/data/types';

export const PAGE_SIZE = 20;

/**
 * The signed-in user's document list. Paging, races, the four views, and keeping one user's rows
 * from another all come from `PaginatedStore`.
 */
@Injectable({ providedIn: 'root' })
export class DocumentsStore extends PaginatedStore<DocumentSummary, DocumentFilters> {
  private readonly api = inject(DocumentsApi);

  constructor() {
    super({ pageSize: PAGE_SIZE });
  }

  protected fetch(query: ListQuery<DocumentFilters>, options: RequestOptions) {
    return this.api.list(query, options);
  }

  protected idOf(document: DocumentSummary): string {
    return document.id;
  }
}
