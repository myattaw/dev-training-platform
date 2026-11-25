import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TECH_LOGOS } from './tech-logos';

/** Short labels for known tracks; anything else uses its first two letters. */
const MONOGRAMS: Readonly<Record<string, string>> = {
  typescript: 'TS',
  angular: 'NG',
  postgresql: 'PG',
  'oracle-sql': 'ORA',
  'oracle-plsql': 'PL',
  csharp: 'C#',
  'aspnet-core': 'ASP',
  'sql-server': 'SQL',
  azure: 'AZ',
  aws: 'AWS',
  'engineering-practices': 'ENG',
  'power-platform': 'PP',
  challenges: '</>',
};

/** Accent colors exist for these ids (styles/tokens.css → --color-track-*). */
const ACCENTED = new Set(Object.keys(MONOGRAMS));

/** Accent color for a track, for use as a CSS value. */
export function trackAccent(id: string): string {
  return ACCENTED.has(id) ? `var(--color-track-${id})` : 'var(--color-primary)';
}

/**
 * A tile identifying a track: the technology's logo where its owner allows
 * that use (see tech-logos.ts), otherwise a colored monogram. Decorative: the
 * track name is always shown next to it.
 */
@Component({
  selector: 'app-track-mark',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'aria-hidden': 'true',
    '[style.--accent]': 'accent()',
    '[class.large]': 'large()',
    '[class.standalone]': "logo()?.style === 'standalone'",
  },
  template: `
    @if (logo(); as l) {
      <svg viewBox="0 0 24 24" focusable="false" [attr.fill]="l.color ?? 'currentColor'">
        <path [attr.d]="l.path" />
      </svg>
    } @else {
      {{ label() }}
    }
  `,
  styles: `
    :host {
      display: inline-grid;
      place-items: center;
      flex: none;
      width: 40px;
      height: 40px;
      border-radius: var(--radius-md);
      background: var(--accent);
      color: var(--color-text-inverse);
      font-family: var(--font-mono);
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-bold);
      letter-spacing: -0.02em;
    }
    :host(.large) {
      width: 48px;
      height: 48px;
      font-size: var(--font-size-md);
    }
    svg {
      width: 60%;
      height: 60%;
    }
    /* A logo that is itself a filled square (TypeScript) fills the tile. */
    :host(.standalone) {
      background: none;
    }
    :host(.standalone) svg {
      width: 100%;
      height: 100%;
    }
  `,
})
export class TrackMark {
  readonly trackId = input.required<string>();
  readonly large = input(false);
  protected readonly logo = computed(() => TECH_LOGOS[this.trackId()]);
  protected readonly label = computed(
    () => MONOGRAMS[this.trackId()] ?? this.trackId().slice(0, 2).toUpperCase(),
  );
  protected readonly accent = computed(() => trackAccent(this.trackId()));
}
