import { TestBed } from '@angular/core/testing';
import { AppError } from '../../core/http/app-error';
import { LocaleService } from '../../core/i18n/locale.service';
import { fieldErrorText, messageText, toFieldError, toFormFailure } from './form-errors';
import { registerSchema } from './schemas';

describe('form errors', () => {
  let i18n: LocaleService;

  beforeEach(() => {
    i18n = TestBed.inject(LocaleService);
    i18n.set('en');
  });

  afterEach(() => {
    localStorage.removeItem('smartdocs.locale');
    document.documentElement.lang = 'en';
    document.documentElement.dir = 'ltr';
  });

  const failure = (code: AppError['code'], extra: Partial<AppError> = {}) =>
    toFormFailure(
      new AppError(
        code,
        'server text that must never be shown',
        400,
        extra.details ?? null,
        extra.requestId ?? null,
      ),
    );
  const formText = (code: AppError['code'], extra: Partial<AppError> = {}) => {
    const message = failure(code, extra).form;
    return message ? messageText(message, i18n) : null;
  };

  describe('toFormFailure', () => {
    it('shows one message for wrong credentials, in either language', () => {
      expect(formText('AUTH_INVALID_CREDENTIALS')).toBe('Invalid email or password.');
      i18n.set('ar');
      expect(formText('AUTH_INVALID_CREDENTIALS')).toBe(
        'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
      );
    });

    it('puts a taken email on the email field, not on the form', () => {
      expect(failure('AUTH_EMAIL_TAKEN')).toEqual({
        form: null,
        fields: { email: [{ key: 'error.emailTaken' }] },
      });
    });

    it('puts validation details on their fields: as sent in English, generic in Arabic', () => {
      const result = failure('VALIDATION_FAILED', { details: { password: ['too short'] } });
      const message = result.fields['password'][0];

      expect(result.form).toBeNull();
      expect(messageText(message, i18n, 'Password')).toBe('too short');
      i18n.set('ar');
      expect(messageText(message, i18n, 'كلمة المرور')).toBe('تحقق من كلمة المرور.');
      expect(messageText(message, i18n)).toBe('تحقق من هذا الحقل.');
    });

    it('falls back to a form message when a validation failure carries no details', () => {
      expect(formText('VALIDATION_FAILED')).toBe('Please check the form and try again.');
    });

    it('explains rate limiting and network failures in plain words', () => {
      expect(formText('RATE_LIMITED')).toContain('Too many attempts');
      expect(formText('NETWORK')).toContain('Cannot reach the server');
    });

    it('gives a generic message plus the request id for anything else, never the server text', () => {
      expect(formText('INTERNAL', { requestId: 'req-42' })).toContain('Reference: req-42');
      expect(formText('UNKNOWN')).toBe('Something went wrong. Please try again.');
      expect(JSON.stringify([failure('INTERNAL'), failure('UNKNOWN')])).not.toContain(
        'server text',
      );
    });
  });

  describe('toFieldError', () => {
    const issues = (value: Record<string, string>) => {
      const result = registerSchema.safeParse(value);
      return result.success ? [] : result.error.issues;
    };

    it('reads each schema rule as the problem a person understands', () => {
      const [name, email, password] = issues({
        name: '   ',
        email: 'nope',
        password: 'short',
      });

      expect(toFieldError(name, '   ')).toEqual({ kind: 'required' });
      expect(toFieldError(email, 'nope')).toEqual({ kind: 'email' });
      expect(toFieldError(password, 'short')).toEqual({ kind: 'minLength', n: 10 });
    });

    it('calls an empty field "required" whatever rule it broke', () => {
      const [password] = issues({ name: 'Sara', email: 'sara@example.com', password: '' });
      expect(password.path).toEqual(['password']);
      expect(toFieldError(password, '')).toEqual({ kind: 'required' });
    });

    it('reports a maximum length', () => {
      const [password] = issues({
        name: 'Sara',
        email: 'sara@example.com',
        password: 'x'.repeat(129),
      });
      expect(toFieldError(password, 'x'.repeat(129))).toEqual({ kind: 'maxLength', n: 128 });
    });
  });

  describe('fieldErrorText', () => {
    it('shows nothing until the control has been touched, or when it is valid', () => {
      expect(fieldErrorText(false, { schema: { kind: 'required' } }, 'Email', i18n)).toBeNull();
      expect(fieldErrorText(true, null, 'Email', i18n)).toBeNull();
    });

    it('describes each problem with the field label, in the current language', () => {
      const text = (schema: Parameters<typeof fieldErrorText>[1], label: string) =>
        fieldErrorText(true, schema, label, i18n);

      expect(text({ schema: { kind: 'required' } }, 'Email')).toBe('Email is required.');
      expect(text({ schema: { kind: 'email' } }, 'Email')).toBe('Enter a valid email address.');
      expect(text({ schema: { kind: 'minLength', n: 10 } }, 'Password')).toBe(
        'Password must be at least 10 characters.',
      );
      expect(text({ schema: { kind: 'maxLength', n: 3 } }, 'Name')).toBe(
        'Name must be at most 3 characters.',
      );

      i18n.set('ar');
      expect(text({ schema: { kind: 'required' } }, 'البريد الإلكتروني')).toBe(
        'البريد الإلكتروني مطلوب.',
      );
    });

    it('prefers a server message over schema rules', () => {
      expect(
        fieldErrorText(
          true,
          { schema: { kind: 'required' }, server: { key: 'error.emailTaken' } },
          'Email',
          i18n,
        ),
      ).toBe('This email is already registered.');
    });
  });
});
