import { noteDiagnostic } from '../common/diagnostics/diagnostics';

type Kind = 'llm' | 'embedding';

/** Enough of a vendor error to say why ("high demand", "model not found"), never a whole body. */
const MAX_VENDOR_MESSAGE = 300;

/**
 * Notes a non-2xx answer from the provider in the request's diagnostic trail, for the failure
 * log only. The vendor message never enters ProviderFailure, so it never reaches a client.
 */
export async function noteUpstreamError(
  kind: Kind,
  model: string,
  response: Response,
): Promise<void> {
  let message: string | undefined;
  try {
    const text = await response.text();
    try {
      const parsed = JSON.parse(text) as unknown;
      const body = (Array.isArray(parsed) ? parsed[0] : parsed) as {
        error?: { message?: unknown };
      };
      message =
        typeof body?.error?.message === 'string' ? body.error.message : text;
    } catch {
      message = text;
    }
  } catch {
    // The body could not be read; the status alone still says a lot.
  }
  noteDiagnostic({
    event: `${kind}_upstream_error`,
    model,
    status: response.status,
    ...(message ? { message: message.slice(0, MAX_VENDOR_MESSAGE) } : {}),
  });
}

/** A request that never got an answer: the timeout, or the network error and its cause. */
export function noteTransportFailure(
  kind: Kind,
  model: string,
  error: unknown,
  timedOut: boolean,
  timeoutMs: number,
): void {
  if (timedOut) {
    noteDiagnostic({ event: `${kind}_timeout`, model, timeoutMs });
    return;
  }
  const cause =
    error instanceof Error && error.cause instanceof Error
      ? ((error.cause as Error & { code?: string }).code ?? error.cause.message)
      : undefined;
  noteDiagnostic({
    event: `${kind}_network_error`,
    model,
    error:
      error instanceof Error ? `${error.name}: ${error.message}` : 'unknown',
    ...(cause ? { cause } : {}),
  });
}

export function noteBadResponse(kind: Kind, model: string, reason: string) {
  noteDiagnostic({ event: `${kind}_bad_response`, model, reason });
}
