import { ChangeDetectionStrategy, Component } from '@angular/core';

/** The honest limit of any preparation path, shown wherever progress is. */
@Component({
  selector: 'app-experience-note',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p class="text-secondary">
      A preparation path helps you practice what a role asks for. Completing it shows practice on
      PracStack; it is not professional experience and does not guarantee an interview or a job.
    </p>
  `,
  styles: `
    p {
      margin: 0;
      font-size: var(--font-size-sm);
      max-width: 90ch;
    }
  `,
})
export class ExperienceNote {}
