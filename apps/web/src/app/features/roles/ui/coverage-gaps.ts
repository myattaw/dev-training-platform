import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  COVERAGE_LABELS,
  type DetectedTerm,
  isDirectCoverage,
  type PlanRequirement,
  PRIORITY_LABELS,
  REQUIREMENT_LABELS,
} from '@pracstack/content-model';
import { Badge } from '../../../shared/ui/badge/badge';
import {
  type ActivityIndex,
  type ActivityView,
  resolveActivity,
} from '../data-access/role-content';

interface GapView {
  readonly term: DetectedTerm;
  readonly why: string;
  readonly related: readonly ActivityView[];
  readonly direct: readonly ActivityView[];
  readonly externalRecommended: boolean;
}

/**
 * What PracStack does not (fully) cover, per requirement: why it matters,
 * what related practice exists, what is not covered, and where to study it
 * (official documentation only). Nothing is silently dropped.
 */
@Component({
  selector: 'app-coverage-gaps',
  imports: [RouterLink, Badge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (gaps().length === 0) {
      <p class="text-secondary">
        Everything detected has direct practice on PracStack. Hands-on practice and knowledge
        questions are still not the same as using a technology at work.
      </p>
    } @else {
      <p class="text-secondary small">
        Requirements PracStack covers only partly, only through related practice, or not at all. The
        important ones stay in your plan as external study.
      </p>
      <ul class="gaps">
        @for (g of gaps(); track g.term.term.id) {
          <li class="gap" [attr.data-term]="g.term.term.id">
            <h3 class="gap-head">
              {{ g.term.term.label }}
              <app-badge [color]="g.term.coverage === 'none' ? 'grey' : 'amber'">{{
                coverageLabels[g.term.coverage]
              }}</app-badge>
              @if (priority(g.term.term.id); as p) {
                <span class="text-secondary small">{{ priorityLabels[p] }}</span>
              }
            </h3>
            <dl>
              <dt>Why it matters</dt>
              <dd>{{ g.why }}</dd>
              @if (g.direct.length > 0) {
                <dt>Practice on PracStack</dt>
                <dd>
                  @for (a of g.direct; track a.key; let last = $last) {
                    @if (a.link) {
                      <a [routerLink]="a.link">{{ a.title }}</a>
                    } @else {
                      {{ a.title }}
                    }
                    {{ last ? '' : ' · ' }}
                  }
                </dd>
              }
              @if (g.related.length > 0) {
                <dt>Related practice (transferable, not the same)</dt>
                <dd>
                  @for (a of g.related; track a.key; let last = $last) {
                    @if (a.link) {
                      <a [routerLink]="a.link">{{ a.title }}</a>
                    } @else {
                      {{ a.title }}
                    }
                    {{ last ? '' : ' · ' }}
                  }
                </dd>
              }
              @if (g.term.term.gap; as gap) {
                <dt>Not covered</dt>
                <dd>{{ gap.notCovered }}</dd>
                <dt>Study elsewhere</dt>
                <dd>
                  {{ g.externalRecommended ? 'Recommended.' : 'Optional.' }}
                  @for (r of gap.resources ?? []; track r.url) {
                    <a [href]="r.url" target="_blank" rel="noopener noreferrer">{{ r.label }}</a>.
                  }
                </dd>
              }
            </dl>
          </li>
        }
      </ul>
    }
  `,
  styles: `
    .gaps {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .gap {
      padding: var(--space-3) 0;
      border-top: 1px solid var(--color-border-divider);
    }
    .gap:first-child {
      border-top: none;
    }
    .gap-head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-2);
      margin: 0 0 var(--space-2);
      font-size: var(--font-size-base);
    }
    dl {
      display: grid;
      grid-template-columns: minmax(8rem, 14rem) 1fr;
      gap: var(--space-1) var(--space-3);
      margin: 0;
      font-size: var(--font-size-sm);
    }
    dt {
      font-weight: 600;
    }
    dd {
      margin: 0;
    }
    @media (max-width: 640px) {
      dl {
        grid-template-columns: 1fr;
      }
      dd {
        margin-bottom: var(--space-2);
      }
    }
    .small {
      font-size: var(--font-size-sm);
    }
  `,
})
export class CoverageGaps {
  readonly terms = input.required<readonly DetectedTerm[]>();
  readonly requirements = input.required<readonly PlanRequirement[]>();
  readonly index = input.required<ActivityIndex>();

  protected readonly coverageLabels = COVERAGE_LABELS;
  protected readonly priorityLabels = PRIORITY_LABELS;

  private readonly priorities = computed(
    () => new Map(this.requirements().map((r) => [r.termId, r.priority])),
  );

  protected readonly gaps = computed<readonly GapView[]>(() =>
    this.terms()
      .filter((t) => !isDirectCoverage(t.coverage) || t.term.gap)
      .map((t) => {
        const p = this.priorities().get(t.term.id);
        const first = t.evidence[0]?.text;
        return {
          term: t,
          why: `${REQUIREMENT_LABELS[t.requirement]} in the posting${first ? `: “${first}”` : '.'}`,
          direct: isDirectCoverage(t.coverage)
            ? []
            : t.term.practice.map((r) => resolveActivity(r, this.index())),
          related: (t.term.relatedPractice ?? []).map((r) => resolveActivity(r, this.index())),
          externalRecommended: (p === 'high' || p === 'medium') && !isDirectCoverage(t.coverage),
        };
      })
      .sort(
        (a, b) =>
          rank(this.priorities().get(b.term.term.id)) -
            rank(this.priorities().get(a.term.term.id)) || a.term.firstIndex - b.term.firstIndex,
      ),
  );

  protected priority(termId: string) {
    return this.priorities().get(termId);
  }
}

const rank = (p: string | undefined) =>
  p === 'high' ? 3 : p === 'medium' ? 2 : p === 'low' ? 1 : 0;
