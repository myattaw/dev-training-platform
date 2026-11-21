import {
  type ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import {
  provideRouter,
  TitleStrategy,
  withComponentInputBinding,
  withInMemoryScrolling,
} from '@angular/router';

import { routes } from './app.routes';
import { ApiClient, FetchApiClient } from './core/api/api-client';
import { ContentRepository, HttpContentRepository } from './core/content/content-repository';
import { AppTitleStrategy } from './core/title-strategy';
import { RuntimeConfigService } from './core/config/runtime-config';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Deployment settings (sign-in mode) from /config.json, before anything calls the API.
    provideAppInitializer(() => inject(RuntimeConfigService).load()),
    provideRouter(
      routes,
      // Route and query params like `:id` or `?q=` are passed straight into component `input()`s.
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'top' }),
    ),
    { provide: TitleStrategy, useExisting: AppTitleStrategy },
    { provide: ContentRepository, useClass: HttpContentRepository },
    { provide: ApiClient, useClass: FetchApiClient },
  ],
};
