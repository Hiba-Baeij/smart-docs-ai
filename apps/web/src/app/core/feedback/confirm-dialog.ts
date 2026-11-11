import { Component, inject, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { LucideCircleHelp, LucideTriangleAlert } from '@lucide/angular';

export type ConfirmTone = 'danger' | 'primary';

/** Everything the dialog shows. Texts are already translated by the caller. */
export interface ConfirmDialogData {
  title: string;
  message: string;
  /** A second, emphasised line, such as "This cannot be undone." */
  warning?: string;
  confirmLabel: string;
  cancelLabel: string;
  tone: ConfirmTone;
  /**
   * Work to run when the person confirms. The dialog stays open with a spinner until it ends,
   * and closes either way: success and failure are reported by the caller (a toast).
   */
  action?: () => Promise<unknown>;
}

@Component({
  imports: [
    MatButton,
    MatDialogActions,
    MatDialogContent,
    MatDialogTitle,
    MatProgressSpinner,
    LucideCircleHelp,
    LucideTriangleAlert,
  ],
  selector: 'app-confirm-dialog',
  template: `
    <div class="confirm" [class.danger]="data.tone === 'danger'">
      <span class="icon" aria-hidden="true">
        @if (data.tone === 'danger') {
          <svg lucideTriangleAlert [size]="24"></svg>
        } @else {
          <svg lucideCircleHelp [size]="24"></svg>
        }
      </span>
      <h2 mat-dialog-title>{{ data.title }}</h2>
      <mat-dialog-content>
        <p class="message" dir="auto">{{ data.message }}</p>
        @if (data.warning) {
          <p class="warning">{{ data.warning }}</p>
        }
      </mat-dialog-content>
      <mat-dialog-actions>
        <button matButton="outlined" type="button" class="cancel" [disabled]="running()" (click)="cancel()">
          {{ data.cancelLabel }}
        </button>
        <button
          matButton="filled"
          type="button"
          class="accept"
          [disabled]="running()"
          [attr.aria-busy]="running()"
          (click)="accept()"
        >
          @if (running()) {
            <mat-progress-spinner mode="indeterminate" diameter="18" aria-hidden="true" />
          }
          {{ data.confirmLabel }}
        </button>
      </mat-dialog-actions>
    </div>
  `,
  styles: `
    .confirm {
      display: grid;
      justify-items: center;
      padding-block-start: 1.5rem;
      text-align: center;
    }
    .icon {
      display: grid;
      place-items: center;
      width: 3rem;
      height: 3rem;
      border-radius: 999px;
      background: var(--accent-surface);
      color: var(--accent);
    }
    .danger .icon {
      background: var(--error-surface);
      color: var(--error);
    }
    h2[mat-dialog-title] {
      padding-block-start: 0.75rem;
      text-align: center;
    }
    .message {
      margin: 0;
      color: var(--text);
      overflow-wrap: anywhere;
    }
    .warning {
      margin: 0.5rem 0 0;
      color: var(--text-muted);
      font-size: 0.875rem;
    }
    mat-dialog-actions {
      justify-content: center;
      gap: 0.5rem;
      width: 100%;
      padding-block-end: 1.25rem;
    }
    mat-progress-spinner {
      display: inline-block;
      margin-inline-end: 0.5rem;
      vertical-align: middle;
      --mat-progress-spinner-active-indicator-color: currentColor;
    }
    .danger .accept {
      --mat-button-filled-container-color: var(--error);
      --mat-button-filled-label-text-color: var(--surface);
    }
  `,
})
export class ConfirmDialog {
  protected readonly data = inject<ConfirmDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<ConfirmDialog, boolean>>(MatDialogRef);

  protected readonly running = signal(false);

  protected cancel(): void {
    if (!this.running()) {
      this.ref.close(false);
    }
  }

  protected async accept(): Promise<void> {
    if (this.running()) {
      return;
    }
    if (!this.data.action) {
      this.ref.close(true);
      return;
    }
    this.running.set(true);
    this.ref.disableClose = true; // no Esc or backdrop close while the work is running
    try {
      await this.data.action();
    } finally {
      this.running.set(false);
      this.ref.close(true);
    }
  }
}
