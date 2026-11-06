import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { UserSummary } from '@smartdocs/contracts';
import { AuthApi } from './auth.api';

const USER: UserSummary = {
  id: 'u1',
  name: 'Sara Ahmed',
  email: 'sara@example.com',
  createdAt: '2026-10-31T00:00:00.000Z',
};

describe('AuthApi', () => {
  let api: AuthApi;
  let backend: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(AuthApi);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  it('register posts the body to /api/auth/register and unwraps { user }', () => {
    let result: UserSummary | undefined;
    const body = { name: 'Sara Ahmed', email: 'sara@example.com', password: 'a long password' };

    api.register(body).subscribe((user) => (result = user));
    const request = backend.expectOne('/api/auth/register');
    request.flush({ user: USER });

    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(body);
    expect(result).toEqual(USER);
  });

  it('login posts the credentials to /api/auth/login and unwraps { user }', () => {
    let result: UserSummary | undefined;
    const body = { email: 'sara@example.com', password: 'a long password' };

    api.login(body).subscribe((user) => (result = user));
    const request = backend.expectOne('/api/auth/login');
    request.flush({ user: USER });

    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(body);
    expect(result).toEqual(USER);
  });

  it('me reads /api/auth/me and returns the bare user', () => {
    let result: UserSummary | undefined;

    api.me().subscribe((user) => (result = user));
    const request = backend.expectOne('/api/auth/me');
    request.flush(USER);

    expect(request.request.method).toBe('GET');
    expect(result).toEqual(USER);
  });

  it('logout posts to /api/auth/logout', () => {
    let completed = false;

    api.logout().subscribe({ complete: () => (completed = true) });
    const request = backend.expectOne('/api/auth/logout');
    request.flush(null, { status: 204, statusText: 'No Content' });

    expect(request.request.method).toBe('POST');
    expect(completed).toBe(true);
  });
});
