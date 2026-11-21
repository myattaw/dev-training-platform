import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { SkillProgress } from '@pracstack/api-contracts';
import { StatusIndicator } from '../../../shared/ui/status-indicator/status-indicator';

@Component({
  selector: 'app-skill-status',
  imports: [StatusIndicator],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-status-indicator [type]="display().type">{{
    display().label
  }}</app-status-indicator>`,
})
export class SkillStatus {
  /** `undefined` means the skill has never been practiced. */
  readonly progress = input<SkillProgress>();

  protected readonly display = computed(() => {
    const p = this.progress();
    if (!p || p.attempts === 0) return { type: 'neutral' as const, label: 'Not started' };
    if (p.mastered) return { type: 'success' as const, label: 'Mastered' };
    return { type: 'in-progress' as const, label: 'In progress' };
  });
}
