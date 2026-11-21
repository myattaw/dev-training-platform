import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icon } from '../icon/icon';

export interface Breadcrumb {
  readonly label: string;
  /** Omit for the current page (always the last item). */
  readonly link?: string | readonly string[];
}

@Component({
  selector: 'app-breadcrumbs',
  imports: [RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav aria-label="Breadcrumb">
      <ol>
        @for (item of items(); track $index; let last = $last) {
          <li>
            @if (item.link && !last) {
              <a [routerLink]="item.link">{{ item.label }}</a>
              <app-icon name="chevron-right" [size]="12" />
            } @else {
              <span aria-current="page">{{ item.label }}</span>
            }
          </li>
        }
      </ol>
    </nav>
  `,
  styles: `
    ol {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-1);
      margin: 0;
      padding: 0;
      list-style: none;
      font-size: var(--font-size-sm);
    }
    li {
      display: inline-flex;
      align-items: center;
      gap: var(--space-1);
      color: var(--color-text-secondary);
    }
    a {
      color: var(--color-primary);
    }
    [aria-current] {
      color: var(--color-text-secondary);
    }
  `,
})
export class Breadcrumbs {
  readonly items = input.required<readonly Breadcrumb[]>();
}
