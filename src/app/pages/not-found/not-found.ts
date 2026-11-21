import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-not-found',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="container">
      <h1>{{ heading() }}</h1>
      <p>{{ message() }}</p>
      <a class="btn btn-primary" routerLink="/exercises">Browse exercises</a>
    </div>
  `,
  styles: `
    .container { padding-top: 120px; padding-bottom: 120px; text-align: center; }
    h1 { font-size: 2rem; }
    p { color: var(--text-muted); margin: 12px 0 28px; }
  `,
})
export class NotFound {
  readonly heading = input('Page not found');
  readonly message = input("The page you're looking for doesn't exist.");
}
