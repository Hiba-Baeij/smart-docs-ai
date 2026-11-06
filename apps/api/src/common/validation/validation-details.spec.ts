import type { ValidationError } from 'class-validator';
import { toValidationDetails } from './validation-details';

const error = (
  property: string,
  constraints?: Record<string, string>,
  children?: ValidationError[],
): ValidationError => ({ property, constraints, children });

describe('toValidationDetails', () => {
  it('maps each field to the messages of its constraints', () => {
    const details = toValidationDetails([
      error('password', {
        minLength: 'password must be longer than or equal to 10 characters',
        maxLength: 'password must be shorter than or equal to 128 characters',
      }),
      error('email', { isEmail: 'email must be an email' }),
    ]);

    expect(details).toEqual({
      password: [
        'password must be longer than or equal to 10 characters',
        'password must be shorter than or equal to 128 characters',
      ],
      email: ['email must be an email'],
    });
  });

  it('uses dotted paths for nested fields', () => {
    const details = toValidationDetails([
      error('profile', undefined, [error('age', { min: 'age too small' })]),
    ]);

    expect(details).toEqual({ 'profile.age': ['age too small'] });
  });

  it('never copies the rejected value into the details', () => {
    const rejected: ValidationError = {
      property: 'password',
      value: 'hunter2-the-secret',
      target: { password: 'hunter2-the-secret' },
      constraints: { minLength: 'password is too short' },
    };

    expect(JSON.stringify(toValidationDetails([rejected]))).not.toContain(
      'hunter2',
    );
  });

  it('falls back to a generic entry when there is nothing to report', () => {
    expect(toValidationDetails([])).toEqual({
      body: ['Invalid request body.'],
    });
  });
});
