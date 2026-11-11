import {
  afterNextRender,
  Component,
  computed,
  effect,
  ElementRef,
  Injector,
  inject,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { listQuery } from '../../shared/data/types';
import { DocumentsApi } from '../documents/documents.api';
import { userMessage } from '../../core/http/user-message';
import { AppError, toAppError } from '../../core/http/app-error';
import { createMutation } from '../../core/feedback/mutation';
import { LocaleService } from '../../core/i18n/locale.service';
import { ChatStore } from './chat.store';
import { AssistantMarkdown } from '../../shared/assistant-markdown';

@Component({
  selector: 'app-chat-page',
  imports: [AssistantMarkdown, FormsModule, RouterLink],
  templateUrl: './chat-page.html',
  styleUrl: './chat-page.scss',
})
export class ChatPage implements OnInit {
  protected readonly store = inject(ChatStore);
  protected readonly locale = inject(LocaleService);
  private readonly documents = inject(DocumentsApi);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly drafts = signal<Record<string, string>>({});
  protected readonly draft = computed(() => this.drafts()[this.store.selectedId() ?? ''] ?? '');
  protected readonly unavailableDocuments = signal<Set<string>>(new Set());
  protected readonly suggestions = signal<string[]>([]);
  /** The API's exact insufficient-evidence answer; only used to style it, never to change it. */
  protected readonly fallbackText = 'ليس لدي معلومات كافية للإجابة عن سؤالك.';
  protected readonly atBottom = signal(true);
  private readonly clockFormat = computed(
    () => new Intl.DateTimeFormat(this.locale.current(), { hour: '2-digit', minute: '2-digit' }),
  );
  private readonly dayFormat = computed(
    () => new Intl.DateTimeFormat(this.locale.current(), { day: 'numeric', month: 'short' }),
  );
  /** Documents cited anywhere in the open thread, derived from existing message sources. */
  protected readonly citedDocuments = computed(() => {
    const cited = new Map<string, { documentId: string; name: string; count: number }>();
    for (const item of this.store.thread().items) {
      if (item.role !== 'assistant') continue;
      for (const source of item.sources) {
        const entry = cited.get(source.documentId);
        if (entry) entry.count += 1;
        else
          cited.set(source.documentId, {
            documentId: source.documentId,
            name: source.documentName,
            count: 1,
          });
      }
    }
    return [...cited.values()];
  });
  protected readonly actionMessage = computed(() =>
    this.store.actionError() ? userMessage(this.store.actionError()!) : null,
  );
  protected readonly listMessage = computed(() =>
    this.store.listError() ? userMessage(this.store.listError()!) : null,
  );
  protected readonly threadMessage = computed(() =>
    this.store.thread().error ? userMessage(this.store.thread().error!) : null,
  );
  private readonly composer = viewChild<ElementRef<HTMLTextAreaElement>>('composer');
  private readonly log = viewChild<ElementRef<HTMLElement>>('log');
  private shouldScroll = true;
  private readonly checkedSources = new Set<string>();
  protected readonly selectedTitle = computed(
    () =>
      this.store.conversations().find((row) => row.id === this.store.selectedId())?.title ||
      this.locale.t('chat.new'),
  );

  constructor() {
    effect(() => {
      for (const item of this.store.thread().items) {
        for (const source of item.sources) {
          if (this.checkedSources.has(source.documentId)) continue;
          this.checkedSources.add(source.documentId);
          this.documents.detail(source.documentId).subscribe({
            error: (error) => {
              if (toAppError(error).code === 'DOCUMENT_NOT_FOUND') {
                this.unavailableDocuments.update((ids) => new Set([...ids, source.documentId]));
              }
            },
          });
        }
      }
    });
    afterNextRender(() => {
      const log = this.log()?.nativeElement;
      if (log && this.shouldScroll) log.scrollTop = log.scrollHeight;
    });
  }

  ngOnInit(): void {
    void this.store.loadConversations();
    this.documents.list(listQuery({ pageSize: 100 })).subscribe({
      next: (page) => {
        this.suggestions.set(
          page.items
            .filter((item) => item.status === 'COMPLETED')
            .slice(0, 3)
            .map((item) => `What does ${item.originalName} say?`),
        );
      },
      error: () => {
        this.suggestions.set([]);
      },
    });
  }

  /** The store reports a failed action as state; the mutation needs it as an error to toast it. */
  private async orFail<T>(result: Promise<T | null | false>): Promise<T> {
    const value = await result;
    if (value === null || value === false) {
      throw this.store.actionError() ?? new AppError('UNKNOWN', 'The action failed.', 0);
    }
    return value;
  }

  /** New conversation: toast on success or failure, no double submit. */
  protected readonly creation = createMutation(() => this.orFail(this.store.create()), {
    toastId: () => 'conversation-create',
    success: () => this.locale.t('chat.createSuccess'),
    onSuccess: () => this.focusComposer(),
  });

  /** Delete: confirm dialog → request → toast, the same as everywhere else. */
  protected readonly removal = createMutation((id: string) => this.orFail(this.store.remove(id)), {
    confirm: () => ({
      tone: 'danger',
      title: this.locale.t('chat.deleteConversation'),
      message: this.locale.t('chat.deletePrompt'),
      confirmLabel: this.locale.t('chat.yesDelete'),
      cancelLabel: this.locale.t('docs.detail.cancel'),
    }),
    toastId: (id) => `conversation-delete-${id}`,
    loading: () => this.locale.t('docs.detail.deleting'),
    success: () => this.locale.t('chat.deleteSuccess'),
  });

  protected create(): void {
    void this.creation.run();
  }

  protected back(): void {
    this.store.select(null);
  }

  protected initial(title: string): string {
    return (title || this.locale.t('chat.new')).trim().charAt(0).toUpperCase();
  }

  protected ext(name: string): string {
    const match = /\.([a-z0-9]{1,4})$/i.exec(name);
    return match ? match[1].toUpperCase() : 'FILE';
  }

  protected kind(name: string): string {
    const extension = this.ext(name);
    return extension === 'PDF'
      ? 'pdf'
      : extension === 'XLSX'
        ? 'xlsx'
        : extension === 'DOCX'
          ? 'docx'
          : 'file';
  }

  protected clock(iso: string | undefined): string {
    const date = iso ? new Date(iso) : null;
    return date && !Number.isNaN(date.getTime()) ? this.clockFormat().format(date) : '';
  }

  protected rowTime(iso: string | undefined): string {
    const date = iso ? new Date(iso) : null;
    if (!date || Number.isNaN(date.getTime())) return '';
    return date.toDateString() === new Date().toDateString()
      ? this.clockFormat().format(date)
      : this.dayFormat().format(date);
  }

  protected jump(): void {
    this.log()?.nativeElement.scrollTo({
      top: this.log()!.nativeElement.scrollHeight,
      behavior: 'smooth',
    });
  }

  protected select(id: string): void {
    this.shouldScroll = true;
    this.store.select(id);
  }

  protected askToDelete(): void {
    const id = this.store.selectedId();
    if (id) void this.removal.run(id);
  }

  protected keydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      void this.send();
    }
  }

  protected async send(): Promise<void> {
    const content = this.draft();
    if (!content.trim() || this.store.thread().pending) return;
    const id = this.store.selectedId();
    this.shouldScroll = this.nearBottom();
    const sent = await this.store.send(content);
    if (sent && id && this.drafts()[id] === content) {
      this.drafts.update((drafts) => ({ ...drafts, [id]: '' }));
    }
    if (id === this.store.selectedId()) {
      this.focusComposer();
      this.scrollIfNeeded();
    }
  }

  protected async retry(id: string, content: string): Promise<void> {
    this.shouldScroll = this.nearBottom();
    await this.store.send(content, id);
    this.focusComposer();
    this.scrollIfNeeded();
  }

  protected async moreMessages(): Promise<void> {
    const id = this.store.selectedId();
    if (id && this.store.thread().page > 1) {
      this.shouldScroll = false;
      await this.store.loadMessages(id, this.store.thread().page - 1);
    }
  }

  protected sourceKnown(id: string): boolean {
    return !this.unavailableDocuments().has(id);
  }

  protected setDraft(text: string): void {
    const id = this.store.selectedId();
    if (id) this.drafts.update((drafts) => ({ ...drafts, [id]: text }));
  }
  protected errorText(code: string | undefined): string {
    if (code === 'AI_TIMEOUT') return this.locale.t('chat.error.timeout');
    if (code === 'AI_UNAVAILABLE') return this.locale.t('chat.error.unavailable');
    if (code === 'NETWORK') return this.locale.t('chat.error.network');
    return this.locale.t('chat.error.other');
  }

  protected onScroll(): void {
    this.shouldScroll = this.nearBottom();
    this.atBottom.set(this.shouldScroll);
  }

  private nearBottom(): boolean {
    const element = this.log()?.nativeElement;
    return !element || element.scrollHeight - element.scrollTop - element.clientHeight < 100;
  }

  private scrollIfNeeded(): void {
    if (!this.shouldScroll) return;
    afterNextRender(
      () => {
        const element = this.log()?.nativeElement;
        if (element) element.scrollTop = element.scrollHeight;
      },
      { injector: this.injector },
    );
  }

  private focusComposer(): void {
    this.composer()?.nativeElement.focus();
  }
}
