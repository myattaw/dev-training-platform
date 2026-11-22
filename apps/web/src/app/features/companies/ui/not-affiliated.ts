import { ChangeDetectionStrategy, Component } from '@angular/core';

/** The standing disclaimer for every Company Interview Prep page. */
@Component({
  selector: 'app-not-affiliated',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p>
      PracStack is not affiliated with, endorsed by or sponsored by the companies listed. Company
      questions come from a third-party dataset of reported associations: they are not official
      interview questions, and a listing does not mean a company currently asks them. Problem titles
      and links belong to their providers.
    </p>
  `,
  styles: `
    :host {
      display: block;
      max-width: 90ch;
      color: var(--color-text-secondary);
      font-size: var(--font-size-xs);
    }
    p {
      margin: 0;
    }
  `,
})
export class NotAffiliated {}
