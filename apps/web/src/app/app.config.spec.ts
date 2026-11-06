import { HttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { appConfig } from './app.config';
import { AppError } from './core/http/app-error';

/**
 * Tests the REAL application configuration, not a hand-built copy: a unit test that wires the
 * interceptor itself would still pass if `app.config.ts` forgot to register it.
 */
describe('appConfig', () => {
  it('sends the session cookie on API requests through the real HttpClient setup', () => {
    TestBed.configureTestingModule({
      providers: [...appConfig.providers, provideHttpClientTesting()],
    });

    TestBed.inject(HttpClient).get('/api/auth/me').subscribe();

    const backend = TestBed.inject(HttpTestingController);
    expect(backend.expectOne('/api/auth/me').request.withCredentials).toBe(true);
    backend.verify();
  });

  it('turns API failures into AppError through the real HttpClient setup', () => {
    TestBed.configureTestingModule({
      providers: [...appConfig.providers, provideHttpClientTesting()],
    });
    let received: unknown;

    TestBed.inject(HttpClient)
      .get('/api/documents')
      .subscribe({ error: (error) => (received = error) });
    TestBed.inject(HttpTestingController).expectOne('/api/documents').flush(
      {
        code: 'INTERNAL',
        message: 'x',
        statusCode: 500,
        details: null,
        requestId: 'r',
        timestamp: 't',
        path: '/',
      },
      { status: 500, statusText: 'Server Error' },
    );

    expect(received).toBeInstanceOf(AppError);
  });
});
