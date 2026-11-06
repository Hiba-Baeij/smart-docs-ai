import { ConsoleLogger } from '@nestjs/common';
import { RedactingLogger, redactLogValue } from './redacting-logger';

describe('central log redaction', () => {
  it('masks secret fields in structured request data', () => {
    expect(
      redactLogValue({
        body: { password: 'pw-marker', apiKey: 'key-marker' },
        headers: {
          authorization: 'Bearer auth-marker',
          cookie: 'sid=cookie-marker',
        },
      }),
    ).toEqual({
      body: { password: '[REDACTED]', apiKey: '[REDACTED]' },
      headers: { authorization: '[REDACTED]', cookie: '[REDACTED]' },
    });
  });

  it('masks serialized request bodies and bearer/cookie tokens', () => {
    const raw =
      'body={"password":"pw-marker","apiKey":"key-marker"} authorization: Bearer auth-marker cookie=sid=cookie-marker';
    const safe = String(redactLogValue(raw));
    for (const marker of [
      'pw-marker',
      'key-marker',
      'auth-marker',
      'cookie-marker',
    ])
      expect(safe).not.toContain(marker);
  });

  it('the installed logger redacts a deliberately logged request body before output', () => {
    const sink = jest
      .spyOn(ConsoleLogger.prototype, 'log')
      .mockImplementation(() => undefined);
    try {
      new RedactingLogger().log({
        password: 'pw-marker',
        authorization: 'auth-marker',
        cookie: 'cookie-marker',
        apiKey: 'key-marker',
      });
      const output = JSON.stringify(sink.mock.calls);
      for (const marker of [
        'pw-marker',
        'auth-marker',
        'cookie-marker',
        'key-marker',
      ])
        expect(output).not.toContain(marker);
      expect(output).toContain('[REDACTED]');
    } finally {
      sink.mockRestore();
    }
  });
});
