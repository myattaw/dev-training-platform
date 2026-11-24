import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import {
  CONFIDENCE_LABELS,
  COVERAGE_LABELS,
  type CoverageLevel,
  type DetectedTerm,
  type JobAnalysis,
  type PlanRequirement,
  PRIORITY_LABELS,
  type PreparationPriority,
  QUALIFICATION_LABELS,
  REQUIREMENT_LABELS,
} from '@pracstack/content-model';
import { Badge, type BadgeColor } from '../../../shared/ui/badge/badge';

const PRIORITY_COLORS: Readonly<Record<PreparationPriority, BadgeColor>> = {
  high: 'red',
  medium: 'amber',
  low: 'grey',
};
const COVERAGE_COLORS: Readonly<Record<CoverageLevel, BadgeColor>> = {
  executable: 'green',
  conceptual: 'blue',
  partial: 'amber',
  related: 'amber',
  none: 'grey',
};

/**
 * Detected requirements: how the posting asks for each (requirement level),
 * how important it is to prepare (priority), how PracStack covers it, and
 * the evidence (collapsed, with detection confidence). Alternative groups
 * let the learner choose which option to prepare.
 */
@Component({
  selector: 'app-requirements-table',
  imports: [Badge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (analysis().alternatives.length > 0) {
      <section class="alternatives" aria-labelledby="alternatives-heading">
        <h3 id="alternatives-heading" class="sub">Options: one of each is enough</h3>
        <ul class="plain">
          @for (g of analysis().alternatives; track g.id) {
            <li class="alt">
              <span>
                {{ g.kind === 'examples' ? 'Examples' : 'One of' }}:
                <strong>{{ labels(g.termIds) }}</strong>
                <span class="text-secondary">
                  ({{ levelLabels[g.level].toLowerCase()
                  }}{{ g.parentTermId ? ', for ' + label(g.parentTermId) : '' }})</span
                >
              </span>
              <label class="choose">
                Prepare
                <select class="input input--sm" (change)="onChoose(g.id, $event)">
                  @for (id of g.termIds; track id) {
                    <option [value]="id" [selected]="chosen()[g.id] === id">{{ label(id) }}</option>
                  }
                </select>
              </label>
            </li>
          }
        </ul>
      </section>
    }

    <div class="table-wrap">
      <table class="table">
        <caption class="sr-only">
          Detected requirements
        </caption>
        <thead>
          <tr>
            <th scope="col">Technology or competency</th>
            <th scope="col">In the posting</th>
            <th scope="col">Priority</th>
            <th scope="col">PracStack coverage</th>
          </tr>
        </thead>
        <tbody>
          @for (t of rows(); track t.term.id) {
            <tr [attr.data-term]="t.term.id">
              <th scope="row" class="name">
                {{ t.term.label }}
                @if (t.ambiguous) {
                  <app-badge color="amber">Ambiguous</app-badge>
                }
                <details class="evidence">
                  <summary>Evidence ({{ t.evidence.length }})</summary>
                  <ul class="quotes">
                    @for (e of t.evidence; track e.text) {
                      <li>
                        <q>{{ e.text }}</q>
                      </li>
                    }
                  </ul>
                  <p class="small text-secondary">
                    Detected with {{ confidenceLabels[t.confidence].toLowerCase() }} confidence{{
                      t.mentions > 1 ? ', mentioned ' + t.mentions + ' times' : ''
                    }}.
                    @if (t.ambiguous && t.term.ambiguity) {
                      {{ t.term.ambiguity.note }}
                    }
                  </p>
                  @if (t.term.note) {
                    <p class="small text-secondary">{{ t.term.note }}</p>
                  }
                </details>
              </th>
              <td>{{ levelLabels[t.requirement] }}</td>
              <td>
                @if (priorityOf(t.term.id); as p) {
                  <app-badge [color]="priorityColors[p]">{{ priorityLabels[p] }}</app-badge>
                } @else {
                  <span class="text-secondary small"
                    >Not in the plan (another option is chosen)</span
                  >
                }
              </td>
              <td>
                <app-badge [color]="coverageColors[t.coverage]">{{
                  coverageLabels[t.coverage]
                }}</app-badge>
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>

    @if (analysis().qualifications.length > 0 || analysis().experience.length > 0) {
      <section class="quals" aria-labelledby="quals-heading">
        <h3 id="quals-heading" class="sub">Other qualifications (not practiced or verified)</h3>
        <ul class="plain">
          @for (x of analysis().experience; track x.text) {
            <li>
              <span class="kind">Experience</span> <q>{{ x.text }}</q>
            </li>
          }
          @for (q of analysis().qualifications; track q.text) {
            <li>
              <span class="kind">{{ qualificationLabels[q.kind] }}</span> <q>{{ q.text }}</q>
            </li>
          }
        </ul>
        <p class="small text-secondary">
          PracStack cannot verify degrees, years of experience or work eligibility, and practice
          here is not professional experience.
        </p>
      </section>
    }
  `,
  styles: `
    .sub {
      margin: 0 0 var(--space-2);
      font-size: var(--font-size-base);
    }
    .alternatives,
    .quals {
      margin: var(--space-3) 0;
    }
    .plain {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .plain li {
      padding: var(--space-1) 0;
    }
    .alt {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: var(--space-2);
      border-bottom: 1px solid var(--color-border-divider);
    }
    .choose {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      font-size: var(--font-size-sm);
    }
    .table-wrap {
      overflow-x: auto;
    }
    .name {
      font-weight: 600;
      text-align: left;
    }
    .evidence {
      font-weight: normal;
      margin-top: 2px;
    }
    .evidence summary {
      cursor: pointer;
      color: var(--color-text-link, var(--color-primary));
      font-size: var(--font-size-sm);
    }
    .quotes {
      margin: var(--space-1) 0;
      padding-left: var(--space-4);
      font-size: var(--font-size-sm);
    }
    .kind {
      display: inline-block;
      min-width: 9rem;
      font-weight: 600;
      font-size: var(--font-size-sm);
    }
    .small {
      font-size: var(--font-size-sm);
      margin: var(--space-1) 0 0;
    }
  `,
})
export class RequirementsTable {
  readonly analysis = input.required<JobAnalysis>();
  /** The requirements in the plan (chosen alternatives only). */
  readonly requirements = input.required<readonly PlanRequirement[]>();
  /** Chosen member per alternative group. */
  readonly chosen = input.required<Readonly<Record<string, string>>>();
  readonly choose = output<{ groupId: string; termId: string }>();

  protected readonly levelLabels = REQUIREMENT_LABELS;
  protected readonly priorityLabels = PRIORITY_LABELS;
  protected readonly priorityColors = PRIORITY_COLORS;
  protected readonly coverageLabels = COVERAGE_LABELS;
  protected readonly coverageColors = COVERAGE_COLORS;
  protected readonly confidenceLabels = CONFIDENCE_LABELS;
  protected readonly qualificationLabels = QUALIFICATION_LABELS;

  private readonly priorities = computed(
    () => new Map(this.requirements().map((r) => [r.termId, r.priority])),
  );
  /** Most important first, then the posting's own order. */
  protected readonly rows = computed<readonly DetectedTerm[]>(() => {
    const rank = (t: DetectedTerm) =>
      ({ high: 3, medium: 2, low: 1 })[this.priorities().get(t.term.id) ?? 'low'] -
      (this.priorities().has(t.term.id) ? 0 : 1);
    return [...this.analysis().terms].sort(
      (a, b) => rank(b) - rank(a) || a.firstIndex - b.firstIndex,
    );
  });

  protected priorityOf(termId: string): PreparationPriority | undefined {
    return this.priorities().get(termId);
  }

  protected label(id: string): string {
    return this.analysis().terms.find((t) => t.term.id === id)?.term.label ?? id;
  }

  protected labels(ids: readonly string[]): string {
    return ids.map((id) => this.label(id)).join(', ');
  }

  protected onChoose(groupId: string, event: Event): void {
    this.choose.emit({ groupId, termId: (event.target as HTMLSelectElement).value });
  }
}
