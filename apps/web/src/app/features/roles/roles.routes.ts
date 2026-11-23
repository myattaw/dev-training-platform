import { inject } from '@angular/core';
import type { ResolveFn, Routes } from '@angular/router';
import { requireSignIn } from '../../core/auth/require-sign-in.guard';
import { RoleContent } from './data-access/role-content';

/** Never rejects: a failed lookup must not block navigation (the page shows the error). */
const roleTitle: ResolveFn<string> = (route) =>
  inject(RoleContent)
    .load()
    .then(
      (data) =>
        data.roles.find((r) => r.id === route.paramMap.get('roleId'))?.title ?? 'Role not found',
      () => 'Job role',
    );

/**
 * Job Role Preparation. Roles and the analyzer are public content and work
 * signed out; saving a target role or a plan needs an account (or local mode).
 */
export const ROLE_ROUTES: Routes = [
  {
    path: '',
    title: 'Job Role Preparation',
    loadComponent: () => import('./pages/catalog/role-catalog').then((m) => m.RoleCatalog),
  },
  {
    path: 'analyze',
    title: 'Job Description Analyzer',
    loadComponent: () => import('./pages/analyze/job-analyzer').then((m) => m.JobAnalyzer),
  },
  {
    path: 'plans/:planId',
    title: 'Saved preparation plan',
    canActivate: [requireSignIn],
    loadComponent: () => import('./pages/plan/saved-plan').then((m) => m.SavedPlanPage),
  },
  {
    path: ':roleId',
    title: roleTitle,
    loadComponent: () => import('./pages/detail/role-detail').then((m) => m.RoleDetail),
  },
];
