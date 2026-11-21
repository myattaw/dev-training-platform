import { Routes } from '@angular/router';

/**
 * Every page is lazy-loaded (`loadComponent`), so each route becomes its own
 * JavaScript chunk. Monaco is only downloaded when an exercise page opens.
 */
export const routes: Routes = [
  {
    path: '',
    title: 'typexercise: Learn TypeScript by doing',
    loadComponent: () => import('./pages/home/home').then((m) => m.Home),
  },
  {
    path: 'exercises',
    title: 'Exercises · typexercise',
    loadComponent: () => import('./pages/catalog/catalog').then((m) => m.Catalog),
  },
  {
    // `:id` is bound to the component's `id` input (see withComponentInputBinding).
    path: 'exercises/:id',
    loadComponent: () => import('./pages/exercise/exercise').then((m) => m.ExercisePage),
  },
  {
    path: '**',
    title: 'Not found · typexercise',
    loadComponent: () => import('./pages/not-found/not-found').then((m) => m.NotFound),
  },
];
