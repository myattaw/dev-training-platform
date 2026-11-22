import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { formatDuration } from './labels';

/** Minutes left at which screen readers are told the remaining time. */
const ANNOUNCE_AT_MINUTES = [10, 5, 1];
const TICK_MS = 1000;

/** Remaining milliseconds; never negative. */
export function remainingMs(deadline: string, now: number): number {
  return Math.max(0, Date.parse(deadline) - now);
}

/**
 * Counts down to a deadline set by the server.
 *
 * The time left is recomputed from the deadline on every tick (and when the
 * tab becomes visible again), never by decrementing a counter, so it stays
 * right after the browser throttles background tabs, after sleep, and after
 * a reload. `clockOffsetMs` (server time minus this browser's time) corrects
 * a browser clock that is off.
 *
 * Screen readers hear the time only at 10, 5 and 1 minutes left and at the
 * end; the visible clock is not a live region.
 */
@Component({
  selector: 'app-countdown',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.warning]': 'remaining() > 0 && remaining() <= 5 * 60_000',
    '[class.ended]': 'remaining() === 0',
  },
  template: `
    <span class="clock" role="timer" [attr.aria-label]="label()">{{ display() }}</span>
    <span class="sr-only" aria-live="assertive">{{ announcement() }}</span>
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      padding: 2px 8px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
      background: var(--color-surface);
      font-family: var(--font-mono);
      font-size: var(--font-size-md);
      font-variant-numeric: tabular-nums;
      font-weight: var(--font-weight-bold);
    }
    :host(.warning) {
      border-color: var(--color-warning);
      color: var(--color-warning);
      background: var(--color-warning-bg);
    }
    :host(.ended) {
      border-color: var(--color-error);
      color: var(--color-error);
      background: var(--color-error-bg);
    }
  `,
})
export class Countdown {
  /** ISO deadline from the server. */
  readonly deadline = input.required<string>();
  /** Server time minus browser time, measured when the session was loaded. */
  readonly clockOffsetMs = input(0);
  /** Emitted once when the deadline passes. */
  readonly expired = output<void>();

  private readonly now = signal(Date.now());
  protected readonly remaining = computed(() =>
    remainingMs(this.deadline(), this.now() + this.clockOffsetMs()),
  );
  protected readonly display = computed(() =>
    this.remaining() === 0 ? "Time's up" : formatDuration(Math.ceil(this.remaining() / 1000)),
  );
  protected readonly label = computed(() => {
    const minutes = Math.ceil(this.remaining() / 60_000);
    return this.remaining() === 0
      ? 'Time is up'
      : `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} left`;
  });
  protected readonly announcement = signal('');

  private announced = new Set<number>();
  private emitted = false;

  constructor() {
    const tick = () => this.now.set(Date.now());
    const timer = setInterval(tick, TICK_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    });

    // Thresholds already passed when the page opens are not announced.
    effect(() => {
      const left = this.remaining();
      untracked(() => this.announce(left));
    });
  }

  private announce(left: number): void {
    const first = this.announced.size === 0 && !this.emitted;
    for (const minutes of ANNOUNCE_AT_MINUTES) {
      if (left <= minutes * 60_000 && !this.announced.has(minutes)) {
        this.announced.add(minutes);
        if (!first && left > 0) {
          this.announcement.set(`${minutes} ${minutes === 1 ? 'minute' : 'minutes'} left.`);
        }
      }
    }
    if (first) this.announced.add(-1); // Marks the initial state as seen.
    if (left === 0 && !this.emitted) {
      this.emitted = true;
      this.announcement.set('Time is up. The session has ended.');
      this.expired.emit();
    }
  }
}
