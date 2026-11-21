import { inject } from '@angular/core';
import type { ActivatedRouteSnapshot, ResolveFn, Routes } from '@angular/router';
import { FULL_BLEED } from '../../core/layout/route-data';
import { ChallengeCatalogService } from './data-access/challenge-catalog.service';

function titleOf(route: ActivatedRouteSnapshot): string {
  return (
    inject(ChallengeCatalogService).getById(route.paramMap.get('id') ?? '')?.title ??
    'Challenge not found'
  );
}

const challengeTitle: ResolveFn<string> = (route) => titleOf(route);
const workspaceTitle: ResolveFn<string> = (route) => `${titleOf(route)} · Workspace`;

export const CHALLENGE_ROUTES: Routes = [
  {
    path: '',
    title: 'Coding Challenges',
    loadComponent: () =>
      import('./pages/catalog/challenge-catalog').then((m) => m.ChallengeCatalog),
  },
  {
    path: ':id',
    title: challengeTitle,
    loadComponent: () => import('./pages/detail/challenge-detail').then((m) => m.ChallengeDetail),
  },
  {
    path: ':id/workspace',
    title: workspaceTitle,
    data: { [FULL_BLEED]: true },
    loadComponent: () =>
      import('./pages/workspace/challenge-workspace').then((m) => m.ChallengeWorkspace),
  },
];
