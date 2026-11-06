import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';

describe('Health (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /api/health returns exactly { status: "ok" }', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/health')
      .expect(200);

    // toEqual on the whole body also proves nothing else leaks (versions, config).
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('does not serve the health route without the /api prefix', async () => {
    await request(app.getHttpServer()).get('/health').expect(404);
  });
});
