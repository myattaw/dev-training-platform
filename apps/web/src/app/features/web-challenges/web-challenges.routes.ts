import { inject } from '@angular/core';
import type { ActivatedRouteSnapshot, ResolveFn, Routes } from '@angular/router';
import { FULL_BLEED } from '../../core/layout/route-data';
import { WebChallengesService } from './data-access/web-challenges.service';

/** Never rejects: a failed lookup must not block navigation (the page shows the error). */
function titleOf(route: ActivatedRouteSnapshot): Promise<string> {
  return inject(WebChallengesService)
    .summary(route.paramMap.get('id') ?? '')
    .then(
      (summary) => summary?.title ?? 'Web challenge not found',
      () => 'Web challenge',
    );
}

const detailTitle: ResolveFn<string> = (route) => titleOf(route);
const workspaceTitle: ResolveFn<string> = (route) =>
  titleOf(route).then((title) => `${title} · Workspace`);

export const WEB_CHALLENGE_ROUTES: Routes = [
  {
    path: '',
    title: 'Web Development Challenges',
    loadComponent: () => import('./pages/web-challenge-catalog').then((m) => m.WebChallengeCatalog),
  },
  {
    path: ':id',
    title: detailTitle,
    loadComponent: () => import('./pages/web-challenge-detail').then((m) => m.WebChallengeDetail),
  },
  {
    path: ':id/:framework/workspace',
    title: workspaceTitle,
    data: { [FULL_BLEED]: true },
    loadComponent: () => import('./pages/web-workspace').then((m) => m.WebWorkspace),
  },
];
