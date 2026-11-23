import { inject } from '@angular/core';
import type { ResolveFn, Routes } from '@angular/router';
import { ScenarioService } from './data-access/scenario.service';

/** Never rejects: a failed lookup must not block navigation (the page shows the error). */
const scenarioTitle: ResolveFn<string> = (route) =>
  inject(ScenarioService)
    .catalog()
    .then(
      (all) => all.find((s) => s.id === route.paramMap.get('id'))?.title ?? 'Scenario not found',
      () => 'Enterprise Scenario',
    );

export const SCENARIO_ROUTES: Routes = [
  {
    path: '',
    title: 'Enterprise Scenarios',
    loadComponent: () => import('./pages/scenario-catalog').then((m) => m.ScenarioCatalog),
  },
  {
    path: ':id',
    title: scenarioTitle,
    loadComponent: () => import('./pages/scenario-detail').then((m) => m.ScenarioDetail),
  },
];
