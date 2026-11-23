import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { LOGO_MARK, WORDMARK } from './logo-paths';

/** Wordmark height relative to the mark (24px mark: 16px wordmark). */
const WORDMARK_SCALE = 2 / 3;

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
      <svg
        class="wordmark"
        [attr.viewBox]="wordmark.viewBox"
        [attr.height]="size() * wordmarkScale"
        aria-hidden="true"
        focusable="false"
      >
        <path [attr.d]="wordmark.prac" class="prac" />
        <path [attr.d]="wordmark.stack" class="stack" />
      </svg>
    }
  `,
  styles: `
    :host {
      --logo-blue: #0866d6;
      --logo-sky: #3baef0;
      --logo-ink: #102238;
      --logo-text-blue: var(--logo-blue);
      display: inline-flex;
      align-items: center;
      gap: 0.4em;
      line-height: 1;
    }
    /* Brand blue is too dark to read as text on navy. */
    :host(.on-dark) {
      --logo-ink: #dbe7f5;
      --logo-text-blue: #5aaaf7;
    }
    svg {
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
      width: auto;
    }
    .prac {
      fill: var(--logo-ink);
    }
    .stack {
      fill: var(--logo-text-blue);
    }
  `,
})
export class PracStackLogo {
  readonly variant = input<'full' | 'icon'>('full');
  /** Height of the mark in pixels; the wordmark is two thirds of it. */
  readonly size = input(24);
  readonly surface = input<'light' | 'dark'>('light');
  protected readonly mark = LOGO_MARK;
  protected readonly wordmark = WORDMARK;
  protected readonly wordmarkScale = WORDMARK_SCALE;
}
