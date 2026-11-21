import { inject } from '@angular/core';
import type { CanActivateFn } from '@angular/router';
import { AuthService } from './auth.service';

/**
 * Pages that record progress need a signed-in user. When signed out, starts
 * sign-in and returns here afterwards. Always passes in local mode.
 */
export const requireSignIn: CanActivateFn = (_route, state) =>
  inject(AuthService).ensureSignedIn(state.url);
