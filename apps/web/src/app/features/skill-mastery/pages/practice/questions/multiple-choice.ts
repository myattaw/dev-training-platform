import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import type { AnswerPayload, RevealedAnswer } from '@pracstack/api-contracts';
import type { MultipleChoiceQuestion } from '@pracstack/content-model';
import { InlineText } from '../../../../../shared/content/inline-text/inline-text';
import { Icon } from '../../../../../shared/ui/icon/icon';

@Component({
  selector: 'app-multiple-choice',
  imports: [InlineText, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fieldset [disabled]="revealed() !== undefined">
      <legend class="hint">
        {{ question().selection === 'single' ? 'Choose one answer.' : 'Choose all that apply.' }}
      </legend>
      @for (option of question().options; track option.id) {
        @let state = optionState(option.id);
        <label class="option" [class]="state">
          <input
            [type]="question().selection === 'single' ? 'radio' : 'checkbox'"
            [name]="'answer-' + question().id"
            [checked]="selected().includes(option.id)"
            (change)="toggle(option.id)"
          />
          <span class="text"><app-inline-text [text]="option.text" /></span>
          @if (state === 'correct' || state === 'missed') {
            <span class="tag tag--correct"><app-icon name="check-circle" />Correct answer</span>
          } @else if (state === 'wrong') {
            <span class="tag tag--wrong"><app-icon name="error-circle" />Your answer</span>
          }
        </label>
      }
    </fieldset>
  `,
  styles: `
    fieldset {
      display: grid;
      gap: var(--space-2);
      margin: 0;
      padding: 0;
      border: none;
    }
    .hint {
      margin-bottom: var(--space-2);
      padding: 0;
      color: var(--color-text-secondary);
      font-size: var(--font-size-sm);
    }
    .option {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-2) var(--space-3);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
      background: var(--color-surface);
      cursor: pointer;
    }
    .option:hover {
      background: var(--color-surface-hover);
    }
    .option:has(input:checked) {
      border-color: var(--color-primary);
      background: var(--color-surface-selected);
    }
    .option:has(input:focus-visible) {
      outline: 2px solid var(--color-focus-ring);
      outline-offset: 1px;
    }
    fieldset:disabled .option {
      cursor: default;
    }
    /* After grading, results override the "selected" highlight. */
    fieldset .option.correct,
    fieldset .option.missed {
      border-color: var(--color-success);
      background: var(--color-success-bg);
    }
    fieldset .option.wrong {
      border-color: var(--color-error);
      background: var(--color-error-bg);
    }
    input {
      margin: 0;
      accent-color: var(--color-primary);
    }
    .text {
      flex: 1;
    }
    .tag {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-bold);
      white-space: nowrap;
    }
    .tag--correct {
      color: var(--color-success);
    }
    .tag--wrong {
      color: var(--color-error);
    }
  `,
})
export class MultipleChoice {
  readonly question = input.required<MultipleChoiceQuestion>();
  readonly answer = model<AnswerPayload | null>(null);
  readonly revealed = input<RevealedAnswer>();

  protected readonly selected = computed(() => {
    const a = this.answer();
    return a?.format === 'multiple-choice' ? a.selected : [];
  });

  protected toggle(id: string): void {
    const current = this.selected();
    const selected =
      this.question().selection === 'single'
        ? [id]
        : current.includes(id)
          ? current.filter((x) => x !== id)
          : [...current, id];
    this.answer.set(selected.length > 0 ? { format: 'multiple-choice', selected } : null);
  }

  /** After grading: which options to mark. */
  protected optionState(id: string): 'correct' | 'missed' | 'wrong' | '' {
    const revealed = this.revealed();
    if (revealed?.format !== 'multiple-choice') return '';
    const isCorrect = revealed.correct.includes(id);
    const picked = this.selected().includes(id);
    if (isCorrect) return picked ? 'correct' : 'missed';
    return picked ? 'wrong' : '';
  }
}
