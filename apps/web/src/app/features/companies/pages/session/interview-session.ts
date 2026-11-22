import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type {
  ChallengeCodeRequest,
  InterviewSession as Session,
  InterviewSessionResponse,
  SubmissionResponse,
} from '@pracstack/api-contracts';
import { LANGUAGE_LABELS } from '@pracstack/content-model';
import { asyncResource, errorMessage } from '../../../../shared/async/async-state';
import { Alert } from '../../../../shared/ui/alert/alert';
import { ConfirmDialog } from '../../../../shared/ui/confirm-dialog/confirm-dialog';
import { LoadingState } from '../../../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../../../shared/ui/page-header/page-header';
import { Panel } from '../../../../shared/ui/panel/panel';
import {
  ChallengeWorkspace,
  type InterviewMode,
} from '../../../challenges/pages/workspace/challenge-workspace';
import { CompaniesApi } from '../../data-access/companies-api';
import { Countdown } from '../../ui/countdown';
import { formatDate, formatMinutes, SESSION_STATUS_LABELS } from '../../ui/labels';

/** Implemented by pages that may want to confirm before the router leaves them. */
export interface ConfirmsLeave {
  confirmLeave(): boolean;
}

/**
 * A timed interview session. The workspace is the normal challenge workspace
 * in interview mode; the clock shows the server's deadline. When the session
 * has ended (finished, exited or out of time) a summary is shown instead.
 */
@Component({
  selector: 'app-interview-session',
  imports: [
    RouterLink,
    Alert,
    ConfirmDialog,
    LoadingState,
    PageHeader,
    Panel,
    ChallengeWorkspace,
    Countdown,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './interview-session.html',
  styleUrl: './interview-session.css',
})
export class InterviewSession implements ConfirmsLeave {
  readonly slug = input.required<string>();
  readonly sessionId = input.required<string>();

  private readonly api = inject(CompaniesApi);
  private readonly router = inject(Router);

  /** Server time minus browser time, from the last response. */
  protected readonly clockOffset = signal(0);
  /** The latest session state from the server (loads, submissions, finish). */
  protected readonly session = signal<Session | undefined>(undefined);
  /** The countdown reached zero in this browser (the server decides; this locks the UI). */
  protected readonly timeUp = signal(false);
  protected readonly finishing = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly loaded = asyncResource(
    () => this.sessionId(),
    async (id) => this.accept(await this.api.session(id)),
  );

  protected readonly active = computed(() => this.session()?.status === 'active' && !this.timeUp());

  protected readonly mode = computed<InterviewMode | undefined>(() => {
    const s = this.session();
    if (!s) return undefined;
    return {
      breadcrumbs: [
        { label: 'Company Interview Prep', link: '/companies' },
        { label: s.companyName, link: ['/companies', s.companySlug] },
        { label: `Timed: ${s.challengeTitle}` },
      ],
      draftScope: s.id,
      language: s.language,
      locked: !this.active(),
      submit: (request) => this.submit(request),
    };
  });

  protected readonly breadcrumbs = computed(() => {
    const s = this.session();
    return [
      { label: 'Company Interview Prep', link: '/companies' },
      { label: s?.companyName ?? '', link: ['/companies', this.slug()] },
      { label: 'Session summary' },
    ];
  });

  protected readonly languageLabels = LANGUAGE_LABELS;
  protected readonly statusLabels = SESSION_STATUS_LABELS;
  protected readonly formatDate = formatDate;
  protected readonly formatMinutes = formatMinutes;

  constructor() {
    // Warn before closing or reloading the tab while the clock runs. (Drafts
    // are saved locally, but the deadline keeps running.)
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (this.active()) event.preventDefault();
    };
    window.addEventListener('beforeunload', beforeUnload);
    inject(DestroyRef).onDestroy(() => window.removeEventListener('beforeunload', beforeUnload));

    // When time runs out here, ask the server for the authoritative state.
    effect(() => {
      if (this.timeUp()) void this.refresh();
    });
  }

  /** Router guard hook: leaving mid-session needs confirmation. */
  confirmLeave(): boolean {
    if (!this.active()) return true;
    return window.confirm(
      'Your timed session keeps running while you are away. Leave this page anyway?',
    );
  }

  protected async finish(outcome: 'completed' | 'abandoned'): Promise<void> {
    const s = this.session();
    if (!s || this.finishing()) return;
    this.finishing.set(true);
    this.error.set(null);
    try {
      this.accept(await this.api.finish(s.id, outcome));
      if (outcome === 'abandoned') {
        await this.router.navigate(['/companies', s.companySlug]);
      }
    } catch (err) {
      this.error.set(errorMessage(err));
    } finally {
      this.finishing.set(false);
    }
  }

  private async submit(request: ChallengeCodeRequest): Promise<SubmissionResponse> {
    const s = this.session();
    if (!s) throw new Error('The session is not loaded.');
    try {
      const response = await this.api.submit(s.id, request);
      this.accept(response);
      return response.submission;
    } catch (err) {
      // The server refused (e.g. time ran out): show its current state.
      void this.refresh();
      throw err;
    }
  }

  private async refresh(): Promise<void> {
    const s = this.session();
    if (!s) return;
    try {
      this.accept(await this.api.session(s.id));
    } catch {
      /* The countdown still locks the workspace. */
    }
  }

  private accept(response: InterviewSessionResponse): Session {
    this.clockOffset.set(Date.parse(response.serverTime) - Date.now());
    this.session.set(response.session);
    return response.session;
  }
}
