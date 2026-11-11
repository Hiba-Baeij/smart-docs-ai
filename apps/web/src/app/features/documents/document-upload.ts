import { HttpEventType } from '@angular/common/http';
import { Component, DestroyRef, computed, inject, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { toAppError } from '../../core/http/app-error';
import { userMessage } from '../../core/http/user-message';
import { LocaleService } from '../../core/i18n/locale.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { DocumentsApi } from './documents.api';
import { validateSelectedFile } from './file-selection';

/**
 * `uploading`: the bytes are on their way. `processing`: all of them arrived and the server is
 * extracting text, which can take seconds and has no percentage. They are different waits, so the
 * person is told which one it is.
 */
export type UploadPhase = 'idle' | 'uploading' | 'processing' | 'done' | 'error';
const UPLOAD_TOAST_ID = 'document-upload';

@Component({
  selector: 'app-document-upload',
  styleUrl: './document-upload.scss',
  templateUrl: './document-upload.html',
})
export class DocumentUpload {
  private readonly api = inject(DocumentsApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly notifications = inject(NotificationService);
  protected readonly locale = inject(LocaleService);

  /** Emitted when an upload ends, well or badly: either way the server may have a new row to list. */
  readonly settled = output<void>();

  protected readonly phase = signal<UploadPhase>('idle');
  protected readonly progress = signal(0);
  protected readonly fileName = signal('');
  protected readonly failure = signal<{ message: string; reference: string | null } | null>(null);
  protected readonly dragging = signal(false);

  protected readonly busy = computed(
    () => this.phase() === 'uploading' || this.phase() === 'processing',
  );

  constructor() {
    this.destroyRef.onDestroy(() => {
      if (this.busy()) this.notifications.dismiss(UPLOAD_TOAST_ID);
    });
  }

  protected onSelect(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    // A second file chosen while one is still being sent would start a second upload.
    if (!file || this.busy()) {
      return;
    }

    this.start(file, input);
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    if (!this.busy()) this.dragging.set(true);
  }

  protected onDragLeave(): void {
    this.dragging.set(false);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    if (this.busy()) return;
    const file = event.dataTransfer?.files[0];
    const input = (event.currentTarget as HTMLElement | null)?.querySelector<HTMLInputElement>('input[type="file"]');
    if (file && input) this.start(file, input);
  }

  private start(file: File, input: HTMLInputElement): void {
    const invalid = validateSelectedFile(file);
    if (invalid) {
      const messages = {
        unsupported: this.locale.t('docs.upload.unsupported'),
        empty: this.locale.t('docs.upload.empty'),
        'too-large': this.locale.t('docs.upload.tooLarge'),
      };
      this.fileName.set(file.name);
      this.failure.set({ message: messages[invalid], reference: null });
      this.notifications.error(UPLOAD_TOAST_ID, messages[invalid]);
      this.phase.set('error');
      input.value = '';
      return;
    }

    this.fileName.set(file.name);
    this.failure.set(null);
    this.progress.set(0);
    this.phase.set('uploading');
    this.notifications.loading(UPLOAD_TOAST_ID, `${this.locale.t('docs.upload.uploading')} ${file.name}…`);

    this.api
      .upload(file)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (httpEvent) => {
          if (httpEvent.type === HttpEventType.UploadProgress && httpEvent.total) {
            const percent = Math.min(100, Math.floor((httpEvent.loaded / httpEvent.total) * 100));
            // The toast follows in steps of 10%, so it does not re-render on every chunk.
            if (Math.floor(percent / 10) > Math.floor(this.progress() / 10) && percent < 100) {
              this.notifications.loading(
                UPLOAD_TOAST_ID,
                `${this.locale.t('docs.upload.uploading')} ${file.name}… ${percent}%`,
              );
            }
            this.progress.set(percent);
            if (percent >= 100 && this.phase() !== 'processing') {
              this.phase.set('processing');
              this.notifications.loading(
                UPLOAD_TOAST_ID,
                `${this.locale.t('docs.upload.processing')} ${file.name}…`,
              );
            }
          } else if (httpEvent.type === HttpEventType.Response) {
            this.notifications.success(UPLOAD_TOAST_ID, `${file.name} ${this.locale.t('docs.upload.success')}`);
            this.finish(input, 'done');
          }
        },
        error: (error: unknown) => {
          const appError = toAppError(error);
          this.failure.set({ message: userMessage(appError), reference: appError.requestId });
          this.notifications.error(UPLOAD_TOAST_ID, userMessage(appError));
          this.finish(input, 'error');
        },
      });
  }

  /**
   * Back to a state where a file can be chosen. The input is cleared in both outcomes, otherwise
   * choosing the same file again (the usual thing after a failure) would fire no change event.
   */
  private finish(input: HTMLInputElement, phase: 'done' | 'error'): void {
    input.value = '';
    this.phase.set(phase);
    this.settled.emit();
  }
}
