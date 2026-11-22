import type { CanDeactivateFn, Routes } from '@angular/router';
import { requireSignIn } from '../../core/auth/require-sign-in.guard';
import { FULL_BLEED } from '../../core/layout/route-data';
import type { ConfirmsLeave } from './pages/session/interview-session';

/** Leaving a running timed session asks first (the clock keeps running). */
const confirmLeave: CanDeactivateFn<ConfirmsLeave> = (page) => page.confirmLeave();

/**
 * Company Interview Prep. The catalog explains sign-in itself; every other
 * page needs a signed-in user (the API serves company data to accounts only).
 */
export const COMPANY_ROUTES: Routes = [
  {
    path: '',
    title: 'Company Interview Prep',
    loadComponent: () => import('./pages/catalog/company-catalog').then((m) => m.CompanyCatalog),
  },
  {
    path: ':slug',
    title: 'Company',
    canActivate: [requireSignIn],
    loadComponent: () => import('./pages/detail/company-detail').then((m) => m.CompanyDetail),
  },
  {
    path: ':slug/practice',
    title: 'Timed practice',
    canActivate: [requireSignIn],
    loadComponent: () =>
      import('./pages/practice/timed-practice-setup').then((m) => m.TimedPracticeSetup),
  },
  {
    path: ':slug/practice/:sessionId',
    title: 'Timed session',
    canActivate: [requireSignIn],
    canDeactivate: [confirmLeave],
    data: { [FULL_BLEED]: true },
    loadComponent: () =>
      import('./pages/session/interview-session').then((m) => m.InterviewSession),
  },
  {
    path: ':slug/questions/:questionId',
    title: 'Reported question',
    canActivate: [requireSignIn],
    loadComponent: () => import('./pages/question/company-question').then((m) => m.CompanyQuestion),
  },
];
