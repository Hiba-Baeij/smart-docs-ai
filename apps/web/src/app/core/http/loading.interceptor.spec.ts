import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { LoadingService } from '../loading/loading.service';
import { skipGlobalLoading } from './http-context';
import { loadingInterceptor } from './loading.interceptor';

describe('loadingInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let loading: LoadingService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([loadingInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
    loading = TestBed.inject(LoadingService);
  });

  afterEach(() => backend.verify());

  it('counts a request until it succeeds', () => {
    http.get('/api/a').subscribe();
    expect(loading.pending()).toBe(1);

    backend.expectOne('/api/a').flush({});
    expect(loading.pending()).toBe(0);
  });

  it('counts a request until it fails', () => {
    http.get('/api/a').subscribe({ error: () => undefined });
    backend.expectOne('/api/a').flush('no', { status: 500, statusText: 'Server Error' });

    expect(loading.active()).toBe(false);
  });

  it('stops counting a request that is cancelled', () => {
    const subscription = http.get('/api/a').subscribe();
    expect(loading.active()).toBe(true);

    subscription.unsubscribe();
    expect(loading.active()).toBe(false);
    backend.expectOne('/api/a');
  });

  it('counts parallel requests separately', () => {
    http.get('/api/a').subscribe();
    http.get('/api/b').subscribe();
    expect(loading.pending()).toBe(2);

    backend.expectOne('/api/a').flush({});
    expect(loading.active()).toBe(true);
    backend.expectOne('/api/b').flush({});
    expect(loading.active()).toBe(false);
  });

  it('leaves out a request marked SKIP_GLOBAL_LOADING', () => {
    http.get('/api/poll', { context: skipGlobalLoading() }).subscribe();

    expect(loading.active()).toBe(false);
    backend.expectOne('/api/poll').flush({});
  });
});

describe('LoadingService', () => {
  it('ignores a second end of the same operation', () => {
    const loading = TestBed.inject(LoadingService);
    const endFirst = loading.start();
    loading.start();

    endFirst();
    endFirst();

    expect(loading.pending()).toBe(1);
  });
});
