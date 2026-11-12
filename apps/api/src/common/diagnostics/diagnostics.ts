import { AsyncLocalStorage } from 'node:async_hooks';
import { redactLogValue } from '../../security/redacting-logger';

export type DiagnosticEvent = { event: string } & Record<string, unknown>;

type Trail = { events: DiagnosticEvent[] };

/** Most steps one request may record; a runaway loop must not grow memory without bound. */
const MAX_EVENTS = 50;
const MAX_STACK_LINES = 12;

const storage = new AsyncLocalStorage<Trail>();

/**
 * Starts an empty trail for one request. Everything the request runs, including its awaits,
 * notes into this trail, and a failure log entry carries it: the steps that led to the error.
 */
export function runWithDiagnostics<T>(work: () => T): T {
  return storage.run({ events: [] }, work);
}

/** Records one step of the current request. Outside a request it does nothing. */
export function noteDiagnostic(event: DiagnosticEvent): void {
  const trail = storage.getStore();
  if (!trail || trail.events.length >= MAX_EVENTS) return;
  trail.events.push({
    at: new Date().toISOString(),
    ...(redactLogValue(event) as DiagnosticEvent),
  });
}

export function diagnosticTrail(): DiagnosticEvent[] {
  return storage.getStore()?.events ?? [];
}

/** What a log needs to say about an error: its kind, message, own fields, stack and cause. */
export function describeError(error: unknown, depth = 0): unknown {
  if (!(error instanceof Error)) return redactLogValue(String(error));
  const own = Object.fromEntries(
    Object.entries(error).filter(
      ([key, value]) =>
        key !== 'cause' && value !== undefined && typeof value !== 'function',
    ),
  );
  return redactLogValue({
    name: error.name,
    message: error.message,
    ...own,
    stack: error.stack
      ?.split('\n')
      .slice(1, MAX_STACK_LINES + 1)
      .map((line) => line.trim()),
    ...(error.cause !== undefined && depth < 3
      ? { cause: describeError(error.cause, depth + 1) }
      : {}),
  });
}
