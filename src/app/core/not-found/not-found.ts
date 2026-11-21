import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { Panel } from '../../shared/ui/panel/panel';

/**
 * Used both as the `**` route and inline by pages whose resource does not exist.
 *
 * Inputs are optional with fallbacks applied in `computed()` rather than as
 * input defaults: as a routed component, `withComponentInputBinding()` sets
 * every input that is not in the route to `undefined`, overriding defaults.
 */
@Component({
  selector: 'app-not-found',
  imports: [RouterLink, Panel, EmptyState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-panel>
      <app-empty-state [heading]="headingText()" [message]="messageText()">
        <a class="btn" [routerLink]="backLinkValue()">{{ backLabelText() }}</a>
      </app-empty-state>
    </app-panel>
  `,
  styles: `
    :host {
      display: block;
      max-width: 640px;
      margin: var(--space-8) auto;
      padding: 0 var(--page-padding);
    }
    app-panel {
      padding-top: var(--space-4);
    }
  `,
})
export class NotFound {
  readonly heading = input<string>();
  readonly message = input<string>();
  readonly backLink = input<string>();
  readonly backLabel = input<string>();

  protected readonly headingText = computed(() => this.heading() ?? 'Page not found');
  protected readonly messageText = computed(
    () => this.message() ?? 'The page you are looking for does not exist or has moved.',
  );
  protected readonly backLinkValue = computed(() => this.backLink() ?? '/');
  protected readonly backLabelText = computed(() => this.backLabel() ?? 'Go to dashboard');
}
