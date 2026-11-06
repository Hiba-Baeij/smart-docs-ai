import { loginSchema, registerSchema, schemaFieldErrors } from './auth-schema';

describe('auth schemas', () => {
  it('normalizes email without changing the login password', () => {
    const result = loginSchema.safeParse({ email: '  sara@example.com  ', password: ' pass ' });
    expect(result.success).toBe(true);
    if (result.success)
      expect(result.data).toEqual({ email: 'sara@example.com', password: ' pass ' });
  });

  it('does not apply registration password length to login', () => {
    expect(loginSchema.safeParse({ email: 'sara@example.com', password: 'x' }).success).toBe(true);
  });

  it('rejects a whitespace-only name and a short registration password', () => {
    const result = registerSchema.safeParse({
      name: '   ',
      email: 'sara@example.com',
      password: 'short',
    });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues.map((issue) => issue.path[0])).toEqual(['name', 'password']);
  });

  it('trims registration name and email for the API', () => {
    const result = registerSchema.safeParse({
      name: ' Sara ',
      email: ' sara@example.com ',
      password: 'long password',
    });
    expect(result.success).toBe(true);
    if (result.success)
      expect(result.data).toEqual({
        name: 'Sara',
        email: 'sara@example.com',
        password: 'long password',
      });
  });

  it('turns Zod issues into localized field feedback', () => {
    const result = registerSchema.safeParse({ name: ' ', email: 'bad', password: 'short' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(schemaFieldErrors(result.error, 'ar')).toEqual({
        name: ['تحقق من الاسم.'],
        email: ['تحقق من البريد الإلكتروني.'],
        password: ['تحقق من كلمة المرور.'],
      });
    }
  });
});
