import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  linkedSignal,
} from '@angular/core';
import { readString, writeString } from '../../../core/browser/browser-storage';

const KEYBOARD_STEP = 2;

/**
 * Two resizable panes separated by a draggable, keyboard-operable divider
 * (WAI-ARIA "window splitter" pattern).
 *
 * ```html
 * <app-split-pane orientation="horizontal" [initialSize]="40" storageKey="layout:workspace">
 *   <section paneStart>…</section>
 *   <section paneEnd>…</section>
 * </app-split-pane>
 * ```
 *
 * `size` is the start pane's share of the space, in percent.
 */
@Component({
  selector: 'app-split-pane',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.vertical]': 'orientation() === "vertical"',
    '[style.--split-size]': 'size() + "%"',
  },
  template: `
    <div class="pane"><ng-content select="[paneStart]" /></div>
    <div
      class="divider"
      role="separator"
      tabindex="0"
      [attr.aria-label]="label()"
      [attr.aria-orientation]="orientation() === 'horizontal' ? 'vertical' : 'horizontal'"
      [attr.aria-valuenow]="roundedSize()"
      [attr.aria-valuemin]="min()"
      [attr.aria-valuemax]="max()"
      (pointerdown)="startDrag($event)"
      (keydown)="onKeydown($event)"
    ></div>
    <div class="pane"><ng-content select="[paneEnd]" /></div>
  `,
  styles: `
    /* Fill the parent (usually a flex column) so percentage tracks have a definite size. */
    :host {
      display: grid;
      flex: 1 1 0;
      grid-template-columns: minmax(0, var(--split-size)) 1px minmax(0, 1fr);
      min-width: 0;
      min-height: 0;
    }
    :host(.vertical) {
      grid-template-columns: none;
      grid-template-rows: minmax(0, var(--split-size)) 1px minmax(0, 1fr);
    }
    .pane {
      display: flex;
      flex-direction: column;
      min-width: 0;
      min-height: 0;
      overflow: hidden;
    }
    .divider {
      position: relative;
      z-index: 1;
      background: var(--color-border);
      cursor: col-resize;
      touch-action: none;
    }
    :host(.vertical) .divider {
      cursor: row-resize;
    }
    /* A wider invisible hit area around the 1px line. */
    .divider::before {
      content: '';
      position: absolute;
      inset: 0 -4px;
    }
    :host(.vertical) .divider::before {
      inset: -4px 0;
    }
    .divider:hover,
    .divider:focus-visible,
    .divider.dragging {
      background: var(--color-primary);
      outline: none;
    }
    .divider:focus-visible::after,
    .divider:hover::after {
      content: '';
      position: absolute;
      inset: 0 -1px;
      background: var(--color-primary);
    }
    :host(.vertical) .divider:focus-visible::after,
    :host(.vertical) .divider:hover::after {
      inset: -1px 0;
    }
  `,
})
export class SplitPane {
  readonly orientation = input<'horizontal' | 'vertical'>('horizontal');
  readonly initialSize = input(50);
  readonly min = input(20);
  readonly max = input(80);
  readonly label = input('Resize panes');
  /** When set, the size is remembered in localStorage under this key. */
  readonly storageKey = input<string>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly size = linkedSignal(() => {
    const key = this.storageKey();
    const stored = key ? Number(readString(key)) : NaN;
    return this.clamp(Number.isFinite(stored) && stored > 0 ? stored : this.initialSize());
  });
  protected readonly roundedSize = computed(() => Math.round(this.size()));

  constructor() {
    effect(() => {
      const key = this.storageKey();
      if (key) writeString(key, String(this.roundedSize()));
    });
  }

  protected startDrag(event: PointerEvent): void {
    if (event.button !== 0) return;
    event.preventDefault();
    const divider = event.currentTarget as HTMLElement;
    divider.setPointerCapture(event.pointerId);
    divider.classList.add('dragging');

    const onMove = (e: PointerEvent): void => {
      const rect = this.host.nativeElement.getBoundingClientRect();
      const ratio =
        this.orientation() === 'horizontal'
          ? (e.clientX - rect.left) / rect.width
          : (e.clientY - rect.top) / rect.height;
      this.size.set(this.clamp(ratio * 100));
    };
    const onUp = (): void => {
      divider.classList.remove('dragging');
      divider.removeEventListener('pointermove', onMove);
      divider.removeEventListener('pointerup', onUp);
      divider.removeEventListener('pointercancel', onUp);
    };
    divider.addEventListener('pointermove', onMove);
    divider.addEventListener('pointerup', onUp);
    divider.addEventListener('pointercancel', onUp);
  }

  protected onKeydown(event: KeyboardEvent): void {
    const horizontal = this.orientation() === 'horizontal';
    const decrease = horizontal ? 'ArrowLeft' : 'ArrowUp';
    const increase = horizontal ? 'ArrowRight' : 'ArrowDown';
    let next: number;
    switch (event.key) {
      case decrease:
        next = this.size() - KEYBOARD_STEP;
        break;
      case increase:
        next = this.size() + KEYBOARD_STEP;
        break;
      case 'Home':
        next = this.min();
        break;
      case 'End':
        next = this.max();
        break;
      case 'Enter':
        next = this.initialSize();
        break;
      default:
        return;
    }
    event.preventDefault();
    this.size.set(this.clamp(next));
  }

  private clamp(value: number): number {
    return Math.min(this.max(), Math.max(this.min(), value));
  }
}
