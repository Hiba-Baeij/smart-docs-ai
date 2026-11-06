import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('reports only status ok', () => {
    expect(new HealthController().check()).toEqual({ status: 'ok' });
  });
});
