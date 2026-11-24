import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { safeReturnPath } from '../../../core/auth/pkce';
import { RuntimeConfigService, type SocialProvider } from '../../../core/config/runtime-config';
import { Alert } from '../../../shared/ui/alert/alert';
import { PracStackLogo } from '../../../shared/ui/logo/pracstack-logo';

const PLANNED_PROVIDERS = ['Apple', 'GitHub'] as const;

/**
 * Brand marks for the sign-in buttons, as each provider's guidelines ask:
 * Google's four-color "G" (Sign in with Google branding) and the GitHub mark
 * (https://github.com/logos; glyph from Simple Icons, CC0).
 */
const PROVIDER_ICONS: Readonly<
  Record<string, { viewBox: string; paths: readonly { d: string; fill: string }[] }>
> = {
  Google: {
    viewBox: '0 0 48 48',
    paths: [
      {
        fill: '#EA4335',
        d: 'M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z',
      },
      {
        fill: '#4285F4',
        d: 'M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z',
      },
      {
        fill: '#FBBC05',
        d: 'M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z',
      },
      {
        fill: '#34A853',
        d: 'M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z',
      },
    ],
  },
  GitHub: {
    viewBox: '0 0 24 24',
    paths: [
      {
        fill: 'currentColor',
        d: 'M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12',
      },
    ],
  },
};

/**
 * Sign in or create an account. Google and GitHub go straight to the provider
 * (through Cognito, with PKCE); email opens PracStack's Amazon Cognito managed
 * login, where passwords, email verification and password reset are handled.
 * This app never sees a password.
 */
@Component({
  selector: 'app-sign-in-page',
  imports: [RouterLink, Alert, PracStackLogo],
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

          @if (providers().length > 0) {
            <div class="providers">
              @for (provider of providers(); track provider) {
                <button
                  type="button"
                  class="provider-btn"
                  [attr.data-provider]="provider"
                  (click)="continueWith(provider)"
                >
                  @if (icons[provider]; as icon) {
                    <svg class="provider-icon" [attr.viewBox]="icon.viewBox" aria-hidden="true">
                      @for (p of icon.paths; track p.d) {
                        <path [attr.d]="p.d" [attr.fill]="p.fill" />
                      }
                    </svg>
                  }
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
  protected readonly icons = PROVIDER_ICONS;

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
