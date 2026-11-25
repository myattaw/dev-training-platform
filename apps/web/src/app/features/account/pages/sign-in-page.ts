import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { safeReturnPath } from '../../../core/auth/pkce';
import { RuntimeConfigService, type SocialProvider } from '../../../core/config/runtime-config';
import { Alert } from '../../../shared/ui/alert/alert';
import { PracStackLogo } from '../../../shared/ui/logo/pracstack-logo';
import { ProviderIcon } from '../../../shared/ui/provider-icon/provider-icon';

const PLANNED_PROVIDERS = ['Apple', 'GitHub'] as const;

/**
 * Sign in or create an account. Google and GitHub go straight to the provider
 * (through Cognito, with PKCE); email opens PracStack's Amazon Cognito managed
 * login, where passwords, email verification and password reset are handled.
 * This app never sees a password.
 */
@Component({
  selector: 'app-sign-in-page',
  imports: [RouterLink, Alert, PracStackLogo, ProviderIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (auth.status()) {
      @case ('local') {
        <h1 class="sr-only">Sign in to PracStack</h1>
        <app-alert type="info" heading="Local mode: no sign-in needed">
          This copy of PracStack uses the local development API, where everyone is the "Local
          developer" user. Sign-in is available when PracStack runs with Amazon Cognito.
        </app-alert>
        <p><a routerLink="/account">Go to your account</a></p>
      }
      @case ('signed-in') {
        <h1 class="sr-only">Sign in to PracStack</h1>
        <app-alert type="success" heading="You are signed in">
          <a routerLink="/account">Go to your account</a>.
        </app-alert>
      }
      @default {
        <div class="card">
          <app-pracstack-logo class="logo" [size]="32" />
          <h1>{{ signUp() ? 'Create your PracStack account' : 'Sign in to PracStack' }}</h1>
          <p class="lede text-secondary">
            {{
              signUp()
                ? 'Free. Your progress is saved to your account on every device.'
                : 'Welcome back. Pick up where you left off.'
            }}
          </p>

          @if (providers().length > 0 || comingSoon().length > 0) {
            <div class="providers">
              @for (provider of providers(); track provider) {
                <button
                  type="button"
                  class="provider-btn"
                  [attr.data-provider]="provider"
                  (click)="continueWith(provider)"
                >
                  <app-provider-icon class="provider-icon" [provider]="provider" />
                  <span>Continue with {{ provider }}</span>
                </button>
              }
              <!-- Planned providers: shown disabled until they are configured. -->
              @for (provider of comingSoon(); track provider) {
                <button
                  type="button"
                  class="provider-btn"
                  disabled
                  [attr.aria-describedby]="'soon-' + provider"
                >
                  <span>Continue with {{ provider }}</span>
                  <span class="soon" [id]="'soon-' + provider">Coming soon</span>
                </button>
              }
            </div>
            <p class="divider text-secondary"><span>or</span></p>
          }

          <button type="button" class="email-btn" (click)="withEmail()">
            {{ signUp() ? 'Sign up with email' : 'Sign in with email' }}
          </button>

          <p class="switch">
            @if (signUp()) {
              Already have an account?
              <a routerLink="/account/sign-in" [queryParams]="switchParams()">Sign in</a>
            } @else {
              New to PracStack?
              <a routerLink="/account/sign-in" [queryParams]="switchParams()">Create an account</a>
            }
          </p>
          <p class="fine text-secondary">
            @if (providers().length > 0) {
              New here? Google and GitHub create your account too.
            }
            Email sign-in, verification codes and password resets are handled by Amazon Cognito;
            PracStack never sees your password.
          </p>
        </div>
      }
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-4);
      padding: var(--space-6) var(--space-3);
    }
    .card {
      width: 100%;
      max-width: 420px;
      padding: var(--space-6) var(--space-5);
      border: 1px solid var(--color-border-divider);
      border-radius: 12px;
      background: var(--color-background-container, #fff);
      box-shadow: 0 1px 3px rgb(0 0 0 / 6%);
      text-align: center;
    }
    .logo {
      display: inline-flex;
      margin-bottom: var(--space-4);
    }
    h1 {
      margin: 0 0 var(--space-1);
      font-size: var(--font-size-xl, 1.5rem);
    }
    .lede {
      margin: 0 0 var(--space-5);
    }
    .providers {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }
    .provider-btn,
    .email-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-3);
      width: 100%;
      min-height: 48px;
      padding: 0 var(--space-4);
      border-radius: 8px;
      font: inherit;
      font-size: var(--font-size-md, 1rem);
      font-weight: var(--font-weight-bold);
      cursor: pointer;
      transition:
        background-color 0.15s,
        border-color 0.15s;
    }
    .provider-btn {
      position: relative;
      border: 1px solid var(--color-border-input, #8c8c94);
      background: var(--color-background-container, #fff);
      color: var(--color-text, #16191f);
    }
    .provider-btn:hover:not(:disabled) {
      background: var(--color-background-hover, #f2f8fd);
      border-color: var(--color-primary);
    }
    .provider-icon {
      position: absolute;
      left: var(--space-4);
      width: 22px;
      height: 22px;
    }
    .provider-btn:disabled {
      cursor: not-allowed;
      opacity: 0.55;
    }
    .email-btn {
      border: 1px solid var(--color-primary);
      background: var(--color-primary);
      color: #fff;
    }
    .email-btn:hover {
      filter: brightness(0.92);
    }
    .provider-btn:focus-visible,
    .email-btn:focus-visible {
      outline: 2px solid var(--color-primary);
      outline-offset: 2px;
    }
    .soon {
      font-size: var(--font-size-sm);
      font-weight: normal;
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
      border-top: 1px solid var(--color-border-divider);
    }
    .switch {
      margin: var(--space-4) 0 var(--space-2);
    }
    .fine {
      margin: 0;
      font-size: var(--font-size-sm);
    }
  `,
})
export class SignInPage {
  /** Where to return after signing in (`?returnTo=`); only same-site paths are used. */
  readonly returnTo = input<string>();
  /** `?mode=signup` opens the create-account view. */
  readonly mode = input<string>();
  protected readonly auth = inject(AuthService);
  private readonly runtime = inject(RuntimeConfigService);

  protected readonly signUp = computed(() => this.mode() === 'signup');
  /** Social sign-in configured for this deployment (config.json), e.g. Google. */
  protected readonly providers = computed<readonly SocialProvider[]>(() => {
    const auth = this.runtime.config().auth;
    return auth.mode === 'cognito' ? (auth.providers ?? []) : [];
  });
  /**
   * Planned social sign-in, shown as disabled "Coming soon" buttons. Apple is a
   * Cognito built-in provider; GitHub goes through the OIDC bridge (docs/accounts-and-auth.md).
   * To turn one on: add it to SOCIAL_PROVIDERS, configure it in Cognito, and list
   * it in config.json; it then moves from here to the enabled buttons above.
   */
  protected readonly comingSoon = computed<readonly string[]>(() =>
    PLANNED_PROVIDERS.filter((p) => !(this.providers() as readonly string[]).includes(p)),
  );
  /** Query parameters for the sign-in ↔ create-account switch (keeps the return path). */
  protected readonly switchParams = computed(() => ({
    ...(this.returnTo() ? { returnTo: this.returnTo() } : {}),
    ...(this.signUp() ? {} : { mode: 'signup' }),
  }));

  protected withEmail(): void {
    void this.auth.signIn(this.returnPath(), { signUp: this.signUp() });
  }

  protected continueWith(provider: SocialProvider): void {
    void this.auth.signIn(this.returnPath(), { provider });
  }

  private returnPath(): string {
    return safeReturnPath(this.returnTo() ?? '/account');
  }
}
