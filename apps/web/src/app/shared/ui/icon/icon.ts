import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** A circle of radius 6.5 centred in the 16×16 box, as a path. */
const CIRCLE = 'M14.5 8a6.5 6.5 0 1 1-13 0a6.5 6.5 0 1 1 13 0';

interface IconDef {
  readonly paths: readonly string[];
  /** Filled glyphs (e.g. play) instead of stroked outlines. */
  readonly filled?: boolean;
}

/**
 * Original 16×16 stroke icons. Kept deliberately small: add an entry here
 * when a new icon is needed rather than pulling in an icon library.
 */
const ICONS = {
  menu: { paths: ['M2.5 4h11M2.5 8h11M2.5 12h11'] },
  close: { paths: ['M4 4l8 8M12 4l-8 8'] },
  'chevron-right': { paths: ['M6 3.5L10.5 8 6 12.5'] },
  'chevron-down': { paths: ['M3.5 6L8 10.5 12.5 6'] },
  search: { paths: ['M11.5 7a4.5 4.5 0 1 1-9 0a4.5 4.5 0 1 1 9 0', 'M10.3 10.3L14 14'] },
  dashboard: {
    paths: [
      'M2.5 2.5h4.5v4.5h-4.5z',
      'M9 2.5h4.5v4.5h-4.5z',
      'M2.5 9h4.5v4.5h-4.5z',
      'M9 9h4.5v4.5h-4.5z',
    ],
  },
  code: { paths: ['M5.5 4.5L2 8l3.5 3.5', 'M10.5 4.5L14 8l-3.5 3.5'] },
  'check-circle': { paths: [CIRCLE, 'M5.25 8.25l1.9 1.9 3.6-3.9'] },
  'error-circle': { paths: [CIRCLE, 'M6 6l4 4M10 6l-4 4'] },
  'in-progress': { paths: [CIRCLE, 'M8 4.5V8l2.5 1.5'] },
  'not-started': { paths: [CIRCLE] },
  warning: { paths: ['M8 2L14.5 13.5h-13z', 'M8 6.5v3', 'M8 11.6v.1'] },
  info: { paths: [CIRCLE, 'M8 7.25v4', 'M8 4.9v.1'] },
  play: { paths: ['M4.5 3v10l8.5-5z'], filled: true },
  reset: { paths: ['M2.75 3.5v3.25h3.25', 'M3.1 6.5A5.25 5.25 0 1 1 3.75 10.5'] },
  terminal: { paths: ['M2 3h12v10H2z', 'M4.5 6.5l2 1.5-2 1.5', 'M8 10h3'] },
  external: { paths: ['M9.5 2.5h4v4', 'M13.5 2.5L8 8', 'M12 9.5v4H2.5V4h4'] },
  target: { paths: [CIRCLE, 'M11.5 8a3.5 3.5 0 1 1-7 0a3.5 3.5 0 1 1 7 0', 'M8 7.4v1.2'] },
  'panel-left': { paths: ['M2 2.5h12v11H2z', 'M6 2.5v11'] },
  lock: { paths: ['M4 7.5h8v6H4z', 'M5.5 7.5V5.5a2.5 2.5 0 0 1 5 0v2'] },
  bookmark: { paths: ['M4 2.5h8v11l-4-3-4 3z'] },
  'bookmark-filled': { paths: ['M4 2.5h8v11l-4-3-4 3z'], filled: true },
  clock: { paths: [CIRCLE, 'M8 4.5V8h3'] },
  building: {
    paths: ['M3 13.5V3h6v10.5', 'M9 6.5h4v7', 'M2 13.5h12', 'M5 5.5h2M5 8h2M5 10.5h2'],
  },
  user: {
    paths: ['M10.5 5a2.5 2.5 0 1 1-5 0a2.5 2.5 0 1 1 5 0', 'M3 13.5c.6-2.6 2.6-4 5-4s4.4 1.4 5 4'],
  },
} as const satisfies Record<string, IconDef>;

export type IconName = keyof typeof ICONS;

/**
 * Decorative by default (`aria-hidden`). Pass `label` when the icon is the only
 * content conveying meaning, and it becomes an image with an accessible name.
 */
@Component({
  selector: 'app-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.aria-hidden]': 'label() ? null : "true"',
    '[attr.role]': 'label() ? "img" : null',
    '[attr.aria-label]': 'label() || null',
  },
  template: `
    <svg
      viewBox="0 0 16 16"
      [attr.width]="size()"
      [attr.height]="size()"
      [attr.fill]="def().filled ? 'currentColor' : 'none'"
      [attr.stroke]="def().filled ? 'none' : 'currentColor'"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      focusable="false"
    >
      @for (d of def().paths; track $index) {
        <path [attr.d]="d" />
      }
    </svg>
  `,
  styles: `
    :host {
      display: inline-flex;
      flex: none;
      line-height: 0;
    }
  `,
})
export class Icon {
  readonly name = input.required<IconName>();
  readonly size = input(16);
  readonly label = input<string>();

  protected readonly def = computed<IconDef>(() => ICONS[this.name()]);
}
