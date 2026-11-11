import { inject } from '@angular/core';
import { createMutation } from '../../core/feedback/mutation';
import { userMessage } from '../../core/http/user-message';
import { LocaleService } from '../../core/i18n/locale.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { DocumentsApi } from './documents.api';
import { DocumentsStore } from './documents.store';

/** What deleting needs to know about a document: from a list row or from the detail page. */
export interface DeletableDocument {
  id: string;
  originalName: string;
  chunkCount: number;
}

export interface DeleteDocumentOptions {
  /** After the server deleted it (the store has already forgotten it). */
  onDeleted?: (document: DeletableDocument) => void | Promise<unknown>;
  /** When it turned out to be gone already, e.g. deleted in another tab. */
  onAlreadyGone?: (document: DeletableDocument) => void;
}

/**
 * Deleting a document, the same way everywhere: confirm dialog that names it and its chunks →
 * request → toast. "Already deleted" is the outcome the person asked for, so it is an info toast,
 * not an error. Call in an injection context (a field initializer).
 */
export function createDeleteDocument(options: DeleteDocumentOptions = {}) {
  const api = inject(DocumentsApi);
  const store = inject(DocumentsStore);
  const locale = inject(LocaleService);
  const notifications = inject(NotificationService);

  return createMutation((document: DeletableDocument) => api.remove(document.id), {
    confirm: (document) => ({
      tone: 'danger',
      title: locale.t('docs.delete.title'),
      message: locale.t('docs.delete.message', {
        name: document.originalName,
        count:
          document.chunkCount === 1
            ? `1 ${locale.t('docs.detail.chunk')}`
            : `${document.chunkCount} ${locale.t('docs.detail.chunks')}`,
      }),
      warning: locale.t('docs.delete.irreversible'),
      confirmLabel: locale.t('docs.detail.confirm'),
      cancelLabel: locale.t('docs.detail.cancel'),
    }),
    toastId: (document) => `document-delete-${document.id}`,
    loading: () => locale.t('docs.detail.deleting'),
    success: () => locale.t('docs.delete.success'),
    error: (error) => (error.code === 'DOCUMENT_NOT_FOUND' ? null : userMessage(error)),
    onSuccess: (_, document) => {
      store.forget(document.id);
      return options.onDeleted?.(document);
    },
    onError: (error, document) => {
      if (error.code === 'DOCUMENT_NOT_FOUND') {
        store.forget(document.id);
        notifications.info(`document-delete-${document.id}`, locale.t('docs.delete.alreadyGone'));
        options.onAlreadyGone?.(document);
      }
    },
  });
}
