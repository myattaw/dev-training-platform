import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Short labels for known tracks; anything else uses its first two letters. */
const MONOGRAMS: Readonly<Record<string, string>> = {
  typescript: 'TS',
  angular: 'NG',
  postgresql: 'PG',
  'oracle-sql': 'ORA',
  csharp: 'C#',
  'aspnet-core': 'ASP',
  'sql-server': 'SQL',
  azure: 'AZ',
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

/** A colored monogram tile identifying a track (decorative: the track name is always shown next to it). */
@Component({
  selector: 'app-track-mark',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true', '[style.--accent]': 'accent()', '[class.large]': 'large()' },
  template: `{{ label() }}`,
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
  `,
})
export class TrackMark {
  readonly trackId = input.required<string>();
  readonly large = input(false);
  protected readonly label = computed(
    () => MONOGRAMS[this.trackId()] ?? this.trackId().slice(0, 2).toUpperCase(),
  );
  protected readonly accent = computed(() => trackAccent(this.trackId()));
}
