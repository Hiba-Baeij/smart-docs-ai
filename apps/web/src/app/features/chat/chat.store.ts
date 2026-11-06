import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import type { ConversationSummary, Message } from '@smartdocs/contracts';
import { firstValueFrom } from 'rxjs';
import { AuthStore } from '../../core/auth/auth.store';
import { AppError, toAppError } from '../../core/http/app-error';
import { ConversationsApi } from './conversations.api';

export type ChatMessage = Message & { pending?: boolean; failed?: boolean; error?: string };
interface Thread {
  items: ChatMessage[];
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: AppError | null;
  total: number;
  page: number;
  pending: boolean;
}
const emptyThread = (): Thread => ({
  items: [],
  status: 'idle',
  error: null,
  total: 0,
  page: 1,
  pending: false,
});

@Injectable({ providedIn: 'root' })
export class ChatStore {
  private readonly api = inject(ConversationsApi);
  private readonly auth = inject(AuthStore);
  private readonly owner = signal<string | null>(null);
  private readonly rows = signal<ConversationSummary[]>([]);
  private readonly threads = signal<Record<string, Thread>>({});
  private readonly selected = signal<string | null>(null);
  private readonly listState = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');
  private readonly listFailure = signal<AppError | null>(null);
  private readonly actionFailure = signal<AppError | null>(null);
  private readonly listPage = signal(1);
  private readonly listTotal = signal(0);
  private readonly creating = signal(false);
  private readonly deleting = signal<string | null>(null);
  private listTicket = 0;
  private threadTickets = new Map<string, number>();
  private nonce = 0;

  private readonly current = computed(
    () => this.owner() !== null && this.owner() === this.auth.user()?.id,
  );
  readonly conversations = computed(() => (this.current() ? this.rows() : []));
  readonly selectedId = computed(() => (this.current() ? this.selected() : null));
  readonly thread = computed(() =>
    this.current() && this.selected()
      ? (this.threads()[this.selected()!] ?? emptyThread())
      : emptyThread(),
  );
  readonly listStatus = computed(() => (this.current() ? this.listState() : 'idle'));
  readonly listError = computed(() => (this.current() ? this.listFailure() : null));
  readonly actionError = computed(() => (this.current() ? this.actionFailure() : null));
  readonly hasMoreConversations = computed(
    () => this.current() && this.listPage() * 100 < this.listTotal(),
  );
  readonly isCreating = this.creating.asReadonly();
  readonly deletingId = this.deleting.asReadonly();

  constructor() {
    effect(() => {
      const user = this.auth.user()?.id ?? null;
      untracked(() => {
        if (user !== this.owner()) this.clear();
      });
    });
  }

  async loadConversations(more = false): Promise<void> {
    const owner = this.auth.user()?.id;
    if (!owner) return;
    if (owner !== this.owner()) {
      this.clear();
      this.owner.set(owner);
    }
    const ticket = ++this.listTicket;
    const page = more ? this.listPage() + 1 : 1;
    this.listState.set('loading');
    this.listFailure.set(null);
    try {
      const result = await firstValueFrom(this.api.list(page));
      if (ticket !== this.listTicket || owner !== this.auth.user()?.id) return;
      this.rows.set(
        more
          ? [
              ...this.rows(),
              ...result.items.filter(
                (row) => !this.rows().some((current) => current.id === row.id),
              ),
            ]
          : result.items,
      );
      this.listPage.set(result.page);
      this.listTotal.set(result.total);
      this.listState.set('ready');
    } catch (error) {
      if (ticket !== this.listTicket || owner !== this.auth.user()?.id) return;
      this.listFailure.set(toAppError(error));
      this.listState.set('error');
    }
  }

  async create(): Promise<string | null> {
    if (!this.current() || this.creating()) return null;
    const owner = this.owner();
    this.creating.set(true);
    this.actionFailure.set(null);
    try {
      const row = await firstValueFrom(this.api.create());
      if (owner !== this.auth.user()?.id) return null;
      this.rows.update((rows) => [row, ...rows]);
      this.listTotal.update((n) => n + 1);
      this.select(row.id);
      return row.id;
    } catch (error) {
      if (owner === this.auth.user()?.id) this.actionFailure.set(toAppError(error));
      return null;
    } finally {
      this.creating.set(false);
    }
  }

  select(id: string | null): void {
    if (!this.current()) return;
    this.selected.set(id);
    this.actionFailure.set(null);
    if (id && (!this.threads()[id] || this.threads()[id].status === 'loading'))
      void this.loadMessages(id);
  }

  async loadMessages(id: string, page = 1): Promise<void> {
    const owner = this.owner();
    if (!this.current()) return;
    const previous = this.threads()[id] ?? emptyThread();
    const loadingOlder = previous.status === 'ready' && page < previous.page;
    const ticket = (this.threadTickets.get(id) ?? 0) + 1;
    this.threadTickets.set(id, ticket);
    this.patch(id, { status: 'loading', error: null });
    try {
      let result = await firstValueFrom(this.api.messages(id, page));
      if (!this.live(owner, id, ticket)) return;
      // The API numbers pages from the oldest message. Open at the last page so a long
      // conversation resumes where the person left it; page 1 supplies the total first.
      if (!loadingOlder && page === 1 && result.total > result.pageSize) {
        const newestPage = Math.ceil(result.total / result.pageSize);
        result = await firstValueFrom(this.api.messages(id, newestPage));
        if (!this.live(owner, id, ticket)) return;
      }
      const existing = this.threads()[id]?.items ?? [];
      const newer = existing.filter((item) => item.pending || item.failed);
      this.patch(id, {
        items: loadingOlder ? [...result.items, ...existing] : [...result.items, ...newer],
        status: 'ready',
        total: result.total,
        page: result.page,
      });
    } catch (error) {
      if (!this.live(owner, id, ticket)) return;
      this.patch(id, { status: 'error', error: toAppError(error) });
    }
  }

  async send(content: string, retryId?: string): Promise<boolean> {
    const id = this.selectedId();
    const owner = this.owner();
    const question = content.trim();
    if (!id || !question || question.length > 4000 || this.thread().pending) return false;
    const tempId = retryId ?? `temp-${++this.nonce}`;
    const optimistic: ChatMessage = {
      id: tempId,
      role: 'user',
      content: question,
      sources: [],
      createdAt: new Date().toISOString(),
      pending: true,
    };
    const current = this.threads()[id] ?? emptyThread();
    this.patch(id, {
      items: retryId
        ? current.items.map((item) => (item.id === retryId ? optimistic : item))
        : [...current.items, optimistic],
      pending: true,
      status: 'ready',
    });
    try {
      const result = await firstValueFrom(this.api.send(id, question));
      if (owner !== this.auth.user()?.id || !this.threads()[id]) return true;
      const items = this.threads()[id].items.map((item) =>
        item.id === tempId ? result.userMessage : item,
      );
      this.patch(id, {
        items: [
          ...items.filter(
            (item, index) =>
              items.findIndex((other) => other.id === item.id) === index &&
              item.id !== result.message.id,
          ),
          result.message,
        ],
        pending: false,
      });
      this.rows.update((rows) => {
        const row = rows.find((item) => item.id === id);
        if (!row) return rows;
        return [
          {
            ...row,
            title: row.title || question.slice(0, 80),
            updatedAt: result.message.createdAt,
          },
          ...rows.filter((item) => item.id !== id),
        ];
      });
      return true;
    } catch (error) {
      if (owner !== this.auth.user()?.id || !this.threads()[id]) return false;
      const failure = toAppError(error);
      const items = this.threads()[id].items.map((item) =>
        item.id === tempId ? { ...item, pending: false, failed: true, error: failure.code } : item,
      );
      this.patch(id, { items, pending: false });
      return false;
    }
  }

  async remove(id: string): Promise<boolean> {
    if (!this.current() || this.deleting()) return false;
    const owner = this.owner();
    this.deleting.set(id);
    this.actionFailure.set(null);
    try {
      await firstValueFrom(this.api.remove(id));
      if (owner !== this.auth.user()?.id) return false;
      this.rows.update((rows) => rows.filter((row) => row.id !== id));
      this.listTotal.update((n) => Math.max(0, n - 1));
      this.threadTickets.delete(id);
      this.threads.update((threads) => {
        const copy = { ...threads };
        delete copy[id];
        return copy;
      });
      if (this.selected() === id) this.selected.set(null);
      return true;
    } catch (error) {
      if (owner === this.auth.user()?.id) this.actionFailure.set(toAppError(error));
      return false;
    } finally {
      this.deleting.set(null);
    }
  }

  private patch(id: string, values: Partial<Thread>): void {
    this.threads.update((threads) => ({
      ...threads,
      [id]: { ...(threads[id] ?? emptyThread()), ...values },
    }));
  }

  private live(owner: string | null, id: string, ticket: number): boolean {
    return (
      owner !== null &&
      owner === this.auth.user()?.id &&
      this.threadTickets.get(id) === ticket &&
      this.selected() === id
    );
  }

  private clear(): void {
    this.listTicket++;
    this.threadTickets.clear();
    this.rows.set([]);
    this.threads.set({});
    this.selected.set(null);
    this.listState.set('idle');
    this.listFailure.set(null);
    this.actionFailure.set(null);
    this.listPage.set(1);
    this.listTotal.set(0);
    this.owner.set(null);
  }
}
