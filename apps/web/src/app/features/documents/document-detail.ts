import { Component, DestroyRef, ElementRef, Injector, afterNextRender, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { DocumentDetail as DocumentDetailData } from '@smartdocs/contracts';
import { firstValueFrom } from 'rxjs';
import { AppError, toAppError } from '../../core/http/app-error';
import { userMessage } from '../../core/http/user-message';
import { LocaleService } from '../../core/i18n/locale.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { EmptyState } from '../../shared/empty-state';
import { ErrorBanner } from '../../shared/error-banner';
import { StatusBadge } from '../../shared/status-badge';
import { documentState, failedDocumentMessage, stalledMessage } from './document-state';
import { DocumentsApi } from './documents.api';
import { DocumentsStore } from './documents.store';

/** What this page is showing. `notFound` is an answer, not a failure: the document is simply not there. */
export type DetailView = 'loading' | 'error' | 'notFound' | 'loaded';

/** Characters of extracted text shown before "Show all": a long document is not put in the page whole. */
export const TEXT_PREVIEW_CHARACTERS = 5_000;

@Component({
  imports: [EmptyState, ErrorBanner, RouterLink, StatusBadge],
  selector: 'app-document-detail',
  styleUrl: './document-detail.scss',
  templateUrl: './document-detail.html',
})
export class DocumentDetail {
  private readonly api = inject(DocumentsApi);
  private readonly store = inject(DocumentsStore);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly notifications = inject(NotificationService);
  protected readonly locale = inject(LocaleService);

  protected formatDate(value: string): string {
    return new Intl.DateTimeFormat(this.locale.current(), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  }

  protected readonly view = signal<DetailView>('loading');
  protected readonly detail = signal<DocumentDetailData | null>(null);
  protected readonly error = signal<AppError | null>(null);

  protected readonly confirming = signal(false);
  protected readonly deleting = signal(false);
  protected readonly deleteFailure = signal<string | null>(null);
  /** The document was found to be gone when we tried to delete it (deleted in another tab, say). */
  protected readonly alreadyGone = signal(false);
  protected readonly showAllText = signal(false);

  protected readonly state = computed(() => {
    const detail = this.detail();
    return detail ? documentState(detail, Date.now()) : null;
  });
  protected readonly note = computed(() => {
    const detail = this.detail();
    switch (this.state()) {
      case 'failed':
        return failedDocumentMessage(detail?.errorCode ?? null, this.locale.current());
      case 'stalled':
        return stalledMessage(this.locale.current());
      default:
        return null;
    }
  });
  protected readonly visibleText = computed(() => {
    const text = this.detail()?.extractedText ?? '';
    return this.showAllText() ? text : text.slice(0, TEXT_PREVIEW_CHARACTERS);
  });
  protected readonly textIsCut = computed(
    () => (this.detail()?.extractedText.length ?? 0) > TEXT_PREVIEW_CHARACTERS,
  );

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

  protected askToDelete(): void {
    this.deleteFailure.set(null);
    this.confirming.set(true);
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLButtonElement>('.confirm button.delete')?.focus(), { injector: this.injector });
  }

  protected cancelDelete(): void {
    if (!this.deleting()) {
      this.confirming.set(false);
      afterNextRender(() => this.host.nativeElement.querySelector<HTMLButtonElement>('.danger button.delete')?.focus(), { injector: this.injector });
    }
  }

  protected async confirmDelete(): Promise<void> {
    const id = this.id;
    if (id === null || this.deleting()) {
      return; // a double click must not send two deletes
    }
    this.deleting.set(true);
    this.deleteFailure.set(null);

    try {
      await firstValueFrom(this.api.remove(id));
      this.store.forget(id);
      this.notifications.success(`document-delete-${id}`, this.locale.t('docs.delete.success'));
      await this.router.navigate(['/documents']);
    } catch (failure) {
      const error = toAppError(failure);
      if (error.code === 'DOCUMENT_NOT_FOUND') {
        // Someone, most likely this user in another tab, already deleted it. The outcome they
        // asked for is the outcome they have, so this is not a crash and not an error to retry.
        this.store.forget(id);
        this.alreadyGone.set(true);
        this.confirming.set(false);
        this.detail.set(null);
        this.view.set('notFound');
        this.notifications.info(`document-delete-${id}`, this.locale.t('docs.delete.alreadyGone'));
      } else {
        this.deleteFailure.set(userMessage(error));
        this.notifications.error(`document-delete-${id}`, userMessage(error));
      }
    } finally {
      this.deleting.set(false);
    }
  }

  protected toggleText(): void {
    this.showAllText.update((value) => !value);
  }

  private resetTransient(): void {
    this.error.set(null);
    this.confirming.set(false);
    this.deleteFailure.set(null);
    this.alreadyGone.set(false);
    this.showAllText.set(false);
  }
}
