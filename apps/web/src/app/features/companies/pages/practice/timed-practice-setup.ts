import { RuntimeConfigService } from '../../../../core/config/runtime-config';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { INTERVIEW_DURATIONS, type InterviewDuration } from '@pracstack/api-contracts';
import { LANGUAGE_LABELS, type LanguageId } from '@pracstack/content-model';
import { ApiClientError } from '../../../../core/api/api-client';
import { asyncResource, errorMessage } from '../../../../shared/async/async-state';
import { Alert } from '../../../../shared/ui/alert/alert';
import { EmptyState } from '../../../../shared/ui/empty-state/empty-state';
import { LoadingState } from '../../../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../../../shared/ui/page-header/page-header';
import { Panel } from '../../../../shared/ui/panel/panel';
import { ChallengeCatalogService } from '../../../challenges/data-access/challenge-catalog.service';
import { DifficultyBadge } from '../../../challenges/ui/difficulty-badge';
import { CompaniesApi } from '../../data-access/companies-api';
import { NotAffiliated } from '../../ui/not-affiliated';

/**
 * Starts a timed session: pick one of the company's practisable
 * recommendations, a duration and a language. The server sets the deadline.
 */
@Component({
  selector: 'app-timed-practice-setup',
  imports: [
    RouterLink,
    Alert,
    EmptyState,
    LoadingState,
    PageHeader,
    Panel,
    DifficultyBadge,
    NotAffiliated,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './timed-practice-setup.html',
  styleUrl: './timed-practice-setup.css',
})
export class TimedPracticeSetup {
  readonly slug = input.required<string>();

  private readonly api = inject(CompaniesApi);
  private readonly catalog = inject(ChallengeCatalogService);
  private readonly runtimeConfig = inject(RuntimeConfigService);
  private readonly router = inject(Router);

  protected readonly data = asyncResource(
    () => this.slug(),
    async (slug) => {
      const [detail, recs, sessions] = await Promise.all([
        this.api.detail(slug),
        this.api.recommendations(slug),
        this.api.sessions(slug),
      ]);
      const options = [];
      for (const r of recs.recommendations) {
        if (r.availability !== 'available' || r.locked) continue;
        const summary = await this.catalog.getSummary(r.challengeId);
        const languages = summary ? this.runtimeConfig.runnable(summary.languages) : [];
        if (languages.length > 0) options.push({ rec: r, languages });
      }
      return {
        company: detail.company,
        options,
        active: sessions.sessions.filter((s) => s.status === 'active'),
      };
    },
  );

  protected readonly durations = INTERVIEW_DURATIONS;
  protected readonly languageLabels = LANGUAGE_LABELS;

  protected readonly challengeId = linkedSignal(() => {
    const s = this.data.state();
    return s.status === 'ready' ? (s.value.options[0]?.rec.challengeId ?? '') : '';
  });
  protected readonly duration = signal<InterviewDuration>(45);
  protected readonly selectedOption = computed(() => {
    const s = this.data.state();
    return s.status === 'ready'
      ? s.value.options.find((o) => o.rec.challengeId === this.challengeId())
      : undefined;
  });
  protected readonly language = linkedSignal<LanguageId | undefined>(
    () => this.selectedOption()?.languages[0],
  );

  protected readonly starting = signal(false);
  protected readonly error = signal<string | null>(null);
  /** Reused when retrying, so a retried request cannot start a second session. */
  private requestId = crypto.randomUUID();

  protected readonly breadcrumbs = computed(() => {
    const s = this.data.state();
    return [
      { label: 'Company Interview Prep', link: '/companies' },
      {
        label: s.status === 'ready' ? s.value.company.displayName : '',
        link: ['/companies', this.slug()],
      },
      { label: 'Timed practice' },
    ];
  });

  protected selectChallenge(id: string): void {
    this.challengeId.set(id);
    this.requestId = crypto.randomUUID();
  }

  protected selectDuration(value: InterviewDuration): void {
    this.duration.set(value);
    this.requestId = crypto.randomUUID();
  }

  protected selectLanguage(event: Event): void {
    this.language.set((event.target as HTMLSelectElement).value as LanguageId);
    this.requestId = crypto.randomUUID();
  }

  protected async start(): Promise<void> {
    const language = this.language();
    const challengeId = this.challengeId();
    if (!language || !challengeId || this.starting()) return;
    this.starting.set(true);
    this.error.set(null);
    try {
      const { session } = await this.api.createSession({
        companySlug: this.slug(),
        challengeId,
        durationMinutes: this.duration(),
        language,
        clientRequestId: this.requestId,
      });
      await this.router.navigate(['/companies', this.slug(), 'practice', session.id]);
    } catch (err) {
      this.error.set(
        err instanceof ApiClientError && err.code === 'conflict'
          ? 'You already have a timed session for this challenge in progress. Resume it below, or finish it first.'
          : errorMessage(err),
      );
      if (err instanceof ApiClientError && err.code === 'conflict') this.data.reload();
    } finally {
      this.starting.set(false);
    }
  }
}
