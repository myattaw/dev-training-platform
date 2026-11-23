import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * The PracStack mark: three stacked layers, the top one carrying `</>`.
 * Drawn on a 32×32 grid; the round stroke on the top layer softens its corners.
 * public/favicon.svg and infra/assets/brand/pracstack-logo.svg use the same shapes.
 */
export const LOGO_MARK = {
  top: 'M16 1.5L30 9.5 16 17.5 2 9.5z',
  middle: 'M2.5 14.9L16 22.6l13.5-7.7',
  bottom: 'M2.5 20.4L16 28.1l13.5-7.7',
  code: ['M11.5 7.5l-2 2 2 2', 'M20.5 7.5l2 2-2 2', 'M17 6.5l-2 6'],
} as const;

/**
 * PracStack logo. `full` is the mark plus the wordmark (navbar); `icon` is the
 * mark alone (compact layouts). Decorative: label the link or button around it.
 * `surface="dark"` lightens the navy parts for dark backgrounds.
 */
@Component({
  selector: 'app-pracstack-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.on-dark]': "surface() === 'dark'" },
  template: `
    <svg
      class="mark"
      viewBox="0 0 32 32"
      [attr.width]="size()"
      [attr.height]="size()"
      aria-hidden="true"
      focusable="false"
    >
      <path [attr.d]="mark.bottom" class="layer bottom" />
      <path [attr.d]="mark.middle" class="layer middle" />
      <path [attr.d]="mark.top" class="top" />
      @for (d of mark.code; track d) {
        <path [attr.d]="d" class="code" />
      }
    </svg>
    @if (variant() === 'full') {
      <span class="wordmark"><span class="prac">Prac</span><span class="stack">Stack</span></span>
    }
  `,
  styles: `
    :host {
      --logo-blue: #0866d6;
      --logo-sky: #3baef0;
      --logo-ink: #102238;
      display: inline-flex;
      align-items: center;
      gap: 0.4em;
      line-height: 1;
    }
    :host(.on-dark) {
      --logo-ink: #dbe7f5;
    }
    /* Brand blue is too dark to read as text on navy. */
    :host(.on-dark) .stack {
      color: #5aaaf7;
    }
    .mark {
      flex: none;
      overflow: visible;
    }
    .top {
      fill: var(--logo-blue);
      stroke: var(--logo-blue);
      stroke-width: 2;
      stroke-linejoin: round;
    }
    .layer {
      fill: none;
      stroke-width: 3;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .middle {
      stroke: var(--logo-sky);
    }
    .bottom {
      stroke: var(--logo-ink);
    }
    .code {
      fill: none;
      stroke: #fff;
      stroke-width: 1.6;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .wordmark {
      font-weight: 800;
      letter-spacing: -0.02em;
      white-space: nowrap;
    }
    .prac {
      color: var(--logo-ink);
    }
    .stack {
      color: var(--logo-blue);
    }
  `,
})
export class PracStackLogo {
  readonly variant = input<'full' | 'icon'>('full');
  /** Height of the mark in pixels; the wordmark follows the surrounding font size. */
  readonly size = input(24);
  readonly surface = input<'light' | 'dark'>('light');
  protected readonly mark = LOGO_MARK;
}
