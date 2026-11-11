import { Component, ElementRef, OnInit, computed, inject, input } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { LocaleService } from '../../core/i18n/locale.service';
import type { MessageKey } from '../../core/i18n/messages.en';
import { Button } from '../ui/button/button';
import { messageText } from './form-errors';
import type { FormHandle } from './schema-form';

/**
 * A form built from a `SchemaForm`: the form-level error, the projected fields and the submit
 * button with its progress state.
 *
 * ```html
 * <app-form [form]="form" submitLabel="auth.login.action" pendingLabel="auth.login.pending">
 *   <app-field name="email" label="auth.email" type="email" autocomplete="username" />
 * </app-form>
 * ```
 */
@Component({
  selector: 'app-form',
  imports: [Button, ReactiveFormsModule],
  styleUrl: './app-form.scss',
  template: `
    <form [formGroup]="form().group" (ngSubmit)="form().submit()" novalidate>
      @if (error(); as text) {
        <p class="form-error" role="alert">{{ text }}</p>
      }

      <ng-content />

      <button type="submit" appButton variant="primary" class="submit" [loading]="form().submitting()">
        {{ locale.t(form().submitting() ? pendingLabel() : submitLabel()) }}
      </button>
    </form>
  `,
})
export class AppForm implements OnInit {
  protected readonly locale = inject(LocaleService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly form = input.required<FormHandle>();
  readonly submitLabel = input.required<MessageKey>();
  readonly pendingLabel = input.required<MessageKey>();

  protected readonly error = computed(() => {
    const messages = this.form().errors();
    return messages.length > 0
      ? messages.map((message) => messageText(message, this.locale)).join(' ')
      : null;
  });

  ngOnInit(): void {
    this.form().attach(this.host.nativeElement);
  }
}
