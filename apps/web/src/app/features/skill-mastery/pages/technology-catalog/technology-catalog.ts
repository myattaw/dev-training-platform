import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { asyncResource } from '../../../../shared/async/async-state';
import { Alert } from '../../../../shared/ui/alert/alert';
import { EmptyState } from '../../../../shared/ui/empty-state/empty-state';
import { LoadingState } from '../../../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../../../shared/ui/page-header/page-header';
import { Panel } from '../../../../shared/ui/panel/panel';
import { SkillCatalog } from '../../data-access/skill-catalog';

@Component({
  selector: 'app-technology-catalog',
  imports: [RouterLink, Alert, EmptyState, LoadingState, PageHeader, Panel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      heading="Skill Mastery"
      description="Practice one concept at a time. Questions get harder as your mastery score rises, and 100 means you have shown you know it."
    />

    @let state = technologies.state();
    @if (state.status === 'loading') {
      <app-loading-state label="Loading technologies…" />
    } @else if (state.status === 'error') {
      <app-alert type="error" heading="Technologies could not be loaded">
        {{ state.error }}
        <button alertAction type="button" class="btn btn--sm" (click)="technologies.reload()">
          Try again
        </button>
      </app-alert>
    } @else if (state.value.length === 0) {
      <app-panel><app-empty-state heading="No technologies yet" /></app-panel>
    } @else {
      <div class="grid">
        @for (tech of state.value; track tech.id) {
          <app-panel [heading]="tech.name" [description]="tech.skillCount + ' skills'">
            <p class="description">{{ tech.description }}</p>
            <a panelFooter [routerLink]="[tech.id]">View {{ tech.name }} skills</a>
          </app-panel>
        }
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
      max-width: var(--content-max-width);
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: var(--space-5);
    }
    .description {
      color: var(--color-text-secondary);
    }
  `,
})
export class TechnologyCatalog {
  private readonly catalog = inject(SkillCatalog);
  protected readonly technologies = asyncResource(
    () => null,
    () => this.catalog.technologies(),
  );
}
