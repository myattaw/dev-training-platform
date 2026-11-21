import { inject } from '@angular/core';
import type { ActivatedRouteSnapshot, ResolveFn, Routes } from '@angular/router';
import { SkillCatalog } from './data-access/skill-catalog';

/** Titles never reject: a failed lookup must not block navigation (pages show the error). */
const technologyTitle: ResolveFn<string> = (route) =>
  inject(SkillCatalog)
    .technologies()
    .then(
      (list) => list.find((t) => t.id === route.paramMap.get('technologyId'))?.name ?? 'Not found',
      () => 'Skill Mastery',
    );

function skillName(route: ActivatedRouteSnapshot): Promise<string> {
  return inject(SkillCatalog)
    .locate(route.paramMap.get('technologyId') ?? '', route.paramMap.get('skillId') ?? '')
    .then(
      (loc) => loc?.skill.name ?? 'Skill not found',
      () => 'Skill',
    );
}

export const SKILL_MASTERY_ROUTES: Routes = [
  {
    path: '',
    title: 'Skill Mastery',
    loadComponent: () =>
      import('./pages/technology-catalog/technology-catalog').then((m) => m.TechnologyCatalog),
  },
  {
    path: ':technologyId',
    title: technologyTitle,
    loadComponent: () =>
      import('./pages/technology-overview/technology-overview').then((m) => m.TechnologyOverview),
  },
  {
    path: ':technologyId/:skillId',
    title: (route) => skillName(route),
    loadComponent: () =>
      import('./pages/skill-overview/skill-overview').then((m) => m.SkillOverview),
  },
  {
    path: ':technologyId/:skillId/practice',
    title: (route) => skillName(route).then((name) => `Practice: ${name}`),
    loadComponent: () => import('./pages/practice/practice-page').then((m) => m.PracticePage),
  },
];
