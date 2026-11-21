import { inject, Injectable, signal } from '@angular/core';
import type { MeResponse } from '@pracstack/api-contracts';
import { ApiClient } from '../api/api-client';

/**
 * The current user and their XP, from `GET /api/me`. `undefined` while
 * loading or when the API is unavailable (the app still works for
 * browser-only features such as Coding Challenges).
 */
@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly api = inject(ApiClient);
  private readonly state = signal<MeResponse | undefined>(undefined);
  readonly me = this.state.asReadonly();

  constructor() {
    this.refresh();
  }

  refresh(): void {
    this.api.get<MeResponse>('/me').then(
      (me) => this.state.set(me),
      () => this.state.set(undefined),
    );
  }
}
