import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { InstructionBlock } from '../../../models/exercise';

/** A run of text; `code: true` means it was wrapped in `backticks`. */
interface TextSegment {
  readonly text: string;
  readonly code: boolean;
}

type RenderedBlock =
  | { readonly kind: 'paragraph' | 'heading'; readonly segments: readonly TextSegment[] }
  | { readonly kind: 'list'; readonly items: readonly (readonly TextSegment[])[] }
  | { readonly kind: 'code'; readonly code: string };

/** Splits "use `Set` here" into [{text:'use '}, {text:'Set', code:true}, {text:' here'}]. */
function toSegments(text: string): TextSegment[] {
  return text
    .split('`')
    .map((part, i) => ({ text: part, code: i % 2 === 1 }))
    .filter((s) => s.text !== '');
}

@Component({
  selector: 'app-exercise-instructions',
  imports: [NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './exercise-instructions.html',
  styleUrl: './exercise-instructions.css',
})
export class ExerciseInstructions {
  readonly blocks = input.required<readonly InstructionBlock[]>();

  protected readonly rendered = computed<readonly RenderedBlock[]>(() =>
    this.blocks().map((block) => {
      switch (block.kind) {
        case 'paragraph':
        case 'heading':
          return { kind: block.kind, segments: toSegments(block.text) };
        case 'list':
          return { kind: 'list', items: block.items.map(toSegments) };
        case 'code':
          return block;
      }
    }),
  );
}
