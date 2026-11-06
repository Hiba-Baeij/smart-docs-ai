import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_BASE_URL } from '../config/api-base';
import { credentialsInterceptor } from './credentials.interceptor';

describe('credentialsInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([credentialsInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  it('uses /api as the default API base', () => {
    expect(TestBed.inject(API_BASE_URL)).toBe('/api');
  });

  it('sends credentials on every request to the API', () => {
    http.get('/api/auth/me').subscribe();
    http.post('/api/auth/login', {}).subscribe();

    // Consume every request first: if an assertion throws, verify() must not also fail.
    const me = backend.expectOne('/api/auth/me');
    const login = backend.expectOne('/api/auth/login');

    expect(me.request.withCredentials).toBe(true);
    expect(login.request.withCredentials).toBe(true);
  });

  it('does not send credentials anywhere else', () => {
    http.get('https://example.com/api/steal').subscribe();
    http.get('/assets/logo.svg').subscribe();

    const external = backend.expectOne('https://example.com/api/steal');
    const asset = backend.expectOne('/assets/logo.svg');

    expect(external.request.withCredentials).toBe(false);
    expect(asset.request.withCredentials).toBe(false);
  });

  it('never adds an Authorization header', () => {
    http.get('/api/auth/me').subscribe();

    expect(backend.expectOne('/api/auth/me').request.headers.has('Authorization')).toBe(false);
  });
});
