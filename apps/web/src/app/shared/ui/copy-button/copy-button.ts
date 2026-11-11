import { Clipboard } from '@angular/cdk/clipboard';
import { Component, inject, input, signal } from '@angular/core';
import { LucideCheck, LucideCopy } from '@lucide/angular';
import { LocaleService } from '../../../core/i18n/locale.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { IconButton } from '../icon-button/icon-button';

/** Copies `value` to the clipboard, confirms with a toast, and shows a check mark briefly. */
@Component({
  selector: 'app-copy-button',
  imports: [IconButton, LucideCheck, LucideCopy],
  template: `
    <button type="button" appIconButton [label]="label() ?? locale.t('common.copy')" (click)="copy()">
      @if (copied()) {
        <svg lucideCheck class="done"></svg>
      } @else {
        <svg lucideCopy></svg>
      }
    </button>
  `,
  styles: `
    :host {
      display: inline-flex;
    }
    .done {
      color: var(--success);
    }
  `,
})
export class CopyButton {
  readonly value = input.required<string>();
  readonly label = input<string | null>(null);

  protected readonly locale = inject(LocaleService);
  private readonly clipboard = inject(Clipboard);
  private readonly notifications = inject(NotificationService);
  protected readonly copied = signal(false);
  private timer: ReturnType<typeof setTimeout> | undefined;

  protected copy(): void {
    if (!this.clipboard.copy(this.value())) {
      return;
    }
    this.notifications.success('copy', this.locale.t('common.copied'));
    this.copied.set(true);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.copied.set(false), 1500);
  }
}
