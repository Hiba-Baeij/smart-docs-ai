import { Component, OnInit, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LocaleService } from '../../core/i18n/locale.service';
import { EmptyState } from '../../shared/empty-state';
import { ErrorBanner } from '../../shared/error-banner';
import { StatusBadge } from '../../shared/status-badge';
import { DocumentUpload } from './document-upload';
import { documentState, failedDocumentMessage, STALLED_MESSAGE } from './document-state';
import { DocumentsStore } from './documents.store';

/**
 * The list of the signed-in user's documents, with the upload form above it.
 *
 * It renders exactly four states, in a fixed order of precedence (error, loading, empty, data), so
 * an empty list is never shown while the request is still in flight.
 */
@Component({
  imports: [DocumentUpload, EmptyState, ErrorBanner, RouterLink, StatusBadge],
  selector: 'app-documents-page',
  styleUrl: './documents-page.scss',
  templateUrl: './documents-page.html',
})
export class DocumentsPage implements OnInit {
  protected readonly store = inject(DocumentsStore);
  protected readonly locale = inject(LocaleService);

  protected formatDate(value: string): string {
    return new Intl.DateTimeFormat(this.locale.current(), {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  }

  /** Each row with what the person should read about it, derived once per change, not per render. */
  protected readonly rows = computed(() => {
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

  ngOnInit(): void {
    void this.store.load();
  }

  /** A new upload is the newest document, so it is on the first page. */
  protected onUploadSettled(): void {
    void this.store.load(1);
  }

  protected goTo(page: number): void {
    void this.store.load(page);
  }
}
