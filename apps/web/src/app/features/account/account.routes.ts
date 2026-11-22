import type { Routes } from '@angular/router';
import { requireSignIn } from '../../core/auth/require-sign-in.guard';

export const ACCOUNT_ROUTES: Routes = [
  {
    path: '',
    title: 'Account',
    canActivate: [requireSignIn],
    loadComponent: () => import('./pages/account-page').then((m) => m.AccountPage),
  },
  {
    path: 'sign-in',
    title: 'Sign in',
    loadComponent: () => import('./pages/sign-in-page').then((m) => m.SignInPage),
  },
];
