import { formatRelativeTime } from './relative-time';

describe('formatRelativeTime', () => {
  const now = new Date('2026-11-21T12:00:00Z');
  const ago = (seconds: number): string => new Date(now.getTime() - seconds * 1000).toISOString();

  it('formats recent, minute, hour and day offsets', () => {
    expect(formatRelativeTime(ago(10), now)).toBe('just now');
    expect(formatRelativeTime(ago(5 * 60), now)).toBe('5 minutes ago');
    expect(formatRelativeTime(ago(3 * 3600), now)).toBe('3 hours ago');
    expect(formatRelativeTime(ago(24 * 3600), now)).toBe('yesterday');
    expect(formatRelativeTime(ago(14 * 24 * 3600), now)).toBe('2 weeks ago');
  });

  it('returns an empty string for invalid dates', () => {
    expect(formatRelativeTime('not a date', now)).toBe('');
  });
});
