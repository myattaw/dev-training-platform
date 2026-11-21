import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icon } from '../../../shared/ui/icon/icon';
import { LayoutService } from '../layout.service';

@Component({
  selector: 'app-top-nav',
  imports: [RouterLink, Icon],
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
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
          <rect x="1" y="2.5" width="12" height="4" rx="1" class="layer-1" />
          <rect x="4" y="8" width="12" height="4" rx="1" class="layer-2" />
          <rect x="7" y="13.5" width="12" height="4" rx="1" class="layer-3" />
        </svg>
        <span>PracStack</span>
      </a>

      <p class="storage-note">
        <app-icon name="info" />
        <span>Progress is saved in this browser</span>
      </p>
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
    .layer-1 {
      fill: var(--color-primary);
    }
    .layer-2 {
      fill: var(--color-primary);
      opacity: 0.6;
    }
    .layer-3 {
      fill: var(--color-text);
    }
    .storage-note {
      display: inline-flex;
      align-items: center;
      gap: var(--space-1);
      margin-left: auto;
      color: var(--color-text-secondary);
      font-size: var(--font-size-sm);
    }
    @media (max-width: 599px) {
      .storage-note {
        display: none;
      }
    }
  `,
})
export class TopNav {
  protected readonly layout = inject(LayoutService);
  readonly toggleNav = output<void>();
}
