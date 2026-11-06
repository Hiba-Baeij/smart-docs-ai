import { signal } from '@angular/core';
import { of } from 'rxjs';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from './app.routes';
import { AuthStore } from './core/auth/auth.store';
import { Shell } from './core/shell/shell';
import { Login } from './features/auth/login';
import { Register } from './features/auth/register';
import { DocumentsApi } from './features/documents/documents.api';
import { ConversationsApi } from './features/chat/conversations.api';
import { NotFound } from './shared/not-found';

describe('routes', () => {
  let harness: RouterTestingHarness;
  /** The guard reads the session from the store; here it is a switch the test controls. */
  const signedIn = signal(true);
  const detailCalls: string[] = [];
  const documentsApi = {
    list: () => of({ items: [], page: 1, pageSize: 20, total: 0 }),
    detail: (id: string) => {
      detailCalls.push(id);
      return of({
        id,
        originalName: `Document ${id}`,
        fileType: 'pdf' as const,
        status: 'COMPLETED' as const,
        errorCode: null,
        chunkCount: 0,
        createdAt: '2026-10-31T00:00:00.000Z',
        extractedText: '',
        chunks: [],
      });
    },
  };

  beforeEach(async () => {
    signedIn.set(true);
    detailCalls.length = 0;
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        // The pages inside the shell read documents; here the API answers at once.
        { provide: DocumentsApi, useValue: documentsApi },
        {
          provide: ConversationsApi,
          useValue: { list: () => of({ items: [], page: 1, pageSize: 100, total: 0 }) },
        },
        {
          provide: AuthStore,
          useValue: {
            restore: () => Promise.resolve(),
            isAuthenticated: signedIn,
            // The shell shows the user's name and offers sign-out.
            user: signal({
              id: 'u1',
              name: 'Sara Ahmed',
              email: 'sara@example.com',
              createdAt: '',
            }),
            logout: () => Promise.resolve(),
          },
        },
      ],
    });
    harness = await RouterTestingHarness.create();
  });

  /** All the text rendered by the routed component and everything inside it. */
  const text = () => (harness.routeNativeElement as HTMLElement).textContent;
  const url = () => TestBed.inject(Router).url;

  it('serves /login and /register without the shell, signed in or not', async () => {
    signedIn.set(false);

    expect(await harness.navigateByUrl('/login', Login)).toBeInstanceOf(Login);
    expect(await harness.navigateByUrl('/register', Register)).toBeInstanceOf(Register);
    expect((harness.routeNativeElement as HTMLElement).querySelector('.shell-header')).toBeNull();
  });

  describe('signed in', () => {
    it('puts the documents list inside the shell', async () => {
      // For a nested route the "routed component" is the outermost one: the shell.
      expect(await harness.navigateByUrl('/documents', Shell)).toBeInstanceOf(Shell);

      expect(text()).toContain('SmartDocs AI'); // the shell's header
      expect(text()).toContain('Documents'); // the page inside it
    });

    it('reads the document id from the URL', async () => {
      await harness.navigateByUrl('/documents/42', Shell);
      await new Promise((resolve) => setTimeout(resolve));
      harness.detectChanges();

      expect(detailCalls).toEqual(['42']);
      expect(text()).toContain('Document 42');
    });

    it('redirects the start page to /documents', async () => {
      await harness.navigateByUrl('/', Shell);

      expect(url()).toBe('/documents');
    });

    it('loads the protected chat page inside the shell', async () => {
      await harness.navigateByUrl('/chat', Shell);
      await new Promise((resolve) => setTimeout(resolve));
      harness.detectChanges();

      expect(text()).toContain('Ask your documents');
      expect(text()).toContain('New conversation');
    });
  });

  describe('anonymous', () => {
    beforeEach(() => signedIn.set(false));

    it('is sent from a protected page to /login, remembering where it wanted to go', async () => {
      await harness.navigateByUrl('/documents/42?tab=text', Login);

      expect(url()).toBe('/login?returnUrl=%2Fdocuments%2F42%3Ftab%3Dtext');
    });

    it('is sent from the start page to /login', async () => {
      await harness.navigateByUrl('/', Login);

      expect(url()).toContain('/login?returnUrl=');
    });

    it('never sees the shell', async () => {
      await harness.navigateByUrl('/documents', Login);

      expect((harness.routeNativeElement as HTMLElement).querySelector('.shell-header')).toBeNull();
    });
  });

  it('shows the not-found page for an unknown URL, without the shell', async () => {
    expect(await harness.navigateByUrl('/no/such/page', NotFound)).toBeInstanceOf(NotFound);

    expect(text()).not.toContain('SmartDocs AI');
  });
});
