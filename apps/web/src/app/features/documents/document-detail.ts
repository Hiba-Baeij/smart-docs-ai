import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { DocumentDetail as DocumentDetailData } from '@smartdocs/contracts';
import { firstValueFrom } from 'rxjs';
import { AppError, toAppError } from '../../core/http/app-error';
import { LocaleService } from '../../core/i18n/locale.service';
import {
  LucideArrowLeft,
  LucideCalendar,
  LucideCaseSensitive,
  LucideFileText,
  LucideLayers,
  LucideTrash2,
  LucideTriangleAlert,
} from '@lucide/angular';
import {
  Card,
  CopyButton,
  EmptyState,
  ErrorBanner,
  FileIcon,
  Menu,
  type MenuItem,
  PageHeader,
  Skeleton,
  StatCard,
  Tab,
  Tabs,
} from '@shared/ui';
import { DocumentChunks } from './document-chunks';
import { DocumentTextViewer } from './document-text-viewer';
import { createDeleteDocument } from './delete-document';
import { StatusBadge } from './document-status-badge';
import { documentState, failedDocumentMessage, STALLED_MESSAGE } from './document-state';
import { DocumentsApi } from './documents.api';

/** What this page is showing. `notFound` is an answer, not a failure: the document is simply not there. */
export type DetailView = 'loading' | 'error' | 'notFound' | 'loaded';

@Component({
  imports: [
    Card,
    CopyButton,
    DocumentChunks,
    DocumentTextViewer,
    EmptyState,
    ErrorBanner,
    FileIcon,
    Menu,
    PageHeader,
    RouterLink,
    Skeleton,
    StatCard,
    StatusBadge,
    Tab,
    Tabs,
    LucideArrowLeft,
    LucideCalendar,
    LucideCaseSensitive,
    LucideFileText,
    LucideLayers,
    LucideTriangleAlert,
  ],
  selector: 'app-document-detail',
  styleUrl: './document-detail.scss',
  templateUrl: './document-detail.html',
})
export class DocumentDetail {
  private readonly api = inject(DocumentsApi);
  private readonly router = inject(Router);
  protected readonly locale = inject(LocaleService);

  protected formatDay(value: string): string {
    return new Intl.DateTimeFormat(this.locale.current(), { dateStyle: 'medium' }).format(new Date(value));
  }

  protected formatTime(value: string): string {
    return new Intl.DateTimeFormat(this.locale.current(), { timeStyle: 'short' }).format(new Date(value));
  }

  protected formatNumber(value: number): string {
    return new Intl.NumberFormat(this.locale.current()).format(value);
  }

  protected readonly view = signal<DetailView>('loading');
  protected readonly detail = signal<DocumentDetailData | null>(null);
  protected readonly error = signal<AppError | null>(null);

  /** The document was found to be gone when we tried to delete it (deleted in another tab, say). */
  protected readonly alreadyGone = signal(false);
  /** The selected tab: 0 is the text, 1 the chunks. */
  protected readonly tab = signal(0);

  protected readonly state = computed(() => {
    const detail = this.detail();
    return detail ? documentState(detail, Date.now()) : null;
  });
  protected readonly note = computed(() => {
    const detail = this.detail();
    switch (this.state()) {
      case 'failed':
        return this.locale.t(failedDocumentMessage(detail?.errorCode ?? null));
      case 'stalled':
        return this.locale.t(STALLED_MESSAGE);
      default:
        return null;
    }
  });
  /** The page's ⋮ menu. Deleting is here, away from the content, and asks first. */
  protected readonly menuItems = computed<MenuItem[]>(() => {
    const doc = this.detail();
    if (!doc) return [];
    return [
      {
        id: 'delete',
        label: this.locale.t('docs.detail.deleteAction'),
        icon: LucideTrash2,
        tone: 'danger',
        disabled: this.remove.pending(),
        run: () => this.askToDelete(doc),
      },
    ];
  });

  /** Incremented per load; an answer for a document the page has moved away from is dropped. */
  private ticket = 0;
  private id: string | null = null;

  constructor() {
    // Read from the route stream, not once from the snapshot: going from one document to another
    // reuses this component, and a snapshot would keep showing the first one.
    inject(ActivatedRoute)
      .paramMap.pipe(takeUntilDestroyed(inject(DestroyRef)))
      .subscribe((params) => {
        this.id = params.get('id');
        void this.load();
      });
  }

  protected async load(): Promise<void> {
    const id = this.id;
    const ticket = ++this.ticket;
    this.resetTransient();
    if (id === null) {
      this.view.set('notFound');
      return;
    }

    this.view.set('loading');
    try {
      const detail = await firstValueFrom(this.api.detail(id));
      if (ticket !== this.ticket) {
        return;
      }
      this.detail.set(detail);
      this.tab.set(detail.extractedText ? 0 : 1);
      this.view.set('loaded');
    } catch (failure) {
      if (ticket !== this.ticket) {
        return;
      }
      const error = toAppError(failure);
      this.detail.set(null);
      if (error.code === 'DOCUMENT_NOT_FOUND') {
        this.view.set('notFound');
      } else {
        this.error.set(error);
        this.view.set('error');
      }
    }
  }

  /**
   * Delete: confirm dialog → request → toast (shared with the list). A double click cannot send
   * two deletes: the mutation is busy from the first click until the end.
   */
  protected readonly remove = createDeleteDocument({
    onDeleted: () => this.router.navigate(['/documents']),
    onAlreadyGone: () => {
      // Someone, most likely this user in another tab, already deleted it.
      this.alreadyGone.set(true);
      this.detail.set(null);
      this.view.set('notFound');
    },
  });

  protected askToDelete(doc: DocumentDetailData): void {
    void this.remove.run(doc);
  }

  private resetTransient(): void {
    this.error.set(null);
    this.alreadyGone.set(false);
  }
}
