import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type {
  ConversationPage,
  ConversationSummary,
  Message,
  MessagePage,
  UserSummary,
} from '@smartdocs/contracts';
import { Observable, Subject, of, throwError } from 'rxjs';
import { AuthStore } from '../../core/auth/auth.store';
import { ChatStore } from './chat.store';
import { ConversationsApi, SendResult } from './conversations.api';

const user = (id: string): UserSummary => ({
  id,
  name: id,
  email: `${id}@example.com`,
  createdAt: '2026-01-01T00:00:00Z',
});
const row = (id: string): ConversationSummary => ({
  id,
  title: id,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
});
const message = (id: string, role: 'user' | 'assistant' = 'user'): Message => ({
  id,
  role,
  content: id,
  sources: [],
  createdAt: '2026-01-01T00:00:00Z',
});
const page = (items: Message[], n = 1, total = items.length): MessagePage => ({
  items,
  page: n,
  pageSize: 50,
  total,
});
const list = (items: ConversationSummary[]): ConversationPage => ({
  items,
  page: 1,
  pageSize: 100,
  total: items.length,
});

class FakeApi {
  listAnswer: () => Observable<ConversationPage> = () => of(list([row('a'), row('b')]));
  messageAnswer: (id: string, page: number) => Observable<MessagePage> = () => of(page([]));
  sendAnswer: (id: string, content: string) => Observable<SendResult> = () =>
    of({ userMessage: message('saved'), message: message('answer', 'assistant') });
  removeAnswer: () => Observable<void> = () => of(undefined);
  sendCalls: { id: string; content: string }[] = [];
  list(): Observable<ConversationPage> {
    return this.listAnswer();
  }
  create(): Observable<ConversationSummary> {
    return of(row('new'));
  }
  messages(id: string, n: number): Observable<MessagePage> {
    return this.messageAnswer(id, n);
  }
  send(id: string, content: string): Observable<SendResult> {
    this.sendCalls.push({ id, content });
    return this.sendAnswer(id, content);
  }
  remove(): Observable<void> {
    return this.removeAnswer();
  }
}

describe('ChatStore', () => {
  let api: FakeApi;
  let store: ChatStore;
  const auth = { user: signal<UserSummary | null>(user('sara')) };
  beforeEach(() => {
    auth.user.set(user('sara'));
    api = new FakeApi();
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthStore, useValue: auth },
        { provide: ConversationsApi, useValue: api },
      ],
    });
    store = TestBed.inject(ChatStore);
  });

  it('shows an optimistic question, then replaces it with persisted messages', async () => {
    const slow = new Subject<SendResult>();
    api.sendAnswer = () => slow;
    await store.loadConversations();
    store.select('a');
    await Promise.resolve();
    const pending = store.send(' What is this? ');
    expect(store.thread().items[0].content).toBe('What is this?');
    expect(store.thread().pending).toBe(true);
    slow.next({ userMessage: message('saved'), message: message('answer', 'assistant') });
    slow.complete();
    await pending;
    expect(store.thread().items.map((item) => item.id)).toEqual(['saved', 'answer']);
    expect(store.thread().pending).toBe(false);
  });

  it('keeps a failed question and permits retry', async () => {
    api.sendAnswer = () => throwError(() => new HttpErrorResponse({ status: 0 }));
    await store.loadConversations();
    store.select('a');
    await Promise.resolve();
    await store.send('Question');
    expect(store.thread().items[0].failed).toBe(true);
    expect(store.thread().items[0].error).toBe('NETWORK');
    const id = store.thread().items[0].id;
    api.sendAnswer = () =>
      of({ userMessage: message('saved'), message: message('answer', 'assistant') });
    await store.send('Question', id);
    expect(store.thread().items.map((item) => item.id)).toEqual(['saved', 'answer']);
    expect(api.sendCalls).toHaveLength(2);
  });

  it('does not render a late answer in another conversation', async () => {
    const slow = new Subject<SendResult>();
    api.sendAnswer = () => slow;
    await store.loadConversations();
    store.select('a');
    await Promise.resolve();
    const pending = store.send('A question');
    store.select('b');
    await Promise.resolve();
    slow.next({ userMessage: message('a-saved'), message: message('a-answer', 'assistant') });
    slow.complete();
    await pending;
    expect(store.selectedId()).toBe('b');
    expect(store.thread().items).toEqual([]);
    store.select('a');
    expect(store.thread().items.map((item) => item.id)).toEqual(['a-saved', 'a-answer']);
  });

  it('drops a late history response after selecting a different conversation', async () => {
    const slow = new Subject<MessagePage>();
    api.messageAnswer = (id) => (id === 'a' ? slow : of(page([message('b-message')])));
    await store.loadConversations();
    store.select('a');
    store.select('b');
    slow.next(page([message('a-message')]));
    slow.complete();
    await Promise.resolve();
    expect(store.thread().items.map((item) => item.id)).toEqual(['b-message']);
    store.select('a');
    await Promise.resolve();
    expect(store.thread().items.map((item) => item.id)).toEqual([]);
  });

  it('opens a long conversation at its newest page and prepends older history', async () => {
    api.messageAnswer = (_id, number) =>
      of(page([message(number === 1 ? 'oldest' : 'newest')], number, 100));
    await store.loadConversations();
    store.select('a');

    await vi.waitFor(() => expect(store.thread().items.map((item) => item.id)).toEqual(['newest']));
    expect(store.thread().page).toBe(2);

    await store.loadMessages('a', 1);
    expect(store.thread().items.map((item) => item.id)).toEqual(['oldest', 'newest']);
  });

  it('clears all visible state when the signed-in user changes', async () => {
    await store.loadConversations();
    store.select('a');
    await Promise.resolve();
    auth.user.set(user('omar'));
    expect(store.conversations()).toEqual([]);
    expect(store.selectedId()).toBeNull();
    expect(store.thread().items).toEqual([]);
  });

  it('creates, reorders after send, and deletes a conversation', async () => {
    await store.loadConversations();
    expect(await store.create()).toBe('new');
    expect(store.conversations()[0].id).toBe('new');
    store.select('b');
    await Promise.resolve();
    await store.send('Question');
    expect(store.conversations()[0].id).toBe('b');
    expect(await store.remove('b')).toBe(true);
    expect(store.selectedId()).toBeNull();
    expect(store.conversations().some((item) => item.id === 'b')).toBe(false);
  });
});
