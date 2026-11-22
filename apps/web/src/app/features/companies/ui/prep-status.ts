import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { CompanyPrepStatus, ReportedQuestionStatus } from '@pracstack/api-contracts';
import {
  StatusIndicator,
  type StatusType,
} from '../../../shared/ui/status-indicator/status-indicator';

const PREP: Readonly<Record<CompanyPrepStatus, { type: StatusType; label: string }>> = {
  'not-started': { type: 'neutral', label: 'Not started' },
  'in-progress': { type: 'in-progress', label: 'In progress' },
  completed: { type: 'success', label: 'Completed' },
};

/** Preparation status for a company. */
@Component({
  selector: 'app-prep-status',
  imports: [StatusIndicator],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-status-indicator [type]="display().type">{{
    display().label
  }}</app-status-indicator>`,
})
export class PrepStatus {
  readonly status = input.required<CompanyPrepStatus>();
  protected readonly display = computed(() => PREP[this.status()]);
}

export const QUESTION_STATUS_LABELS: Readonly<Record<ReportedQuestionStatus, string>> = {
  'not-started': 'Not started',
  'reviewed-externally': 'Reviewed externally',
  'solved-externally': 'Solved externally',
};

const QUESTION: Readonly<Record<ReportedQuestionStatus, StatusType>> = {
  'not-started': 'neutral',
  'reviewed-externally': 'info',
  'solved-externally': 'success',
};

/**
 * The learner's own mark on an external question. PracStack cannot see the
 * provider, so this is never "solved" in the PracStack sense.
 */
@Component({
  selector: 'app-question-status',
  imports: [StatusIndicator],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-status-indicator [type]="type()">{{ label() }}</app-status-indicator>`,
})
export class QuestionStatus {
  readonly status = input.required<ReportedQuestionStatus>();
  protected readonly type = computed(() => QUESTION[this.status()]);
  protected readonly label = computed(() => QUESTION_STATUS_LABELS[this.status()]);
}
