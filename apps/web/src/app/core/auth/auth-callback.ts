import { ChangeDetectionStrategy, Component, inject, type OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Alert } from '../../shared/ui/alert/alert';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { AuthService, SignInError } from './auth.service';

/** Cognito redirects here after sign-in (`/auth/callback?code=…&state=…`). */
@Component({
  selector: 'app-auth-callback',
  imports: [Alert, LoadingState, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      @if (error(); as message) {
        <app-alert type="error" heading="Sign-in failed">
          {{ message }}
          <button alertAction type="button" class="btn btn--sm" (click)="retry()">
            Sign in again
          </button>
        </app-alert>
        <p><a routerLink="/">Back to the dashboard</a></p>
      } @else {
        <app-loading-state label="Signing you in…" />
      }
    </div>
  `,
  styles: `
    .page {
      max-width: 640px;
      padding: var(--page-padding);
    }
  `,
})
export class AuthCallback implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    try {
      const next = await this.auth.completeSignIn(new URLSearchParams(window.location.search));
      await this.router.navigateByUrl(next, { replaceUrl: true });
    } catch (err) {
      this.error.set(err instanceof SignInError ? err.message : 'Sign-in could not be completed.');
    }
  }

  protected retry(): void {
    this.auth.openSignInPage('/');
  }
}
