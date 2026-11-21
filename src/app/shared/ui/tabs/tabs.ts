import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  model,
} from '@angular/core';

export interface TabItem {
  readonly id: string;
  readonly label: string;
  /** Optional count shown after the label, e.g. "Tests (10)". */
  readonly count?: number;
}

/**
 * Accessible tab list (WAI-ARIA tabs pattern, automatic activation).
 *
 * The parent renders the panels itself and links them with the ids from
 * `tabId()` / `panelId()`:
 *
 * ```html
 * <app-tabs idPrefix="results" [tabs]="tabs" [(selected)]="tab" />
 * <div role="tabpanel" [id]="'results-panel-' + tab()" [attr.aria-labelledby]="'results-tab-' + tab()">…</div>
 * ```
 */
@Component({
  selector: 'app-tabs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Key presses bubble up from the focused tab; the tabs themselves are the focusable elements. -->
    <!-- eslint-disable-next-line @angular-eslint/template/interactive-supports-focus -->
    <div role="tablist" [attr.aria-label]="label()" (keydown)="onKeydown($event)">
      @for (tab of tabs(); track tab.id) {
        <button
          type="button"
          role="tab"
          [id]="idPrefix() + '-tab-' + tab.id"
          [attr.aria-controls]="idPrefix() + '-panel-' + tab.id"
          [attr.aria-selected]="tab.id === selected()"
          [tabIndex]="tab.id === selected() ? 0 : -1"
          (click)="selected.set(tab.id)"
        >
          {{ tab.label }}
          @if (tab.count !== undefined) {
            <span class="count">({{ tab.count }})</span>
          }
        </button>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    [role='tablist'] {
      display: flex;
      gap: var(--space-1);
      overflow-x: auto;
      scrollbar-width: none;
    }
    button {
      position: relative;
      height: 36px;
      padding: 0 var(--space-3);
      border: none;
      background: none;
      color: var(--color-text-secondary);
      font: inherit;
      font-weight: var(--font-weight-bold);
      white-space: nowrap;
      cursor: pointer;
    }
    button:hover {
      color: var(--color-text);
    }
    button[aria-selected='true'] {
      color: var(--color-primary);
    }
    button[aria-selected='true']::after {
      content: '';
      position: absolute;
      left: var(--space-2);
      right: var(--space-2);
      bottom: 0;
      height: 3px;
      border-radius: 2px 2px 0 0;
      background: var(--color-primary);
    }
    button:focus-visible {
      outline-offset: -2px;
    }
    .count {
      font-weight: var(--font-weight-normal);
    }
  `,
})
export class Tabs {
  readonly tabs = input.required<readonly TabItem[]>();
  readonly selected = model.required<string>();
  readonly idPrefix = input.required<string>();
  readonly label = input.required<string>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected onKeydown(event: KeyboardEvent): void {
    const tabs = this.tabs();
    const current = tabs.findIndex((t) => t.id === this.selected());
    let next: number;
    switch (event.key) {
      case 'ArrowRight':
        next = (current + 1) % tabs.length;
        break;
      case 'ArrowLeft':
        next = (current - 1 + tabs.length) % tabs.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = tabs.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    this.selected.set(tabs[next].id);
    this.host.nativeElement.querySelectorAll<HTMLElement>('[role="tab"]')[next]?.focus();
  }
}
