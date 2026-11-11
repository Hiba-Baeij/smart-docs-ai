import type { ValidationErrors } from '@angular/forms';
import type { z } from 'zod';
import type { AppError, AppErrorCode } from '../../core/http/app-error';
import type { MessageKey } from '../../core/i18n/messages.en';
import type { LocaleService } from '../../core/i18n/locale.service';
import { SERVER_LOCALE } from '../../core/i18n/locales';

/**
 * The one place that decides what a form says when something is wrong, whether the browser
 * caught it (a schema issue) or the server did (an `AppError`). The wording itself lives in the
 * message files; this file only chooses which message to use.
 *
 * Messages are kept as descriptions (a key plus parameters), not as finished text, so they are
 * written in whatever language is current when they are shown, even after a switch.
 */
export type FormMessage =
  | { readonly key: MessageKey; readonly params?: Readonly<Record<string, string | number>> }
  /** A server validation detail for `field`, shown as is only to readers of SERVER_LOCALE. */
  | { readonly detail: string; readonly field: string };

/** What a control's `errors` hold: one problem from the schema, or one message from the server. */
export type FieldError =
  | { readonly kind: 'required' | 'email' | 'invalid' }
  | { readonly kind: 'minLength' | 'maxLength'; readonly n: number };

export interface FieldErrors extends ValidationErrors {
  schema?: FieldError;
  server?: FormMessage;
}

/** What a failed submit means for the form. */
export interface FormFailure {
  /** A message for the whole form, or null when everything belongs to fields. */
  form: FormMessage | null;
  /** Field name -> messages. */
  fields: Record<string, FormMessage[]>;
}

type Translator = Pick<LocaleService, 't' | 'current'>;

// ---- Server errors ------------------------------------------------------------------------

/** Errors that belong to one field, so they are shown under it. */
const FIELD_ERRORS: Partial<Record<AppErrorCode, { field: string; key: MessageKey }>> = {
  AUTH_EMAIL_TAKEN: { field: 'email', key: 'error.emailTaken' },
};

/** Errors that concern the whole form. */
const FORM_ERRORS: Partial<Record<AppErrorCode, MessageKey>> = {
  // One message for both "no such email" and "wrong password": the API does not say which.
  AUTH_INVALID_CREDENTIALS: 'error.invalidCredentials',
  RATE_LIMITED: 'error.rateLimited',
  NETWORK: 'error.network',
};

/**
 * Chooses what the user sees from the stable `code`. The API's own `message` is never shown:
 * it is for developers and may change.
 */
export function toFormFailure(error: AppError): FormFailure {
  const onField = FIELD_ERRORS[error.code];
  if (onField) {
    return { form: null, fields: { [onField.field]: [{ key: onField.key }] } };
  }

  const onForm = FORM_ERRORS[error.code];
  if (onForm) {
    return { form: { key: onForm }, fields: {} };
  }

  if (error.code === 'VALIDATION_FAILED') {
    const details = error.details ?? {};
    return Object.keys(details).length > 0
      ? {
          form: null,
          fields: Object.fromEntries(
            Object.entries(details).map(([field, messages]) => [
              field,
              messages.map((detail) => ({ detail, field })),
            ]),
          ),
        }
      : { form: { key: 'error.validation' }, fields: {} };
  }

  return {
    form: error.requestId
      ? { key: 'error.genericRef', params: { ref: error.requestId } }
      : { key: 'error.generic' },
    fields: {},
  };
}

// ---- Schema issues ------------------------------------------------------------------------

/**
 * Turns one Zod issue into the problem a field reports. An empty field that fails any rule is
 * "required": "at least 10 characters" is not what someone who typed nothing needs to read.
 */
export function toFieldError(issue: z.core.$ZodIssue, value?: unknown): FieldError {
  if (value === '' || value === null || value === undefined) {
    return { kind: 'required' };
  }
  switch (issue.code) {
    case 'too_small':
      return Number(issue.minimum) <= 1
        ? { kind: 'required' }
        : { kind: 'minLength', n: Number(issue.minimum) };
    case 'too_big':
      return { kind: 'maxLength', n: Number(issue.maximum) };
    case 'invalid_format':
      return issue.format === 'email' ? { kind: 'email' } : { kind: 'invalid' };
    case 'invalid_type':
      return { kind: 'required' };
    default:
      return { kind: 'invalid' };
  }
}

// ---- Turning a description into text -------------------------------------------------------

/** The text for one message. `label` is the field's label, when the message is on a field. */
export function messageText(message: FormMessage, i18n: Translator, label?: string): string {
  if ('key' in message) {
    return i18n.t(message.key, message.params);
  }
  // The API writes details in one language; other readers get a generic line in their own.
  return i18n.current() === SERVER_LOCALE
    ? message.detail
    : i18n.t('form.check', { label: label ?? i18n.t('form.thisField') });
}

/** The message a control shows, or null. Nothing shows before the user has touched it. */
export function fieldErrorText(
  touched: boolean,
  errors: FieldErrors | null,
  label: string,
  i18n: Translator,
): string | null {
  if (!touched || !errors) {
    return null;
  }
  if (errors.server) {
    return messageText(errors.server, i18n, label);
  }

  const problem = errors.schema;
  switch (problem?.kind) {
    case 'required':
      return i18n.t('form.required', { label });
    case 'email':
      return i18n.t('form.email');
    case 'minLength':
      return i18n.t('form.minLength', { label, n: problem.n });
    case 'maxLength':
      return i18n.t('form.maxLength', { label, n: problem.n });
    default:
      return i18n.t('form.invalid', { label });
  }
}
