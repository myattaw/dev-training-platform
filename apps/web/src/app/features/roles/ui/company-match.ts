import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { normalizeCompanyName } from '@pracstack/content-model';
import { AuthService } from '../../../core/auth/auth.service';
import { asyncResource } from '../../../shared/async/async-state';
import { CompaniesApi } from '../../companies/data-access/companies-api';

/**
 * Looks the company up in the Company Interview Prep catalog (signed in).
 * Optional: the plan is complete without it.
 */
@Component({
  selector: 'app-company-match',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!auth.canUseApi()) {
      <p class="text-secondary small">
        Sign in to look for {{ company() }} in Company Interview Prep.
      </p>
    } @else {
      @let s = match.state();
      @if (s.status === 'loading') {
        <p class="text-secondary small">Looking for {{ company() }}…</p>
      } @else if (s.status === 'error') {
        <p class="text-secondary small">Company Interview Prep could not be searched right now.</p>
      } @else if (s.value) {
        @let c = s.value;
        <p class="match">
          <strong>{{ c.displayName }}</strong>: {{ c.questionCount }} reported interview
          {{ c.questionCount === 1 ? 'question' : 'questions' }}
          and original practice recommendations.
          <a [routerLink]="['/companies', c.slug]">Open {{ c.displayName }} interview prep</a>
        </p>
        <p class="text-secondary small">
          Questions candidates reported on public sites (sources are listed on the company page).
          There is no guarantee any of them will be asked.
        </p>
      } @else {
        <p class="text-secondary small">
          {{ company() }} is not in the company catalog. Your plan does not depend on it.
        </p>
      }
    }
  `,
  styles: `
    .match {
      margin: 0 0 var(--space-1);
    }
    .small {
      font-size: var(--font-size-sm);
      margin: 0;
    }
  `,
})
export class CompanyMatch {
  readonly company = input.required<string>();

  protected readonly auth = inject(AuthService);
  private readonly companies = inject(CompaniesApi);

  /** The best match: an exact name or alias, else nothing (no guessing). */
  protected readonly match = asyncResource(
    () => ({ q: this.company().trim(), ok: this.auth.canUseApi() }),
    async ({ q, ok }) => {
      if (!ok || q.length < 2) return undefined;
      const res = await this.companies.list({ q });
      const wanted = normalizeCompanyName(q);
      return res.companies.find(
        (c) =>
          normalizeCompanyName(c.displayName) === wanted ||
          c.aliases.some((a) => normalizeCompanyName(a) === wanted),
      );
    },
  );
}
