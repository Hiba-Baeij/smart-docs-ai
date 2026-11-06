import { z } from 'zod';
import type { Locale } from '../../core/i18n/locale.service';

const email = z.string().trim().pipe(z.email().max(254));

export const loginSchema = z.object({
  email,
  // A login form must not reveal or enforce the registration minimum.
  password: z.string().min(1).max(128),
});

export const registerSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email,
  password: z.string().min(10).max(128),
});

export function schemaFieldErrors(error: z.ZodError, locale: Locale): Record<string, string[]> {
  const labels =
    locale === 'ar'
      ? { name: 'الاسم', email: 'البريد الإلكتروني', password: 'كلمة المرور' }
      : { name: 'name', email: 'email', password: 'password' };
  const feedback: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const name = String(issue.path[0] ?? 'form');
    const label =
      labels[name as keyof typeof labels] ?? (locale === 'ar' ? 'هذا الحقل' : 'this field');
    feedback[name] ??= [locale === 'ar' ? `تحقق من ${label}.` : `Check ${label}.`];
  }
  return feedback;
}
