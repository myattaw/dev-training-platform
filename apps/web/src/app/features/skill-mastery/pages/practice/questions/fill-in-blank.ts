import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { ANSWER_LIMITS, type AnswerPayload, type RevealedAnswer } from '@pracstack/api-contracts';
import { BLANK_PATTERN, type FillInBlankQuestion } from '@pracstack/content-model';

type Part =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'blank'; readonly id: string; readonly number: number };

/** Splits `let x: {{blank:type}} = 1;` into text and blank parts. */
export function templateParts(source: string): Part[] {
  const parts: Part[] = [];
  let last = 0;
  let number = 0;
  for (const match of source.matchAll(BLANK_PATTERN)) {
    if (match.index > last) parts.push({ kind: 'text', text: source.slice(last, match.index) });
    parts.push({ kind: 'blank', id: match[1] ?? '', number: ++number });
    last = match.index + match[0].length;
  }
  if (last < source.length) parts.push({ kind: 'text', text: source.slice(last) });
  return parts;
}

@Component({
  selector: 'app-fill-in-blank',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p class="hint text-secondary">Type the missing code into each box.</p>
    <pre
      class="code"
    ><code>@for (part of parts(); track $index) {@if (part.kind === 'text') {{{ part.text }}} @else {<input
        class="blank"
        spellcheck="false"
        autocomplete="off"
        [attr.aria-label]="'Blank ' + part.number + ' of ' + blankCount()"
        [maxLength]="maxLength"
        [size]="widthOf(part.id)"
        [value]="valueOf(part.id)"
        [readOnly]="revealed() !== undefined"
        [class.correct]="state(part.id) === 'correct'"
        [class.wrong]="state(part.id) === 'wrong'"
        (input)="onInput(part.id, $event)"
      />}}</code></pre>
    @if (correctBlanks(); as blanks) {
      <p class="field-label">Correct answers</p>
      <ol class="answers">
        @for (part of blankParts(); track part.id) {
          <li>
            <code>{{ blanks[part.id] }}</code>
          </li>
        }
      </ol>
    }
  `,
  styles: `
    .hint {
      margin-bottom: var(--space-2);
      font-size: var(--font-size-sm);
    }
    .code {
      margin: 0;
      padding: var(--space-3);
      border: 1px solid var(--color-border-divider);
      border-radius: var(--radius-sm);
      background: var(--color-surface-muted);
      overflow-x: auto;
      line-height: 28px;
    }
    .blank {
      min-width: 4ch;
      height: 24px;
      padding: 0 4px;
      border: 1px solid var(--color-border-strong);
      border-radius: var(--radius-sm);
      background: var(--color-surface);
      color: var(--color-text);
      font: inherit;
    }
    .blank:focus-visible {
      outline: 2px solid var(--color-focus-ring);
      outline-offset: 0;
    }
    .blank.correct {
      border-color: var(--color-success);
      background: var(--color-success-bg);
    }
    .blank.wrong {
      border-color: var(--color-error);
      background: var(--color-error-bg);
    }
    .answers {
      margin: var(--space-1) 0 0;
      padding-left: var(--space-5);
    }
    .field-label {
      margin-top: var(--space-4);
    }
  `,
})
export class FillInBlank {
  readonly question = input.required<FillInBlankQuestion>();
  readonly answer = model<AnswerPayload | null>(null);
  readonly revealed = input<RevealedAnswer>();

  protected readonly maxLength = ANSWER_LIMITS.maxBlankLength;
  protected readonly parts = computed(() => templateParts(this.question().template.source));
  protected readonly blankParts = computed(() =>
    this.parts().filter((p): p is Extract<Part, { kind: 'blank' }> => p.kind === 'blank'),
  );
  protected readonly blankCount = computed(() => this.blankParts().length);
  protected readonly values = computed<Readonly<Record<string, string>>>(() => {
    const a = this.answer();
    return a?.format === 'fill-in-blank' ? a.blanks : {};
  });
  private readonly revealedBlanks = computed(() => {
    const r = this.revealed();
    return r?.format === 'fill-in-blank' ? r : undefined;
  });
  protected readonly correctBlanks = computed(() => this.revealedBlanks()?.blanks);

  /** Missing keys are possible at runtime (blanks not yet typed in). */
  protected valueOf(id: string): string {
    return (this.values() as Partial<Record<string, string>>)[id] ?? '';
  }

  protected widthOf(id: string): number {
    return Math.max(6, this.valueOf(id).length + 1);
  }

  /** Per-blank result as graded by the server. */
  protected state(id: string): 'correct' | 'wrong' | '' {
    const result = this.revealedBlanks()?.blankResults[id];
    return result === undefined ? '' : result ? 'correct' : 'wrong';
  }

  protected onInput(id: string, event: Event): void {
    const blanks = { ...this.values(), [id]: (event.target as HTMLInputElement).value };
    const anyFilled = Object.values(blanks).some((v) => v.trim() !== '');
    this.answer.set(anyFilled ? { format: 'fill-in-blank', blanks } : null);
  }
}
