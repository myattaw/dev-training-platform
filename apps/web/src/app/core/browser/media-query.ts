import { DestroyRef, inject, type Signal, signal } from '@angular/core';

/**
 * A signal that tracks a CSS media query, e.g. `mediaQuery('(max-width: 899px)')`.
 * Must be called in an injection context; the listener is removed on destroy.
 */
export function mediaQuery(query: string): Signal<boolean> {
  if (typeof matchMedia !== 'function') return signal(false).asReadonly();

  const list = matchMedia(query);
  const matches = signal(list.matches);
  const listener = (event: MediaQueryListEvent): void => matches.set(event.matches);
  list.addEventListener('change', listener);
  inject(DestroyRef).onDestroy(() => list.removeEventListener('change', listener));
  return matches.asReadonly();
}
