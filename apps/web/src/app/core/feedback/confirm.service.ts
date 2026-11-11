import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { LocaleService } from '../i18n/locale.service';
import { ConfirmDialog, type ConfirmDialogData, type ConfirmTone } from './confirm-dialog';

export interface ConfirmOptions {
  title: string;
  message: string;
  warning?: string;
  /** Defaults to the translated "Confirm". */
  confirmLabel?: string;
  /** Defaults to the translated "Cancel". */
  cancelLabel?: string;
  /** `danger` for destructive actions: red button, warning icon, focus starts on Cancel. */
  tone?: ConfirmTone;
  /** See `ConfirmDialogData.action`. */
  action?: () => Promise<unknown>;
}

/**
 * The one way the app asks "are you sure?". It opens a modal dialog with a focus trap, Esc to
 * cancel, and focus returned to the trigger afterwards. It resolves `true` only when the person
 * confirmed, so callers never deal with the dialog itself.
 */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  private readonly dialog = inject(MatDialog);
  private readonly locale = inject(LocaleService);

  async confirm(options: ConfirmOptions): Promise<boolean> {
    const tone = options.tone ?? 'primary';
    const data: ConfirmDialogData = {
      title: options.title,
      message: options.message,
      warning: options.warning,
      confirmLabel: options.confirmLabel ?? this.locale.t('common.confirm'),
      cancelLabel: options.cancelLabel ?? this.locale.t('common.cancel'),
      tone,
      action: options.action,
    };
    const ref = this.dialog.open<ConfirmDialog, ConfirmDialogData, boolean>(ConfirmDialog, {
      data,
      role: 'alertdialog',
      direction: this.locale.dir(),
      width: 'min(28rem, calc(100vw - 2rem))',
      // A destructive action starts on the safe choice; Enter must not delete by accident.
      autoFocus: tone === 'danger' ? '.cancel' : '.accept',
      restoreFocus: true,
      panelClass: 'app-confirm-panel',
    });
    return (await firstValueFrom(ref.afterClosed())) === true;
  }
}
