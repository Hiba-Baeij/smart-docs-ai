import { AbstractControl, FormGroup } from '@angular/forms';
import { AppError } from '../../core/http/app-error';
import type { Locale } from '../../core/i18n/locale.service';

/** What a failed login or registration means for the form. */
export interface AuthFailure {
  /** A message for the whole form, or null when everything is attached to fields. */
  formMessage: string | null;
  /** Field name -> messages from the server. */
  fieldErrors: Record<string, string[]>;
}

/**
 * Chooses what the user sees. The wording is decided here, from the stable `code`; the API's
 * own `message` is never displayed, because it is for developers and may change.
 */
export function toAuthFailure(error: AppError, locale: Locale = 'en'): AuthFailure {
  const ar = locale === 'ar';
  switch (error.code) {
    case 'AUTH_INVALID_CREDENTIALS':
      // One message for both "no such email" and "wrong password": the API does not say which.
      return form(
        ar ? 'البريد الإلكتروني أو كلمة المرور غير صحيحة.' : 'Invalid email or password.',
      );
    case 'AUTH_EMAIL_TAKEN':
      return {
        formMessage: null,
        fieldErrors: {
          email: [ar ? 'هذا البريد الإلكتروني مسجل بالفعل.' : 'This email is already registered.'],
        },
      };
    case 'VALIDATION_FAILED':
      return error.details && Object.keys(error.details).length > 0
        ? { formMessage: null, fieldErrors: ar ? arabicFieldErrors(error.details) : error.details }
        : form(ar ? 'تحقق من البيانات وحاول مجددًا.' : 'Please check the form and try again.');
    case 'RATE_LIMITED':
      return form(
        ar
          ? 'محاولات كثيرة جدًا. انتظر دقيقة ثم حاول مجددًا.'
          : 'Too many attempts. Please wait a minute and try again.',
      );
    case 'NETWORK':
      return form(
        ar
          ? 'تعذر الوصول إلى الخادم. تحقق من اتصالك وحاول مجددًا.'
          : 'Cannot reach the server. Check your connection and try again.',
      );
    default:
      return form(
        error.requestId
          ? ar
            ? `حدث خطأ. حاول مجددًا. المرجع: ${error.requestId}`
            : `Something went wrong. Please try again. Reference: ${error.requestId}`
          : ar
            ? 'حدث خطأ. حاول مجددًا.'
            : 'Something went wrong. Please try again.',
      );
  }
}

function arabicFieldErrors(details: Record<string, string[]>): Record<string, string[]> {
  const labels: Record<string, string> = {
    name: 'الاسم',
    email: 'البريد الإلكتروني',
    password: 'كلمة المرور',
  };
  return Object.fromEntries(
    Object.keys(details).map((name) => [name, [`تحقق من ${labels[name] ?? 'هذا الحقل'}.`]]),
  );
}

function form(message: string): AuthFailure {
  return { formMessage: message, fieldErrors: {} };
}

/**
 * Puts server messages on the matching controls. A message for a field the form does not have
 * (a field the API rejected but the UI never sends) cannot be shown on a field, so it is
 * returned for the form-level message instead of being lost.
 */
export function applyFieldErrors(
  group: FormGroup,
  fieldErrors: Record<string, string[]>,
): string[] {
  const unplaced: string[] = [];

  for (const [name, messages] of Object.entries(fieldErrors)) {
    const control = group.get(name);
    if (control) {
      control.setErrors({ server: messages[0] });
      control.markAsTouched();
    } else {
      unplaced.push(...messages);
    }
  }

  return unplaced;
}

/** The first message to show for a control, or null. Nothing shows before the user has touched it. */
export function fieldMessage(
  control: AbstractControl,
  label: string,
  locale: Locale = 'en',
): string | null {
  if (!control.touched || !control.errors) {
    return null;
  }

  const errors = control.errors;
  if (typeof errors['server'] === 'string') return errors['server'];
  if (locale === 'ar') {
    if (errors['required']) return `${label} مطلوب.`;
    if (errors['email']) return 'أدخل بريدًا إلكترونيًا صحيحًا.';
    if (errors['minlength'])
      return `${label} يجب أن يتكون من ${(errors['minlength'] as { requiredLength: number }).requiredLength} أحرف على الأقل.`;
    if (errors['maxlength'])
      return `${label} يجب ألا يتجاوز ${(errors['maxlength'] as { requiredLength: number }).requiredLength} حرفًا.`;
    return `${label} غير صالح.`;
  }
  if (errors['required']) return `${label} is required.`;
  if (errors['email']) return 'Enter a valid email address.';
  if (errors['minlength']) {
    return `${label} must be at least ${(errors['minlength'] as { requiredLength: number }).requiredLength} characters.`;
  }
  if (errors['maxlength']) {
    return `${label} must be at most ${(errors['maxlength'] as { requiredLength: number }).requiredLength} characters.`;
  }
  return `${label} is not valid.`;
}

/**
 * Moves keyboard focus to the first invalid field, so a failed submit is not silent. It reads the
 * form MODEL, which is always current, not the `ng-invalid` CSS class, which only updates on the
 * next change-detection pass and can lag behind what the user just typed.
 */
export function focusFirstInvalid(host: HTMLElement, group: FormGroup): void {
  const name = Object.keys(group.controls).find((key) => group.controls[key].invalid);
  if (name) {
    host.querySelector<HTMLElement>(`[formControlName="${name}"]`)?.focus();
  }
}
