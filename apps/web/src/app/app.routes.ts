import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';

/**
 * Every component is loaded lazily with `loadComponent`, so the first bundle stays small.
 * The guard is on the shell, so it protects every page inside it.
 */
export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login').then((m) => m.Login),
  },
  {
    path: 'register',
    loadComponent: () => import('./features/auth/register').then((m) => m.Register),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./core/shell/shell').then((m) => m.Shell),
    children: [
      {
        path: 'documents',
        loadComponent: () =>
          import('./features/documents/documents-page').then((m) => m.DocumentsPage),
      },
      {
        path: 'documents/:id',
        loadComponent: () =>
          import('./features/documents/document-detail').then((m) => m.DocumentDetail),
      },
      {
        path: 'chat',
        loadComponent: () => import('./features/chat/chat-page').then((m) => m.ChatPage),
      },
      { path: '', pathMatch: 'full', redirectTo: 'documents' },
    ],
  },
  {
    path: '**',
    loadComponent: () => import('./shared/not-found').then((m) => m.NotFound),
  },
];
