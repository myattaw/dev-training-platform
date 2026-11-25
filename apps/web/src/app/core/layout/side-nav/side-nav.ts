import { ChangeDetectionStrategy, Component, ElementRef, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { Icon, type IconName } from '../../../shared/ui/icon/icon';

interface NavItem {
  readonly label: string;
  readonly link: string;
  readonly icon: IconName;
  readonly exact: boolean;
}

interface NavGroup {
  /** Visible group heading; the first group has none. */
  readonly heading?: string;
  readonly items: readonly NavItem[];
}

/**
 * Primary navigation. Only areas that actually work are listed; planned
 * features appear inside the pages they belong to, marked Coming soon.
 * Each area appears once: practice in Practice, goal-oriented preparation
 * (a company, a job role) in Career Preparation.
 */
const GROUPS: readonly NavGroup[] = [
  { items: [{ label: 'Dashboard', link: '/', icon: 'dashboard', exact: true }] },
  {
    heading: 'Practice',
    items: [
      { label: 'Skill Mastery', link: '/skills', icon: 'target', exact: false },
      { label: 'Coding Challenges', link: '/challenges', icon: 'code', exact: false },
      {
        label: 'Web Development Challenges',
        link: '/web-challenges',
        icon: 'terminal',
        exact: false,
      },
      { label: 'Enterprise Scenarios', link: '/scenarios', icon: 'workflow', exact: false },
    ],
  },
  {
    heading: 'Career Preparation',
    items: [
      { label: 'Company Interview Prep', link: '/companies', icon: 'building', exact: false },
      { label: 'Job Role Preparation', link: '/roles', icon: 'briefcase', exact: false },
    ],
  },
  {
    heading: 'You',
    items: [
      { label: 'My Progress', link: '/progress', icon: 'check-circle', exact: false },
      { label: 'Account', link: '/account', icon: 'user', exact: false },
    ],
  },
];

@Component({
  selector: 'app-side-nav',
  imports: [RouterLink, RouterLinkActive, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav aria-label="Primary">
      @for (group of groups; track $index) {
        @if (group.heading) {
          <h2 class="group-heading" [id]="'nav-group-' + $index">{{ group.heading }}</h2>
        }
        <ul [attr.aria-labelledby]="group.heading ? 'nav-group-' + $index : null">
          @for (item of group.items; track item.link) {
            <li>
              <a
                [routerLink]="item.link"
                routerLinkActive="active"
                ariaCurrentWhenActive="page"
                [routerLinkActiveOptions]="{ exact: item.exact }"
                [title]="item.label"
              >
                <app-icon [name]="item.icon" />
                <span class="label">{{ item.label }}</span>
              </a>
            </li>
          }
        </ul>
      }
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
    nav {
      padding: var(--space-3) 0;
    }
    .group-heading {
      margin: var(--space-4) 0 var(--space-1);
      padding: 0 var(--space-5);
      color: var(--color-text-secondary);
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-bold);
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    ul {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .label {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    a {
      position: relative;
      display: flex;
      align-items: center;
      gap: var(--space-3);
      min-height: 36px;
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
  protected readonly groups = GROUPS;
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  focusFirstLink(): void {
    this.host.nativeElement.querySelector<HTMLElement>('a')?.focus();
  }
}
