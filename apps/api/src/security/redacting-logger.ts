import { ConsoleLogger } from '@nestjs/common';

const secretKey = /^(password|authorization|cookie|apiKey|token|secret)$/i;

/** Sanitises both structured values and common text representations before Nest writes a line. */
export function redactLogValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return value
      .replace(/\bBearer\s+[^\s,}"']+/gi, 'Bearer [REDACTED]')
      .replace(
        /(["']?(?:password|authorization|cookie|apiKey|token|secret)["']?\s*[:=]\s*)(["']?)([^\s,}"']+)/gi,
        '$1$2[REDACTED]',
      )
      .replace(/\bsid=[^\s;,}"']+/gi, 'sid=[REDACTED]')
      .replace(/\bsk-[A-Za-z0-9_-]{8,}/g, '[REDACTED]');
  }
  if (Array.isArray(value)) return value.map(redactLogValue);
  if (value instanceof Error)
    return redactLogValue(`${value.name}: ${value.message}`);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        secretKey.test(key) ? '[REDACTED]' : redactLogValue(item),
      ]),
    );
  }
  return value;
}

/** The one logger installed at process startup. No request body is logged by default. */
export class RedactingLogger extends ConsoleLogger {
  override log(message: unknown, ...optionalParams: unknown[]): void {
    super.log(redactLogValue(message), ...optionalParams.map(redactLogValue));
  }
  override warn(message: unknown, ...optionalParams: unknown[]): void {
    super.warn(redactLogValue(message), ...optionalParams.map(redactLogValue));
  }
  override error(message: unknown, ...optionalParams: unknown[]): void {
    super.error(redactLogValue(message), ...optionalParams.map(redactLogValue));
  }
  override debug(message: unknown, ...optionalParams: unknown[]): void {
    super.debug(redactLogValue(message), ...optionalParams.map(redactLogValue));
  }
  override verbose(message: unknown, ...optionalParams: unknown[]): void {
    super.verbose(
      redactLogValue(message),
      ...optionalParams.map(redactLogValue),
    );
  }
  override fatal(message: unknown, ...optionalParams: unknown[]): void {
    super.fatal(redactLogValue(message), ...optionalParams.map(redactLogValue));
  }
}
