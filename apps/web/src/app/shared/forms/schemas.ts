import { z } from 'zod';

/**
 * Every form's rules live here, once. A form builds its controls and its validation from these
 * schemas, so there is no second copy of a limit in `Validators` to drift out of sync.
 *
 * The limits mirror the API's DTOs; the server stays the authority.
 * `min(1)` on a string means "required": the error messages read it that way.
 */
export const fields = {
  // Trim first, so a field of spaces is "required" and not "not an email".
  email: z.string().trim().min(1).max(254).pipe(z.email()),
  name: z.string().trim().min(1).max(100),
  newPassword: z.string().min(10).max(128),
  // A login form must not reveal or enforce the registration minimum.
  currentPassword: z.string().min(1).max(128),
};

export const loginSchema = z.object({
  email: fields.email,
  password: fields.currentPassword,
});

export const registerSchema = z.object({
  name: fields.name,
  email: fields.email,
  password: fields.newPassword,
});
