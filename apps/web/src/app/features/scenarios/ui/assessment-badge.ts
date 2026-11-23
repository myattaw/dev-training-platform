import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { ScenarioAssessment } from '@pracstack/content-model';
import { Badge } from '../../../shared/ui/badge/badge';

const LABELS: Readonly<Record<ScenarioAssessment, { label: string; title: string }>> = {
  executable: { label: 'Code graded', title: 'Every task is code run against hidden tests' },
  mixed: {
    label: 'Code + assessment',
    title: 'Some tasks are code run against hidden tests; others are graded questions',
  },
  structured: {
    label: 'Structured assessment',
    title: 'Graded questions about the artifacts; nothing is executed',
  },
};

/** How a scenario is graded, stated plainly. */
@Component({
  selector: 'app-assessment-badge',
  imports: [Badge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-badge
    [color]="assessment() === 'structured' ? 'grey' : 'blue'"
    [attr.title]="info().title"
    >{{ info().label }}</app-badge
  >`,
})
export class AssessmentBadge {
  readonly assessment = input.required<ScenarioAssessment>();
  protected readonly info = computed(() => LABELS[this.assessment()]);
}
