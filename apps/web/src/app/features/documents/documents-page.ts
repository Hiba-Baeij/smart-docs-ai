import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { LucideEye, LucideTrash2 } from '@lucide/angular';
import { LocaleService } from '../../core/i18n/locale.service';
import { bindListToUrl } from '../../shared/data/list-url-state';
import { pollWhile } from '../../shared/data/poll-while';
import { CellDef, type ColumnDef, DataTable, type RowAction, TableEmpty } from '../../shared/data-table';
import { type ChipOption, EmptyState, FileIcon, FilterChips, PageHeader } from '@shared/ui';
import { createDeleteDocument } from './delete-document';
import { StatusBadge } from './document-status-badge';
import { DocumentUpload } from './document-upload';
import { type DocumentState, documentState, failedDocumentMessage, STALLED_MESSAGE } from './document-state';
import { DocumentsStore } from './documents.store';
import type { DocumentStatus, DocumentSummary } from '@smartdocs/contracts';

/** A list row: the document and what the person should read about it. */
export interface DocumentRow {
  document: DocumentSummary;
  state: DocumentState;
  note: string | null;
}

export const PAGE_SIZES = [10, 20, 50] as const;

const STATUSES: readonly DocumentStatus[] = ['PROCESSING', 'COMPLETED', 'FAILED'];

/** How often the list is read again while a document is still being processed. */
export const POLL_INTERVAL_MS = 5_000;

/**
 * The list of the signed-in user's documents, with the upload form above it. The table, its
 * states (loading, error, empty, data), paging and row actions come from `app-data-table`; the
 * page, page size and filters live in the URL (`bindListToUrl`).
 */
@Component({
  imports: [
    CellDef,
    DataTable,
    DocumentUpload,
    EmptyState,
    FileIcon,
    FilterChips,
    PageHeader,
    RouterLink,
    StatusBadge,
    TableEmpty,
  ],
  selector: 'app-documents-page',
  styleUrl: './documents-page.scss',
  templateUrl: './documents-page.html',
})
export class DocumentsPage {
  protected readonly store = inject(DocumentsStore);
  protected readonly locale = inject(LocaleService);
  private readonly router = inject(Router);

  protected readonly pageSizes = PAGE_SIZES;

  protected readonly list = bindListToUrl(this.store, {
    pageSizes: PAGE_SIZES,
    filters: { status: STATUSES },
  });

  /** Deleting from a row: the same dialog and toasts as the detail page; then the page is refilled. */
  private readonly remove = createDeleteDocument({ onDeleted: () => this.list.refresh() });

  /** Each row with what the person should read about it, derived once per change, not per render. */
  protected readonly rows = computed<DocumentRow[]>(() => {
    const now = this.store.loadedAt();
    return this.store.items().map((document) => {
      const state = documentState(document, now);
      return {
        document,
        state,
        note:
          state === 'failed'
            ? this.locale.t(failedDocumentMessage(document.errorCode))
            : state === 'stalled'
              ? this.locale.t(STALLED_MESSAGE)
              : null,
      };
    });
  });

  protected readonly columns = computed<ColumnDef<DocumentRow>[]>(() => [
    { key: 'name', header: this.locale.t('docs.name'), type: 'custom', primary: true },
    { key: 'type', header: this.locale.t('docs.type'), type: 'custom', width: '7rem' },
    {
      key: 'createdAt',
      header: this.locale.t('docs.uploaded'),
      type: 'date',
      value: (row) => row.document.createdAt,
      width: '12rem',
    },
    { key: 'status', header: this.locale.t('docs.status'), type: 'custom', width: '10rem' },
    {
      key: 'chunkCount',
      header: this.locale.t('docs.chunks'),
      type: 'number',
      value: (row) => row.document.chunkCount,
      width: '6rem',
    },
  ]);

  protected readonly actions = computed<RowAction<DocumentRow>[]>(() => [
    {
      id: 'open',
      label: this.locale.t('docs.open'),
      icon: LucideEye,
      run: (row) => void this.router.navigate(['/documents', row.document.id]),
    },
    {
      id: 'delete',
      label: this.locale.t('docs.detail.deleteAction'),
      icon: LucideTrash2,
      tone: 'danger',
      run: (row) => void this.remove.run(row.document),
    },
  ]);

  /** The status filter, from the URL. */
  protected readonly statusFilter = computed(() => this.store.filters().status ?? null);

  protected readonly statusOptions = computed<ChipOption[]>(() => [
    { value: null, label: this.locale.t('docs.filter.all') },
    { value: 'PROCESSING', label: this.locale.t('docs.state.processing') },
    { value: 'COMPLETED', label: this.locale.t('docs.state.completed') },
    { value: 'FAILED', label: this.locale.t('docs.state.failed') },
  ]);

  /**
   * While a row is still processing (a recent upload, or one from another tab), the list reads
   * itself again in the background until it is done. A stalled row will never finish, so it does
   * not keep the polling alive.
   */
  private readonly hasProcessing = computed(() => this.rows().some((row) => row.state === 'processing'));

  constructor() {
    pollWhile(this.hasProcessing, () => this.store.refresh({ background: true }), POLL_INTERVAL_MS);
  }

  protected setStatus(status: string | null): void {
    void this.list.setFilters({ status: (status as DocumentStatus | null) ?? undefined });
  }

  protected readonly byId = (row: DocumentRow) => row.document.id;
  protected readonly rowName = (row: DocumentRow) => row.document.originalName;

  /** A new upload is the newest document, so it is on the first page. */
  protected onUploadSettled(): void {
    void this.list.goTo(1);
  }

  protected goTo(page: number): void {
    void this.list.goTo(page);
  }
}
