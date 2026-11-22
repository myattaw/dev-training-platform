import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { safeReturnPath } from '../../../core/auth/pkce';
import { RuntimeConfigService, type SocialProvider } from '../../../core/config/runtime-config';
import { Alert } from '../../../shared/ui/alert/alert';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { Panel } from '../../../shared/ui/panel/panel';

/**
 * Sign in or create an account. Both open PracStack's Amazon Cognito managed
 * login (authorization code + PKCE): passwords, email verification and
 * password reset are handled on Cognito's pages, never by this app.
 */
@Component({
  selector: 'app-sign-in-page',
  imports: [RouterLink, Alert, PageHeader, Panel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header heading="Sign in to PracStack" />
    @switch (auth.status()) {
      @case ('local') {
        <app-alert type="info" heading="Local mode: no sign-in needed">
          This copy of PracStack uses the local development API, where everyone is the "Local
          developer" user. Sign-in is available when PracStack runs with Amazon Cognito.
        </app-alert>
        <p><a routerLink="/account">Go to your account</a></p>
      }
      @case ('signed-in') {
        <app-alert type="success" heading="You are signed in">
          <a routerLink="/account">Go to your account</a>.
        </app-alert>
      }
      @default {
        <app-panel>
          @if (providers().length > 0) {
            <div class="social">
              @for (provider of providers(); track provider) {
                <button type="button" class="btn social-btn" (click)="continueWith(provider)">
                  Continue with {{ provider }}
                </button>
              }
              <p class="text-secondary small">New here? This creates your PracStack account too.</p>
            </div>
            <p class="divider text-secondary"><span>or use your email</span></p>
          }
          <div class="choices">
            <section>
              <h2>Have an account?</h2>
              <p class="text-secondary">Sign in with your email and password.</p>
              <button type="button" class="btn btn--primary" (click)="signIn(false)">
                Sign in
              </button>
            </section>
            <section>
              <h2>New to PracStack?</h2>
              <p class="text-secondary">
                Create a free account. You will confirm your email address with a code.
              </p>
              <button type="button" class="btn" (click)="signIn(true)">Create account</button>
            </section>
          </div>
          <p class="text-secondary small">
            Forgot your password? Choose Sign in, then "Forgot your password?" on the sign-in page.
            Sign-in pages are provided by Amazon Cognito; PracStack never sees your password.
          </p>
        </app-panel>
      }
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      max-width: 760px;
    }
    .choices {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: var(--space-6);
      margin-bottom: var(--space-4);
    }
    h2 {
      margin: 0 0 var(--space-1);
      font-size: var(--font-size-md);
    }
    section p {
      margin: 0 0 var(--space-3);
    }
    .social {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: var(--space-2);
    }
    .social-btn {
      min-width: 240px;
      justify-content: center;
      font-weight: var(--font-weight-bold);
    }
    .divider {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      margin: var(--space-4) 0;
      font-size: var(--font-size-sm);
    }
    .divider::before,
    .divider::after {
      content: '';
      flex: 1;
      border-top: 1px solid var(--color-border);
    }
    .small {
      margin: var(--space-2) 0 0;
      font-size: var(--font-size-sm);
    }
  `,
})
export class SignInPage {
  /** Where to return after signing in (`?returnTo=`); only same-site paths are used. */
  readonly returnTo = input<string>();
  protected readonly auth = inject(AuthService);
  private readonly runtime = inject(RuntimeConfigService);
  /** Social sign-in configured for this deployment (config.json), e.g. Google. */
  protected readonly providers = computed<readonly SocialProvider[]>(() => {
    const auth = this.runtime.config().auth;
    return auth.mode === 'cognito' ? (auth.providers ?? []) : [];
  });

  protected signIn(signUp: boolean): void {
    void this.auth.signIn(this.returnPath(), { signUp });
  }

  protected continueWith(provider: SocialProvider): void {
    void this.auth.signIn(this.returnPath(), { provider });
  }

  private returnPath(): string {
    return safeReturnPath(this.returnTo() ?? '/account');
  }
}
