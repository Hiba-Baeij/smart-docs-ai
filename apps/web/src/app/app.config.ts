import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withViewTransitions } from '@angular/router';
import { routes } from './app.routes';
import { credentialsInterceptor } from './core/http/credentials.interceptor';
import { errorInterceptor } from './core/http/error.interceptor';
import { loadingInterceptor } from './core/http/loading.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      withViewTransitions({
        // The first navigation has nothing to fade from, and the browser holds rendering until a
        // transition's update finishes (session check + lazy chunk), which delays first paint.
        skipInitialTransition: true,
        // A hidden tab cannot run a transition (the browser rejects it and logs an error), and
        // nobody is watching: change the page at once.
        onViewTransitionCreated: ({ transition }) => {
          if (document.visibilityState === 'hidden') {
            transition.skipTransition();
          }
        },
      }),
    ),
    provideHttpClient(
      withInterceptors([credentialsInterceptor, loadingInterceptor, errorInterceptor]),
    ),
  ],
};
