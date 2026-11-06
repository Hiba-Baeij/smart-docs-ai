import type { Request } from 'express';

/** What the guard proves about the caller: an id, and nothing else. */
export type AuthenticatedUser = { id: string };

export type AuthenticatedRequest = Request & { user?: AuthenticatedUser };
