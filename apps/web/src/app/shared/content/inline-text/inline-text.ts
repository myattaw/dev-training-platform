import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { toSegments } from '../instruction-blocks/instruction-blocks';

/** One line of content text where `backticks` render as inline code. */
@Component({
  selector: 'app-inline-text',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@for (segment of segments(); track $index) {
    @if (segment.code) {
      <code>{{ segment.text }}</code>
    } @else {
      <ng-container>{{ segment.text }}</ng-container>
    }
  }`,
})
export class InlineText {
  readonly text = input.required<string>();
  protected readonly segments = computed(() => toSegments(this.text()));
}
