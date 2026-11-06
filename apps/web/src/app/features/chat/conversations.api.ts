import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  ConversationPage,
  ConversationSummary,
  Message,
  MessagePage,
} from '@smartdocs/contracts';
import { Observable } from 'rxjs';
import { API_BASE_URL } from '../../core/config/api-base';

export interface SendResult {
  message: Message;
  userMessage: Message;
}

@Injectable({ providedIn: 'root' })
export class ConversationsApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  list(page = 1, pageSize = 100): Observable<ConversationPage> {
    return this.http.get<ConversationPage>(`${this.base}/conversations`, {
      params: { page, pageSize },
    });
  }

  create(): Observable<ConversationSummary> {
    return this.http.post<ConversationSummary>(`${this.base}/conversations`, {});
  }

  messages(id: string, page = 1, pageSize = 50): Observable<MessagePage> {
    return this.http.get<MessagePage>(
      `${this.base}/conversations/${encodeURIComponent(id)}/messages`,
      {
        params: { page, pageSize },
      },
    );
  }

  send(id: string, content: string): Observable<SendResult> {
    return this.http.post<SendResult>(
      `${this.base}/conversations/${encodeURIComponent(id)}/messages`,
      { content },
    );
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/conversations/${encodeURIComponent(id)}`);
  }
}
