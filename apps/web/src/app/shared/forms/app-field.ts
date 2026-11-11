import { Component, computed, inject, input } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { LocaleService } from '../../core/i18n/locale.service';
import type { MessageKey } from '../../core/i18n/messages.en';
import { AppForm } from './app-form';
import { type FieldErrors, fieldErrorText } from './form-errors';

/**
 * One labelled input of the surrounding `<app-form>`, with its hint and its error. The control,
 * the rules and the messages all come from the form's schema; only the look is set here.
 */
@Component({
  selector: 'app-field',
  imports: [ReactiveFormsModule],
  styleUrl: './app-field.scss',
  template: `
    <div class="field">
      <label [for]="id()">{{ locale.t(label()) }}</label>
      <input
        [id]="id()"
        [type]="type()"
        [formControl]="control()"
        [attr.autocomplete]="autocomplete()"
        [attr.aria-invalid]="error() ? 'true' : null"
        [attr.aria-describedby]="describedBy()"
      />
      @if (hint(); as hint) {
        <p class="hint" [id]="id() + '-hint'">{{ locale.t(hint) }}</p>
      }
      @if (error(); as text) {
        <p class="field-error" [id]="id() + '-error'">{{ text }}</p>
      }
    </div>
  `,
})
export class AppField {
  protected readonly locale = inject(LocaleService);
  private readonly parent = inject(AppForm);

  /** The schema field this input edits. */
  readonly name = input.required<string>();
  readonly label = input.required<MessageKey>();
  readonly type = input<'text' | 'email' | 'password' | 'tel' | 'url' | 'number'>('text');
  readonly autocomplete = input<string | null>(null);
  readonly hint = input<MessageKey | null>(null);

  private readonly form = computed(() => this.parent.form());
  protected readonly id = computed(() => this.form().fieldId(this.name()));
  protected readonly control = computed(() => this.form().control(this.name()));

  protected readonly error = computed(() => {
    this.form().changes(); // the control is not a signal; this follows its changes
    const control = this.control();
    return fieldErrorText(
      control.touched,
      control.errors as FieldErrors | null,
      this.locale.t(this.label()),
      this.locale,
    );
  });

  protected readonly describedBy = computed(() => {
    const ids = [
      this.hint() ? `${this.id()}-hint` : null,
      this.error() ? `${this.id()}-error` : null,
    ].filter(Boolean);
    return ids.length > 0 ? ids.join(' ') : null;
  });
}
