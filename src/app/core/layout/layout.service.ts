import { computed, Injectable, signal } from '@angular/core';
import { readString, writeString } from '../browser/browser-storage';
import { mediaQuery } from '../browser/media-query';

const NAV_PREFERENCE_KEY = 'layout:nav-open';

/**
 * Navigation layout state.
 *
 * - **Docked** (wide screens, normal pages): the side nav sits beside the
 *   content and its open/closed state is remembered.
 * - **Overlay** (narrow screens, or full-bleed pages such as the coding
 *   workspace): the side nav is a drawer over the content, closed by default
 *   and closed again after every navigation.
 */
@Injectable({ providedIn: 'root' })
export class LayoutService {
  readonly isNarrow = mediaQuery('(max-width: 1023px)');
  /** Set by the shell from route data `{ fullBleed: true }`. */
  readonly fullBleed = signal(false);
  readonly overlayMode = computed(() => this.isNarrow() || this.fullBleed());

  private readonly dockedOpen = signal(readString(NAV_PREFERENCE_KEY) !== 'false');
  private readonly overlayOpen = signal(false);

  readonly navOpen = computed(() => (this.overlayMode() ? this.overlayOpen() : this.dockedOpen()));

  toggleNav(): void {
    if (this.overlayMode()) {
      this.overlayOpen.update((open) => !open);
    } else {
      const open = !this.dockedOpen();
      this.dockedOpen.set(open);
      writeString(NAV_PREFERENCE_KEY, String(open));
    }
  }

  closeOverlay(): void {
    this.overlayOpen.set(false);
  }
}
