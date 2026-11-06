import { Controller, Get } from '@nestjs/common';

export type HealthResponse = { status: 'ok' };

@Controller('health')
export class HealthController {
  /** Liveness only: no versions, configuration or connection details. */
  @Get()
  check(): HealthResponse {
    return { status: 'ok' };
  }
}
