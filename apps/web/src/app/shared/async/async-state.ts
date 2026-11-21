import { effect, inject, PendingTasks, type Signal, signal, untracked } from '@angular/core';

/** The three states of something loaded asynchronously. */
export type AsyncState<T> =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly value: T }
  | { readonly status: 'error'; readonly error: string };

export interface AsyncResource<T> {
  readonly state: Signal<AsyncState<T>>;
  /** Runs the loader again with the current source value (e.g. after an error). */
  reload(): void;
}

/**
 * Loads a value whenever `source()` changes, exposing loading/ready/error as a
 * signal. Results from superseded requests are discarded.
 *
 * A small stand-in for Angular's `resource()` API, which is still
 * experimental in Angular 21. Must be called in an injection context.
 */
export function asyncResource<S, T>(
  source: () => S,
  loader: (value: S) => Promise<T>,
): AsyncResource<T> {
  const state = signal<AsyncState<T>>({ status: 'loading' });
  const trigger = signal(0);
  // Registering loads as pending tasks lets `whenStable()` (tests, SSR) wait for them.
  const pendingTasks = inject(PendingTasks);
  let request = 0;

  effect(() => {
    trigger();
    const value = source();
    const id = ++request;
    untracked(() => state.set({ status: 'loading' }));
    const done = pendingTasks.add();
    loader(value)
      .then(
        (result) => {
          if (id === request) state.set({ status: 'ready', value: result });
        },
        (err: unknown) => {
          if (id === request) state.set({ status: 'error', error: errorMessage(err) });
        },
      )
      .finally(done);
  });

  return { state: state.asReadonly(), reload: () => trigger.update((n) => n + 1) };
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong.';
}
