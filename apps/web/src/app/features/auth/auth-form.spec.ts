import { FormControl, FormGroup, Validators } from '@angular/forms';
import { AppError } from '../../core/http/app-error';
import { applyFieldErrors, fieldMessage, toAuthFailure } from './auth-form';

describe('toAuthFailure', () => {
  it('localizes an invalid-credentials error without exposing server text', () => {
    const result = toAuthFailure(
      new AppError('AUTH_INVALID_CREDENTIALS', 'secret server text', 401),
      'ar',
    );
    expect(result.formMessage).toBe('البريد الإلكتروني أو كلمة المرور غير صحيحة.');
  });

  it('uses Arabic field feedback for server validation details', () => {
    const error = new AppError('VALIDATION_FAILED', 'server text', 400, { email: ['invalid'] });
    expect(toAuthFailure(error, 'ar').fieldErrors['email']).toEqual(['تحقق من البريد الإلكتروني.']);
  });
  const failure = (code: AppError['code'], extra: Partial<AppError> = {}) =>
    toAuthFailure(
      new AppError(
        code,
        'server text that must never be shown',
        400,
        extra.details ?? null,
        extra.requestId ?? null,
      ),
    );

  it('shows one message for wrong credentials, whatever the server said', () => {
    expect(failure('AUTH_INVALID_CREDENTIALS')).toEqual({
      formMessage: 'Invalid email or password.',
      fieldErrors: {},
    });
  });

  it('puts a taken email on the email field, not on the form', () => {
    expect(failure('AUTH_EMAIL_TAKEN')).toEqual({
      formMessage: null,
      fieldErrors: { email: ['This email is already registered.'] },
    });
  });

  it('puts validation details on their fields', () => {
    const result = failure('VALIDATION_FAILED', { details: { password: ['too short'] } });

    expect(result.fieldErrors).toEqual({ password: ['too short'] });
    expect(result.formMessage).toBeNull();
  });

  it('falls back to a form message when a validation failure carries no details', () => {
    expect(failure('VALIDATION_FAILED').formMessage).toBe('Please check the form and try again.');
  });

  it('explains rate limiting and network failures in plain words', () => {
    expect(failure('RATE_LIMITED').formMessage).toContain('Too many attempts');
    expect(failure('NETWORK').formMessage).toContain('Cannot reach the server');
  });

  it('gives a generic message plus the request id for anything else, never the server text', () => {
    const withId = failure('INTERNAL', { requestId: 'req-42' });
    const withoutId = failure('UNKNOWN');

    expect(withId.formMessage).toContain('Reference: req-42');
    expect(withoutId.formMessage).toBe('Something went wrong. Please try again.');
    expect(JSON.stringify([withId, withoutId])).not.toContain('server text');
  });
});

describe('applyFieldErrors', () => {
  const makeGroup = () =>
    new FormGroup({ email: new FormControl(''), password: new FormControl('') });

  it('sets the server message on the matching control and marks it touched', () => {
    const group = makeGroup();

    applyFieldErrors(group, { email: ['taken'] });

    expect(group.controls.email.errors).toEqual({ server: 'taken' });
    expect(group.controls.email.touched).toBe(true);
    expect(group.controls.password.errors).toBeNull();
  });

  it('returns the messages for fields the form does not have', () => {
    const unplaced = applyFieldErrors(makeGroup(), { userId: ['should not exist'] });

    expect(unplaced).toEqual(['should not exist']);
  });
});

describe('fieldMessage', () => {
  it('localizes required-field feedback in Arabic', () => {
    const control = new FormControl('', Validators.required);
    control.markAsTouched();
    expect(fieldMessage(control, 'البريد الإلكتروني', 'ar')).toBe('البريد الإلكتروني مطلوب.');
  });
  const required = () => new FormControl('', Validators.required);

  it('shows nothing until the control has been touched', () => {
    expect(fieldMessage(required(), 'Email')).toBeNull();
  });

  it('describes the first problem once touched', () => {
    const control = required();
    control.markAsTouched();
    expect(fieldMessage(control, 'Email')).toBe('Email is required.');

    const email = new FormControl('nope', Validators.email);
    email.markAsTouched();
    expect(fieldMessage(email, 'Email')).toBe('Enter a valid email address.');

    const short = new FormControl('abc', Validators.minLength(10));
    short.markAsTouched();
    expect(fieldMessage(short, 'Password')).toBe('Password must be at least 10 characters.');

    const long = new FormControl('x'.repeat(5), Validators.maxLength(3));
    long.markAsTouched();
    expect(fieldMessage(long, 'Name')).toBe('Name must be at most 3 characters.');
  });

  it('prefers a server message over client rules', () => {
    const control = required();
    control.markAsTouched();
    control.setErrors({ server: 'This email is already registered.' });

    expect(fieldMessage(control, 'Email')).toBe('This email is already registered.');
  });

  it('shows nothing for a valid control', () => {
    const control = new FormControl('ok', Validators.required);
    control.markAsTouched();

    expect(fieldMessage(control, 'Email')).toBeNull();
  });
});
