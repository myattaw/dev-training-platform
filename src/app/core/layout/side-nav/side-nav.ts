import { ChangeDetectionStrategy, Component, ElementRef, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { Icon, type IconName } from '../../../shared/ui/icon/icon';

interface NavItem {
  readonly label: string;
  readonly link: string;
  readonly icon: IconName;
  readonly exact: boolean;
}

/**
 * Primary navigation. Only areas that actually work are listed; Skill Mastery,
 * My Progress and Profile are added as they are built.
 */
const ITEMS: readonly NavItem[] = [
  { label: 'Dashboard', link: '/', icon: 'dashboard', exact: true },
  { label: 'Coding Challenges', link: '/challenges', icon: 'code', exact: false },
];

@Component({
  selector: 'app-side-nav',
  imports: [RouterLink, RouterLinkActive, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav aria-label="Primary">
      <ul>
        @for (item of items; track item.link) {
          <li>
            <a
              [routerLink]="item.link"
              routerLinkActive="active"
              ariaCurrentWhenActive="page"
              [routerLinkActiveOptions]="{ exact: item.exact }"
            >
              <app-icon [name]="item.icon" />
              {{ item.label }}
            </a>
          </li>
        }
      </ul>
    </nav>
  `,
  styles: `
    :host {
      display: block;
      width: var(--nav-width);
      border-right: 1px solid var(--color-border);
      background: var(--color-surface);
      overflow-y: auto;
    }
    ul {
      margin: 0;
      padding: var(--space-3) 0;
      list-style: none;
    }
    a {
      position: relative;
      display: flex;
      align-items: center;
      gap: var(--space-2);
      padding: 6px var(--space-5);
      color: var(--color-text-secondary);
    }
    a:hover {
      color: var(--color-text);
      background: var(--color-surface-hover);
      text-decoration: none;
    }
    a.active {
      color: var(--color-primary);
      font-weight: var(--font-weight-bold);
    }
    a.active::before {
      content: '';
      position: absolute;
      left: 0;
      top: 4px;
      bottom: 4px;
      width: 3px;
      border-radius: 0 2px 2px 0;
      background: var(--color-primary);
    }
    a:focus-visible {
      outline-offset: -2px;
    }
  `,
})
export class SideNav {
  protected readonly items = ITEMS;
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  focusFirstLink(): void {
    this.host.nativeElement.querySelector<HTMLElement>('a')?.focus();
  }
}
