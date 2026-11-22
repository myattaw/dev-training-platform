import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CATEGORY_LABELS, COMPETENCIES, type PlannedChallenge } from '@pracstack/content-model';
import { Badge } from '../../../shared/ui/badge/badge';
import { Icon } from '../../../shared/ui/icon/icon';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { Panel } from '../../../shared/ui/panel/panel';
import { DifficultyBadge } from './difficulty-badge';

/**
 * An announced challenge. There is deliberately no editor and no Start
 * button: nothing exists to practise yet. No release date is shown because
 * none is set.
 */
@Component({
  selector: 'app-coming-soon-challenge',
  imports: [RouterLink, Badge, Icon, PageHeader, Panel, DifficultyBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      [heading]="challenge().title"
      [breadcrumbs]="[
        { label: 'Coding Challenges', link: '/challenges' },
        { label: challenge().title },
      ]"
    />
    <app-panel>
      <p class="badges">
        <app-badge color="grey">Coming soon</app-badge>
        @if (challenge().access === 'pro') {
          <app-badge color="blue"><app-icon name="lock" [size]="12" /> Pro</app-badge>
        }
        <app-difficulty-badge [difficulty]="challenge().difficulty" />
        <span class="text-secondary">{{ categories[challenge().category] }}</span>
      </p>
      <p>{{ challenge().summary }}</p>
      <p class="text-secondary">
        Practises: {{ skills() }}. This challenge is not available yet, so there is nothing to open
        or run. No release date has been set.
      </p>
      <a class="btn" routerLink="/challenges">Browse available challenges</a>
    </app-panel>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      max-width: 960px;
    }
    .badges {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-2);
      margin-top: 0;
    }
    app-badge app-icon {
      margin-right: 3px;
    }
  `,
})
export class ComingSoonChallenge {
  readonly challenge = input.required<PlannedChallenge>();
  protected readonly categories = CATEGORY_LABELS;
  protected skills(): string {
    return this.challenge()
      .tags.map((t) => COMPETENCIES[t])
      .join(', ');
  }
}
