import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icon } from '../../../shared/ui/icon/icon';
import { PracStackLogo } from '../../../shared/ui/logo/pracstack-logo';
import { AuthService } from '../../auth/auth.service';
import { SessionService } from '../../session/session.service';
import { LayoutService } from '../layout.service';

@Component({
  selector: 'app-top-nav',
  imports: [RouterLink, Icon, PracStackLogo],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header>
      <button
        type="button"
        class="btn btn--icon"
        aria-controls="side-nav"
        [attr.aria-expanded]="layout.navOpen()"
        [attr.aria-label]="layout.navOpen() ? 'Close navigation' : 'Open navigation'"
        (click)="toggleNav.emit()"
      >
        <app-icon
          [name]="layout.navOpen() && layout.overlayMode() ? 'close' : 'menu'"
          [size]="18"
        />
      </button>

      <a routerLink="/" class="brand" aria-label="PracStack home">
        <app-pracstack-logo [size]="24" />
      </a>

      @if (auth.status() === 'signed-out') {
        <p class="user account-actions">
          <button type="button" class="btn btn--sm" (click)="signIn()">Sign in</button>
          <button type="button" class="btn btn--sm btn--primary create" (click)="signIn(true)">
            Create account
          </button>
        </p>
      } @else if (session.me(); as me) {
        <p class="user">
          @if (me.user.mode === 'local-dev') {
            <span
              class="mode"
              title="Local development: no sign-in, progress is stored by the local API on this computer."
              >Local mode</span
            >
          }
          <span class="name">{{ me.user.displayName }}</span>
          <span class="xp text-secondary">{{ me.xp }} XP</span>
          @if (auth.status() === 'signed-in') {
            <button type="button" class="btn btn--sm" (click)="auth.signOut()">Sign out</button>
          }
        </p>
      }
    </header>
  `,
  styles: `
    header {
      position: sticky;
      top: 0;
      z-index: var(--z-header);
      display: flex;
      align-items: center;
      gap: var(--space-2);
      height: var(--header-height);
      padding: 0 var(--space-3);
      border-top: 3px solid var(--color-text);
      border-bottom: 1px solid var(--color-border);
      background: var(--color-surface);
    }
    .brand {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-1) var(--space-2);
      color: var(--color-text);
      font-size: var(--font-size-md);
      font-weight: var(--font-weight-bold);
      letter-spacing: -0.01em;
    }
    .brand:hover {
      text-decoration: none;
    }
    .user {
      display: inline-flex;
      align-items: center;
      gap: var(--space-3);
      margin: 0 0 0 auto;
      font-size: var(--font-size-sm);
    }
    .account-actions {
      gap: var(--space-2);
    }
    .mode {
      padding: 0 6px;
      border: 1px solid var(--color-warning);
      border-radius: var(--radius-sm);
      background: var(--color-warning-bg);
      color: var(--color-warning);
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-bold);
      cursor: help;
    }
    .name {
      font-weight: var(--font-weight-bold);
    }
    .xp {
      font-variant-numeric: tabular-nums;
    }
    @media (max-width: 599px) {
      .name {
        display: none;
      }
    }
    /* Narrow phones: Sign in only (Cognito's sign-in page links to sign-up). */
    @media (max-width: 379px) {
      .create {
        display: none;
      }
    }
  `,
})
export class TopNav {
  protected readonly layout = inject(LayoutService);
  protected readonly session = inject(SessionService);
  protected readonly auth = inject(AuthService);

  /** PracStack's sign-in page (or its create-account view); both return to this page. */
  protected signIn(signUp = false): void {
    this.auth.openSignInPage(undefined, signUp ? 'sign-up' : 'sign-in');
  }
  readonly toggleNav = output<void>();
}
