import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { ANSWER_LIMITS, type AnswerPayload, type RevealedAnswer } from '@pracstack/api-contracts';
import type { PredictOutputQuestion } from '@pracstack/content-model';

@Component({
  selector: 'app-predict-output',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <pre class="code"><code>{{ question().code.source }}</code></pre>
    <label class="field-label" [for]="inputId()">Output</label>
    <textarea
      class="input output"
      rows="3"
      spellcheck="false"
      autocomplete="off"
      [id]="inputId()"
      [maxLength]="maxLength"
      [value]="value()"
      [readOnly]="revealed() !== undefined"
      (input)="onInput($event)"
    ></textarea>
    <p class="note text-secondary">
      Type exactly what is printed. Separate lines with line breaks.
    </p>
    @if (expected(); as output) {
      <p class="field-label expected-label">Expected output</p>
      <pre class="code expected"><code>{{ output }}</code></pre>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .code {
      margin: 0 0 var(--space-4);
      padding: var(--space-3);
      border: 1px solid var(--color-border-divider);
      border-radius: var(--radius-sm);
      background: var(--color-surface-muted);
      overflow-x: auto;
      line-height: 20px;
    }
    .output {
      display: block;
      width: 100%;
      height: auto;
      padding: var(--space-2) var(--space-3);
      font-family: var(--font-mono);
      resize: vertical;
    }
    .note {
      margin-top: var(--space-1);
      font-size: var(--font-size-sm);
    }
    .expected-label {
      margin-top: var(--space-4);
    }
    .expected {
      border-color: var(--color-success);
      background: var(--color-success-bg);
    }
  `,
})
export class PredictOutput {
  readonly question = input.required<PredictOutputQuestion>();
  readonly answer = model<AnswerPayload | null>(null);
  readonly revealed = input<RevealedAnswer>();

  protected readonly maxLength = ANSWER_LIMITS.maxOutputLength;
  protected readonly inputId = computed(() => `output-${this.question().id}`);
  protected readonly value = computed(() => {
    const a = this.answer();
    return a?.format === 'predict-output' ? a.output : '';
  });
  protected readonly expected = computed(() => {
    const r = this.revealed();
    return r?.format === 'predict-output' ? r.output : undefined;
  });

  protected onInput(event: Event): void {
    const output = (event.target as HTMLTextAreaElement).value;
    this.answer.set(output.trim() === '' ? null : { format: 'predict-output', output });
  }
}
