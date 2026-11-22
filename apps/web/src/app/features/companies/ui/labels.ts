import type { InterviewSessionStatus } from '@pracstack/api-contracts';
import { OBSERVATION_WINDOW_LABELS, type ObservationWindow } from '@pracstack/content-model';

/** `2026-07-12` → "12 July 2026" (fixed English format, no time zone shift). */
export function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return isoDate;
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** `2026-07-12` → "July 2026". */
export function formatMonth(isoDate: string): string {
  const [y, m] = isoDate.slice(0, 7).split('-').map(Number);
  if (!y || !m) return isoDate;
  return new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, 1)));
}

export function windowLabel(window: ObservationWindow): string {
  return OBSERVATION_WINDOW_LABELS[window];
}

/** 1:05:09 or 5:09. */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** "12 min" or "1 h 5 min", for summaries. */
export function formatMinutes(totalSeconds: number): string {
  const minutes = Math.round(totalSeconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  return minutes % 60 === 0 ? `${h} h` : `${h} h ${minutes % 60} min`;
}

export const SESSION_STATUS_LABELS: Readonly<Record<InterviewSessionStatus, string>> = {
  active: 'In progress',
  completed: 'Completed',
  expired: 'Time ran out',
  abandoned: 'Exited early',
};
