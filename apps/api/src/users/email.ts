/**
 * The one canonical form of an email address, used before every store and every lookup.
 * Two accounts that differ only in case or surrounding whitespace are a bug, not a feature.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
