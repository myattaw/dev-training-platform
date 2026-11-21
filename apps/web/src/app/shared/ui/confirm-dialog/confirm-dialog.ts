import {
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  input,
  output,
  viewChild,
} from '@angular/core';

/**
 * Modal confirmation built on the native `<dialog>` element, which provides
 * focus trapping, Escape-to-cancel and an inert background for free.
 *
 * ```html
 * <app-confirm-dialog #confirm heading="Reset code?" confirmLabel="Reset" (confirmed)="reset()">
 *   Your changes will be lost.
 * </app-confirm-dialog>
 * <button (click)="confirm.open()">Reset</button>
 * ```
 */
@Component({
  selector: 'app-confirm-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Backdrop click is a mouse shortcut for Escape, which <dialog> already handles natively. -->
    <!-- eslint-disable-next-line @angular-eslint/template/click-events-have-key-events, @angular-eslint/template/interactive-supports-focus -->
    <dialog #dialog [attr.aria-labelledby]="headingId" (click)="onBackdropClick($event)">
      <form method="dialog">
        <h2 [id]="headingId">{{ heading() }}</h2>
        <div class="body"><ng-content /></div>
        <div class="actions">
          <button type="submit" class="btn" value="cancel" autofocus>Cancel</button>
          <button type="submit" class="btn btn--primary" value="confirm" (click)="confirmed.emit()">
            {{ confirmLabel() }}
          </button>
        </div>
      </form>
    </dialog>
  `,
  styles: `
    dialog {
      width: min(440px, calc(100vw - 32px));
      padding: 0;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      background: var(--color-surface);
      color: var(--color-text);
      box-shadow: var(--shadow-popover);
    }
    dialog::backdrop {
      background: rgb(15 23 42 / 0.35);
    }
    form {
      padding: var(--space-5);
    }
    h2 {
      font-size: var(--font-size-lg);
    }
    .body {
      margin-top: var(--space-2);
      color: var(--color-text-secondary);
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--space-2);
      margin-top: var(--space-5);
    }
  `,
})
export class ConfirmDialog {
  private static nextId = 0;

  readonly heading = input.required<string>();
  readonly confirmLabel = input('Confirm');
  readonly confirmed = output<void>();

  protected readonly headingId = `confirm-dialog-${ConfirmDialog.nextId++}`;
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  open(): void {
    this.dialog().nativeElement.showModal();
  }

  /** Clicking the backdrop (the dialog element itself, outside the form) cancels. */
  protected onBackdropClick(event: MouseEvent): void {
    if (event.target === this.dialog().nativeElement) this.dialog().nativeElement.close('cancel');
  }
}
