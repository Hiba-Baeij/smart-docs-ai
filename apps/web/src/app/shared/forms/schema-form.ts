import { signal } from '@angular/core';
import { FormControl, FormGroup, type ValidatorFn } from '@angular/forms';
import { firstValueFrom, isObservable, type Observable } from 'rxjs';
import type { z } from 'zod';
import { type AppError, toAppError } from '../../core/http/app-error';
import { type FieldErrors, type FormMessage, toFieldError, toFormFailure } from './form-errors';

/** A schema whose fields are the form's fields. */
type ObjectSchema = z.ZodObject;

export interface SchemaFormOptions<S extends ObjectSchema, R> {
  /** Prefix for element ids: field `email` of form `login` gets `id="login-email"`. */
  id: string;
  /** The single source of the form's fields and rules. */
  schema: S;
  /** Starting values, one per schema field. */
  initial: z.input<S>;
  /** Sends the parsed (trimmed, typed) values. */
  submit: (data: z.output<S>) => Promise<R> | Observable<R>;
  /** Runs after a successful submit, while the button still shows progress. */
  onSuccess?: (result: R) => unknown;
  /**
   * Runs after a failure has been shown. Return `true` when it moved the focus itself, so the
   * default (the first invalid field) is skipped.
   */
  onFailure?: (error: AppError, form: SchemaForm<S, R>) => boolean | void;
}

/** What `<app-form>` and `<app-field>` need from a form, whatever its schema. */
export interface FormHandle {
  readonly id: string;
  readonly group: FormGroup;
  readonly submitting: () => boolean;
  readonly errors: () => readonly FormMessage[];
  readonly changes: () => number;
  attach(host: HTMLElement): void;
  fieldId(name: string): string;
  control(name: string): FormControl<unknown>;
  submit(): Promise<void>;
}

/**
 * A reactive form built from a Zod schema, with everything around a submit: no double send,
 * validation, progress, server errors placed on their fields, and focus on the first problem.
 * `<app-form>` and `<app-field>` display it; a feature only declares the schema and the call.
 */
export class SchemaForm<S extends ObjectSchema = ObjectSchema, R = unknown> implements FormHandle {
  readonly id: string;
  readonly group: FormGroup<Record<string, FormControl<unknown>>>;
  readonly submitting = signal(false);
  /** Messages for the whole form; empty when there are none. */
  readonly errors = signal<readonly FormMessage[]>([]);

  private readonly _changes = signal(0);
  /** Bumped on every value, status or touched change, so signal-based views can follow the form. */
  readonly changes = this._changes.asReadonly();

  private host: HTMLElement | null = null;

  constructor(private readonly options: SchemaFormOptions<S, R>) {
    this.id = options.id;
    const shape = options.schema.shape as Record<string, z.ZodType>;
    const initial = options.initial as Record<string, unknown>;

    this.group = new FormGroup(
      Object.fromEntries(
        Object.entries(shape).map(([name, schema]) => [
          name,
          new FormControl<unknown>(initial[name], {
            nonNullable: true,
            validators: [schemaValidator(schema)],
          }),
        ]),
      ),
    );
    this.group.events.subscribe(() => this._changes.update((n) => n + 1));
  }

  /** Called by `<app-form>` so focus can be moved inside it. */
  attach(host: HTMLElement): void {
    this.host = host;
  }

  fieldId(name: string): string {
    return `${this.id}-${name}`;
  }

  control(name: string): FormControl<unknown> {
    const control = this.group.controls[name];
    if (!control) {
      throw new Error(`Form "${this.id}" has no field "${name}". Add it to the schema.`);
    }
    return control;
  }

  focus(name: string): void {
    this.host?.querySelector<HTMLElement>(`#${CSS.escape(this.fieldId(name))}`)?.focus();
  }

  /** Clears a field and puts the cursor in it, e.g. the password after a wrong sign-in. */
  resetAndFocus(name: string): void {
    this.control(name).reset();
    this.focus(name);
  }

  async submit(): Promise<void> {
    if (this.submitting()) {
      return; // a double click or a second Enter must not send a second request
    }
    this.errors.set([]);

    if (this.group.invalid) {
      this.group.markAllAsTouched();
      this.focusFirstInvalid();
      return;
    }

    // Field rules passed; the whole schema also trims values and checks rules across fields.
    const parsed = this.options.schema.safeParse(this.group.getRawValue());
    if (!parsed.success) {
      const unplaced = parsed.error.issues.filter((issue) => {
        const control = this.group.get(String(issue.path[0] ?? ''));
        control?.setErrors({ schema: toFieldError(issue, control.value) } satisfies FieldErrors);
        control?.markAsTouched();
        return !control;
      });
      this.errors.set(unplaced.length > 0 ? [{ key: 'error.validation' }] : []);
      this.focusFirstInvalid();
      return;
    }

    this.submitting.set(true);
    try {
      const pending = this.options.submit(parsed.data);
      const result = isObservable(pending) ? await firstValueFrom(pending) : await pending;
      await this.options.onSuccess?.(result);
    } catch (error) {
      this.fail(toAppError(error));
    } finally {
      this.submitting.set(false);
    }
  }

  private fail(error: AppError): void {
    const failure = toFormFailure(error);
    const unplaced: FormMessage[] = [];

    for (const [name, messages] of Object.entries(failure.fields)) {
      const control = this.group.get(name);
      if (control) {
        control.setErrors({ server: messages[0] } satisfies FieldErrors);
        control.markAsTouched();
      } else {
        // A field the UI never sends cannot show it, so the form shows it instead of losing it.
        unplaced.push(...messages);
      }
    }
    this.errors.set(failure.form ? [failure.form] : unplaced);

    if (this.options.onFailure?.(error, this) !== true) {
      this.focusFirstInvalid();
    }
  }

  /**
   * Reads the form MODEL, which is always current, not the `ng-invalid` CSS class, which only
   * updates on the next change-detection pass.
   */
  private focusFirstInvalid(): void {
    const name = Object.keys(this.group.controls).find(
      (key) => this.group.controls[key].invalid,
    );
    if (name) this.focus(name);
  }
}

export function createSchemaForm<S extends ObjectSchema, R>(
  options: SchemaFormOptions<S, R>,
): SchemaForm<S, R> {
  return new SchemaForm(options);
}

/** Validates one control with its field's schema and reports the first problem. */
function schemaValidator(schema: z.ZodType): ValidatorFn {
  return (control) => {
    const result = schema.safeParse(control.value);
    return result.success
      ? null
      : ({ schema: toFieldError(result.error.issues[0], control.value) } satisfies FieldErrors);
  };
}
