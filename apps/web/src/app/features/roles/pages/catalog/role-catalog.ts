import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { JOB_ROLE_STATUS_LABELS, type JobRole } from '@pracstack/content-model';
import { AuthService } from '../../../../core/auth/auth.service';
import { asyncResource, errorMessage } from '../../../../shared/async/async-state';
import { Alert } from '../../../../shared/ui/alert/alert';
import { Badge } from '../../../../shared/ui/badge/badge';
import { EmptyState } from '../../../../shared/ui/empty-state/empty-state';
import { Icon } from '../../../../shared/ui/icon/icon';
import { LoadingState } from '../../../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../../../shared/ui/page-header/page-header';
import { Panel } from '../../../../shared/ui/panel/panel';
import { formatDate } from '../../../companies/ui/labels';
import { PreparationApi } from '../../data-access/preparation-api';
import { RoleContent } from '../../data-access/role-content';
import { ExperienceNote } from '../../ui/experience-note';

/**
 * Job roles: search and filter by technology (both in the URL, so results can
 * be bookmarked), status badges, and the learner's target role highlighted.
 */
@Component({
  selector: 'app-role-catalog',
  imports: [
    RouterLink,
    Alert,
    Badge,
    EmptyState,
    Icon,
    LoadingState,
    PageHeader,
    Panel,
    ExperienceNote,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './role-catalog.html',
  styleUrl: './role-catalog.css',
})
export class RoleCatalog {
  /** Query params, bound by `withComponentInputBinding()`. */
  readonly q = input<string>();
  readonly tech = input<string>();

  protected readonly auth = inject(AuthService);
  private readonly content = inject(RoleContent);
  private readonly preparation = inject(PreparationApi);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly statusLabels = JOB_ROLE_STATUS_LABELS;
  protected readonly formatDate = formatDate;
  protected readonly data = asyncResource(
    () => undefined,
    () => this.content.load(),
  );
  protected readonly saved = asyncResource(
    () => ({ ok: this.auth.canUseApi(), v: this.preparation.version() }),
    () => this.preparation.get(),
  );
  protected readonly actionError = signal<string | undefined>(undefined);

  protected readonly query = computed(() => this.q() ?? '');
  protected readonly targetRoleId = computed(() => {
    const s = this.saved.state();
    return s.status === 'ready' ? s.value.targetRoleId : null;
  });
  protected readonly plans = computed(() => {
    const s = this.saved.state();
    return s.status === 'ready' ? s.value.plans : [];
  });

  /** Technologies used by any role, by label. */
  protected readonly technologies = computed(() => {
    const s = this.data.state();
    if (s.status !== 'ready') return [];
    const used = new Set(s.value.roles.flatMap((r) => r.technologies));
    return [...used]
      .flatMap((id) => {
        const term = s.value.terms.get(id);
        return term ? [{ id, label: term.label }] : [];
      })
      .sort((a, b) => a.label.localeCompare(b.label, 'en'));
  });
  protected readonly techFilter = computed(() => {
    const t = this.tech();
    return t && this.technologies().some((x) => x.id === t) ? t : undefined;
  });

  protected readonly roles = computed(() => {
    const s = this.data.state();
    if (s.status !== 'ready') return [];
    const words = this.query().toLowerCase().split(/\s+/).filter(Boolean);
    const tech = this.techFilter();
    const target = this.targetRoleId();
    return s.value.roles
      .filter((role) => !tech || role.technologies.includes(tech))
      .filter((role) => {
        const text = [role.title, role.summary, ...this.labels(role)].join(' ').toLowerCase();
        return words.every((w) => text.includes(w));
      })
      .map((role) => ({
        role,
        labels: this.labels(role),
        target: role.id === target,
        coverage:
          role.status === 'available'
            ? {
                practiced: role.competencies.filter((c) => c.activities.length > 0).length,
                total: role.competencies.length,
              }
            : undefined,
      }));
  });
  protected readonly targetRole = computed(() => {
    const s = this.data.state();
    const id = this.targetRoleId();
    return s.status === 'ready' && id ? s.value.roles.find((r) => r.id === id) : undefined;
  });

  protected termLabel(id: string): string {
    const s = this.data.state();
    return (s.status === 'ready' ? s.value.terms.get(id)?.label : undefined) ?? id;
  }

  protected onSearch(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.navigate({ q: value || null });
  }

  protected onTechnology(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.navigate({ tech: value || null });
  }

  protected clearFilters(): void {
    this.navigate({ q: null, tech: null });
  }

  protected async deletePlan(id: string): Promise<void> {
    this.actionError.set(undefined);
    try {
      await this.preparation.deletePlan(id);
    } catch (err) {
      this.actionError.set(errorMessage(err));
    }
  }

  protected signIn(): void {
    void this.auth.signIn();
  }

  private labels(role: JobRole): string[] {
    return role.technologies.map((id) => this.termLabel(id));
  }

  private navigate(params: Record<string, string | null>): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: params,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
