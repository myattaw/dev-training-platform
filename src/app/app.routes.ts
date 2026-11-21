import { type Routes } from '@angular/router';

/**
 * Every feature is lazy-loaded, so each becomes its own JavaScript chunk.
 * Monaco is only downloaded when a coding workspace opens.
 */
export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: 'Dashboard',
    loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.Dashboard),
  },
  {
    path: 'challenges',
    loadChildren: () =>
      import('./features/challenges/challenges.routes').then((m) => m.CHALLENGE_ROUTES),
  },
  // Links from before the Coding Challenges rename keep working.
  { path: 'exercises', pathMatch: 'full', redirectTo: 'challenges' },
  { path: 'exercises/:id', redirectTo: 'challenges/:id/workspace' },
  {
    path: '**',
    title: 'Page not found',
    loadComponent: () => import('./core/not-found/not-found').then((m) => m.NotFound),
  },
];
