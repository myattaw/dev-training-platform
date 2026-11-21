import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  type ElementRef,
  inject,
  Injector,
  viewChild,
} from '@angular/core';
import { type ActivatedRouteSnapshot, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { LayoutService } from './core/layout/layout.service';
import { FULL_BLEED } from './core/layout/route-data';
import { SideNav } from './core/layout/side-nav/side-nav';
import { TopNav } from './core/layout/top-nav/top-nav';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, TopNav, SideNav],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.html',
  styleUrl: './app.css',
  host: { '(document:keydown.escape)': 'onEscape()' },
})
export class App {
  protected readonly layout = inject(LayoutService);
  private readonly injector = inject(Injector);
  private readonly sideNav = viewChild.required(SideNav);
  private readonly main = viewChild.required<ElementRef<HTMLElement>>('main');

  constructor() {
    const router = inject(Router);
    const subscription = router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.layout.fullBleed.set(
          deepestChild(router.routerState.snapshot.root).data[FULL_BLEED] === true,
        );
        this.layout.closeOverlay();
      }
    });
    inject(DestroyRef).onDestroy(() => subscription.unsubscribe());
  }

  protected toggleNav(): void {
    this.layout.toggleNav();
    // When the drawer opens over the content, move focus into it.
    if (this.layout.overlayMode() && this.layout.navOpen()) {
      afterNextRender(() => this.sideNav().focusFirstLink(), { injector: this.injector });
    }
  }

  protected onEscape(): void {
    if (this.layout.overlayMode() && this.layout.navOpen()) {
      this.layout.closeOverlay();
      document.querySelector<HTMLElement>('[aria-controls="side-nav"]')?.focus();
    }
  }

  protected skipToContent(): void {
    this.main().nativeElement.focus();
  }
}

function deepestChild(route: ActivatedRouteSnapshot): ActivatedRouteSnapshot {
  return route.firstChild ? deepestChild(route.firstChild) : route;
}
