import * as bcrypt from 'bcrypt';

/** A deliberate latency/security trade-off (NFR-02). Measure login latency once and record it. */
export const BCRYPT_COST = 12;

/**
 * A real cost-12 hash of 32 random bytes that nobody knows. Login compares against it when the
 * email is unknown, so "no such user" costs the same ~400 ms as "wrong password" and response
 * time cannot reveal which emails are registered. It must keep the same cost as real hashes.
 */
export const DUMMY_HASH =
  '$2b$12$zHK18Jb80sBowCccgDKMPuB03Rki0psuM0CWKbYwLdFwlZSLIWlUS';

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
