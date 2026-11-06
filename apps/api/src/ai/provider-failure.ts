import { AppError } from '../common/errors/app-error';

/** Safe application error. Vendor bodies and transport messages never enter it. */
export class ProviderFailure extends AppError {
  constructor(
    code: 'AI_TIMEOUT' | 'AI_UNAVAILABLE',
    readonly retryable: boolean,
    readonly upstreamStatus?: number,
  ) {
    super(
      code,
      code === 'AI_TIMEOUT'
        ? 'Answer generation timed out.'
        : 'Answer generation is unavailable.',
    );
  }
}
