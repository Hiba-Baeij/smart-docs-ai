import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { toastState } from 'ngx-sonner';
import { provideRouter } from '@angular/router';
import type {
  ConversationSummary,
  DocumentDetail,
  Message,
  UserSummary,
} from '@smartdocs/contracts';
import { Observable, Subject, of, throwError } from 'rxjs';
import { AuthStore } from '../../core/auth/auth.store';
import { DocumentsApi } from '../documents/documents.api';
import { ChatPage } from './chat-page';
import { LocaleService } from '../../core/i18n/locale.service';
import { ChatStore } from './chat.store';
import { ConversationsApi, SendResult } from './conversations.api';

const time = '2026-01-01T00:00:00Z';
const conversation: ConversationSummary = {
  id: 'one',
  title: 'Contract',
  createdAt: time,
  updatedAt: time,
};
const secondConversation: ConversationSummary = { ...conversation, id: 'two', title: 'Policy' };
const answer: Message = {
  id: 'answer',
  role: 'assistant',
  content: '<b>exact text</b>',
  createdAt: time,
  sources: [
    {
      documentId: 'gone',
      documentName: '<img src=x>.pdf',
      chunkIndex: 0,
      pageNumber: 2,
      sheetName: null,
    },
  ],
};
const fallback: Message = {
  ...answer,
  content: 'ليس لدي معلومات كافية للإجابة عن سؤالك.',
  sources: [],
};
class FakeApi {
  messages = [answer];
  sendAnswer: () => Observable<SendResult> = () =>
    of({
      userMessage: { id: 'user', role: 'user', content: 'Question', createdAt: time, sources: [] },
      message: fallback,
    });
  list() {
    return of({ items: [conversation, secondConversation], page: 1, pageSize: 100, total: 2 });
  }
  create() {
    return of(conversation);
  }
  messagesFor() {
    return of({ items: this.messages, page: 1, pageSize: 50, total: this.messages.length });
  }
  send() {
    return this.sendAnswer();
  }
  remove() {
    return of(undefined);
  }
}

describe('ChatPage', () => {
  let api: FakeApi;
  let root: HTMLElement;
  let fixture: ReturnType<typeof TestBed.createComponent<ChatPage>>;
  const auth = {
    user: signal<UserSummary | null>({
      id: 'u',
      name: 'User',
      email: 'u@example.com',
      createdAt: time,
    }),
  };
  beforeEach(async () => {
    api = new FakeApi();
    const apiAdapter = {
      list: () => api.list(),
      create: () => api.create(),
      messages: () => api.messagesFor(),
      send: () => api.send(),
      remove: () => api.remove(),
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthStore, useValue: auth },
        { provide: ConversationsApi, useValue: apiAdapter },
        {
          provide: DocumentsApi,
          useValue: {
            list: () => of({ items: [], page: 1, pageSize: 100, total: 0 }),
            detail: (): Observable<DocumentDetail> =>
              throwError(
                () =>
                  new HttpErrorResponse({
                    status: 404,
                    error: { code: 'DOCUMENT_NOT_FOUND', message: 'Gone' },
                  }),
              ),
          },
        },
      ],
    });
    TestBed.inject(LocaleService).set('en');
    fixture = TestBed.createComponent(ChatPage);
    root = fixture.nativeElement;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });
  const settle = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const button = (label: string) =>
    [...root.querySelectorAll('button')].find((node) => node.textContent?.includes(label))!;

  it('shows the list, selects a conversation, and renders sources as escaped text', async () => {
    button('Contract').click();
    await settle();
    expect(root.querySelector('[role="log"]')).not.toBeNull();
    expect(root.textContent).toContain('<b>exact text</b>');
    expect(root.querySelector('.bubble b')).toBeNull();
    expect(root.textContent).toContain('<img src=x>.pdf (document unavailable)');
    expect(root.querySelector('.source-chip a')).toBeNull();
    expect(root.querySelector('.bubble img')).toBeNull();
  });

  it('switches conversation and composer labels to Arabic without losing the selected thread', async () => {
    button('Contract').click();
    await settle();
    const locale = TestBed.inject(LocaleService);
    locale.set('ar');
    fixture.detectChanges();

    expect(root.querySelector('h1')?.textContent).toBe('المحادثات');
    expect(root.querySelector('label[for="question"]')?.textContent).toBe('سؤالك');
    expect(root.querySelector('[role="log"]')).not.toBeNull();
    locale.set('en');
  });

  it('renders the exact fallback with no source chips', async () => {
    api.messages = [fallback];
    button('Contract').click();
    await settle();
    expect(root.querySelector('.bubble p')?.textContent).toBe(fallback.content);
    expect(root.querySelector('.source-chip')).toBeNull();
  });

  it('sends on Enter, keeps Shift+Enter for a newline, and keeps focus in the composer', async () => {
    button('Contract').click();
    await settle();
    const textarea = root.querySelector('textarea')!;
    textarea.value = 'Question';
    textarea.dispatchEvent(new Event('input'));
    await settle();
    const shift = new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, cancelable: true });
    textarea.dispatchEvent(shift);
    expect(shift.defaultPrevented).toBe(false);
    const enter = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });
    textarea.dispatchEvent(enter);
    await settle();
    expect(enter.defaultPrevented).toBe(true);
    expect(textarea.value).toBe('');
    expect(document.activeElement).toBe(textarea);
  });

  it('preserves the question and shows retry after a network failure', async () => {
    const pending = new Subject<SendResult>();
    api.sendAnswer = () => pending;
    button('Contract').click();
    await settle();
    const textarea = root.querySelector('textarea')!;
    textarea.value = 'Question';
    textarea.dispatchEvent(new Event('input'));
    await settle();
    button('Send').click();
    fixture.detectChanges();
    expect(TestBed.inject(ChatStore).thread().pending).toBe(true);
    expect(root.textContent).toContain('Assistant is preparing an answer');
    pending.error(new HttpErrorResponse({ status: 0 }));
    await settle();
    expect(textarea.value).toBe('Question');
    expect(root.textContent).toContain('Connection lost');
    expect(button('Retry question')).toBeDefined();
  });

  describe('deleting a conversation', () => {
    const dialog = () => document.querySelector<HTMLElement>('app-confirm-dialog');
    const dialogButton = (label: RegExp) =>
      Array.from(document.querySelectorAll<HTMLButtonElement>('app-confirm-dialog button')).find((b) =>
        label.test(b.textContent ?? ''),
      )!;
    const toastOf = (id: string) => toastState.toasts().find((item) => item.id === id);

    async function askToDelete(): Promise<void> {
      button('Contract').click();
      await settle();
      button('Delete conversation').click();
      await settle();
    }

    beforeEach(() => toastState.reset());
    afterEach(() => {
      TestBed.inject(MatDialog).closeAll();
      toastState.reset();
    });

    it('asks in a dialog first, and cancelling deletes nothing', async () => {
      await askToDelete();

      expect(dialog()!.textContent).toContain('Delete this conversation and all its messages?');
      expect(document.activeElement).toBe(dialogButton(/Cancel/)); // starts on the safe choice
      dialogButton(/Cancel/).click();
      await settle();

      expect(dialog()).toBeNull();
      expect(TestBed.inject(ChatStore).conversations()).toHaveLength(2);
    });

    it('confirming removes it and says so in a toast', async () => {
      await askToDelete();

      dialogButton(/Yes, delete/).click();
      await settle();
      await settle();

      expect(TestBed.inject(ChatStore).conversations()).toHaveLength(1);
      expect(toastOf('conversation-delete-one')?.title).toBe('Conversation deleted.');
      expect(dialog()).toBeNull();
    });

    it('a failure is a toast, and the conversation stays', async () => {
      api.remove = () => throwError(() => new HttpErrorResponse({ status: 0 }));
      await askToDelete();

      dialogButton(/Yes, delete/).click();
      await settle();
      await settle();

      expect(TestBed.inject(ChatStore).conversations()).toHaveLength(2);
      expect(toastOf('conversation-delete-one')?.type).toBe('error');
    });
  });

  it('keeps separate drafts when switching conversations', async () => {
    button('Contract').click();
    await settle();
    const textarea = root.querySelector('textarea')!;
    textarea.value = 'Contract question';
    textarea.dispatchEvent(new Event('input'));
    await settle();
    button('Policy').click();
    await settle();
    expect(textarea.value).toBe('');
    button('Contract').click();
    await settle();
    expect(textarea.value).toBe('Contract question');
  });
});
