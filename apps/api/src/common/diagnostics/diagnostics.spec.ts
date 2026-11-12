import {
  describeError,
  diagnosticTrail,
  noteDiagnostic,
  runWithDiagnostics,
} from './diagnostics';

describe('diagnostic trail', () => {
  it('collects the steps of one request across awaits', async () => {
    const trail = await runWithDiagnostics(async () => {
      noteDiagnostic({ event: 'first' });
      await new Promise((resolve) => setTimeout(resolve, 1));
      noteDiagnostic({ event: 'second', status: 503 });
      return diagnosticTrail();
    });
    expect(trail.map((step) => step.event)).toEqual(['first', 'second']);
    expect(trail[1]).toMatchObject({ status: 503 });
    expect(typeof trail[0].at).toBe('string');
  });

  it('keeps concurrent requests apart', async () => {
    const run = (name: string) =>
      runWithDiagnostics(async () => {
        noteDiagnostic({ event: `${name}-1` });
        await new Promise((resolve) => setTimeout(resolve, 2));
        noteDiagnostic({ event: `${name}-2` });
        return diagnosticTrail().map((step) => step.event);
      });
    const [a, b] = await Promise.all([run('a'), run('b')]);
    expect(a).toEqual(['a-1', 'a-2']);
    expect(b).toEqual(['b-1', 'b-2']);
  });

  it('does nothing outside a request', () => {
    noteDiagnostic({ event: 'lost' });
    expect(diagnosticTrail()).toEqual([]);
  });

  it('caps the steps of one request', () => {
    const trail = runWithDiagnostics(() => {
      for (let i = 0; i < 80; i++) noteDiagnostic({ event: 'loop' });
      return diagnosticTrail();
    });
    expect(trail).toHaveLength(50);
  });

  it('redacts secrets in noted values', () => {
    const trail = runWithDiagnostics(() => {
      noteDiagnostic({
        event: 'x',
        apiKey: 'abc',
        message: 'Bearer secret-token',
      });
      return diagnosticTrail();
    });
    expect(JSON.stringify(trail)).not.toMatch(/abc|secret-token/);
  });
});

describe('describeError', () => {
  it('keeps the name, message, own fields, stack and cause', () => {
    const error = new Error('outer', {
      cause: Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }),
    });
    const described = describeError(error) as Record<string, unknown>;
    expect(described).toMatchObject({
      name: 'Error',
      message: 'outer',
      cause: { message: 'socket hang up', code: 'ECONNRESET' },
    });
    expect(Array.isArray(described.stack)).toBe(true);
  });

  it('describes a non-error value as text', () => {
    expect(describeError('boom')).toBe('boom');
  });
});
