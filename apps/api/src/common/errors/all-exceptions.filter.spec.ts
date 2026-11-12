import type { ArgumentsHost } from '@nestjs/common';
import { ProviderFailure } from '../../ai/provider-failure';
import { noteDiagnostic, runWithDiagnostics } from '../diagnostics/diagnostics';
import type { FailureLog } from '../diagnostics/failure-log';
import { AllExceptionsFilter } from './all-exceptions.filter';

type FakeResponse = {
  locals: { requestId: string };
  statusCode: number;
  body: unknown;
  status(code: number): FakeResponse;
  json(body: unknown): FakeResponse;
};

function hostFor(method: string, url: string, extra: object = {}) {
  const response: FakeResponse = {
    locals: { requestId: 'req-1' },
    statusCode: 0,
    body: undefined,
    status(code) {
      response.statusCode = code;
      return response;
    },
    json(body) {
      response.body = body;
      return response;
    },
  };
  const request = { method, originalUrl: url, ...extra };
  const host = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;
  return { host, response };
}

function fakeLog() {
  const writes: { channel: string; entry: Record<string, unknown> }[] = [];
  const log = {
    enabled: true,
    write: (channel: string, entry: Record<string, unknown>) => {
      writes.push({ channel, entry });
      return Promise.resolve();
    },
  } as unknown as FailureLog;
  return { log, writes };
}

describe('AllExceptionsFilter failure log', () => {
  it('writes a chat failure with its error and the steps before it', () => {
    const { log, writes } = fakeLog();
    const { host, response } = hostFor(
      'POST',
      '/api/conversations/c1/messages',
      { user: { id: 'u1' } },
    );
    runWithDiagnostics(() => {
      noteDiagnostic({ event: 'llm_timeout', model: 'm', timeoutMs: 20000 });
      new AllExceptionsFilter(log).catch(
        new ProviderFailure('AI_UNAVAILABLE', true, 503),
        host,
      );
    });
    expect(response.statusCode).toBe(503);
    expect(writes).toHaveLength(1);
    expect(writes[0].channel).toBe('chat');
    expect(writes[0].entry).toMatchObject({
      requestId: 'req-1',
      path: '/api/conversations/c1/messages',
      statusCode: 503,
      code: 'AI_UNAVAILABLE',
      userId: 'u1',
      error: { name: 'ProviderFailure', upstreamStatus: 503 },
      steps: [{ event: 'llm_timeout', model: 'm' }],
    });
  });

  it('writes an upload failure with the file it was about', () => {
    const { log, writes } = fakeLog();
    const { host } = hostFor('POST', '/api/documents/upload', {
      file: { originalname: 'cv.pdf', mimetype: 'application/pdf', size: 42 },
    });
    new AllExceptionsFilter(log).catch(new Error('db down'), host);
    expect(writes[0].channel).toBe('upload');
    expect(writes[0].entry).toMatchObject({
      code: 'INTERNAL',
      file: {
        originalName: 'cv.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 42,
      },
      error: { name: 'Error', message: 'db down' },
    });
  });

  it('writes nothing for other routes, and the body never carries the details', () => {
    const { log, writes } = fakeLog();
    const { host, response } = hostFor('GET', '/api/documents');
    new AllExceptionsFilter(log).catch(new Error('secret detail'), host);
    expect(writes).toHaveLength(0);
    expect(JSON.stringify(response.body)).not.toMatch(/secret detail/);
  });
});
