import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type {
  WebDiagnostic,
  WebHttpRequest,
  WebRun,
  WebTimedSession,
  WebVerdict,
} from '@pracstack/api-contracts';
import { WEB_VERDICT_LABELS } from '@pracstack/api-contracts';
import {
  WEB_FRAMEWORK_LABELS,
  type WebChallenge,
  type WebFramework,
  type WebImplementation,
} from '@pracstack/content-model';
import { errorMessage } from '../../../shared/async/async-state';
import { InstructionBlocks } from '../../../shared/content/instruction-blocks/instruction-blocks';
import { Alert } from '../../../shared/ui/alert/alert';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { SplitPane } from '../../../shared/ui/split-pane/split-pane';
import { type TabItem, Tabs } from '../../../shared/ui/tabs/tabs';
import { DifficultyBadge } from '../../challenges/ui/difficulty-badge';
import {
  readLocalDraft,
  readLocalRequests,
  removeLocalDraft,
  WebChallengesService,
  writeLocalDraft,
  writeLocalRequests,
} from '../data-access/web-challenges.service';
import { FileTree } from '../ui/file-tree';
import { HttpClient } from '../ui/http-client';
import { ProjectEditor } from '../ui/project-editor';
import { RunResults } from '../ui/run-results';

type SaveStatus = 'saved' | 'unsaved' | 'saving' | 'saved-locally';
type BottomTab = 'tests' | 'http' | 'output';
type SideTab = 'files' | 'instructions';

interface Loaded {
  readonly challenge: WebChallenge;
  readonly project: WebImplementation;
  readonly executionAvailable: boolean;
  readonly starter: Readonly<Record<string, string>>;
}

/**
 * The multi-file workspace for a Web Development Challenge: edit the project,
 * send the application HTTP requests, run the visible tests, and submit for
 * grading. Each of these is one run on the server (build, start a fresh
 * application, send requests, stop it); nothing keeps running in between. Drafts are kept per challenge and framework (in this
 * browser, and in the account when signed in). Saving or building never
 * means solved: only an accepted submission does.
 */
@Component({
  selector: 'app-web-workspace',
  imports: [
    RouterLink,
    LoadingState,
    Alert,
    Icon,
    SplitPane,
    Tabs,
    DifficultyBadge,
    InstructionBlocks,
    FileTree,
    ProjectEditor,
    HttpClient,
    RunResults,
    ConfirmDialog,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './web-workspace.html',
  styleUrl: './web-workspace.css',
})
export class WebWorkspace {
  readonly id = input.required<string>();
  readonly framework = input.required<string>();
  /** Timed session id (query parameter). */
  readonly timed = input<string>();

  private readonly service = inject(WebChallengesService);
  private readonly router = inject(Router);
  private readonly resetDialog = viewChild<ConfirmDialog>('resetDialog');

  protected readonly labels = WEB_FRAMEWORK_LABELS;

  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly loaded = signal<Loaded | null>(null);
  protected readonly contents = signal<Readonly<Record<string, string>>>({});
  protected readonly openTabs = signal<readonly string[]>([]);
  protected readonly active = signal('');
  protected readonly revealLine = signal<number | undefined>(undefined);
  protected readonly saveStatus = signal<SaveStatus>('saved');
  protected readonly recovery = signal<{
    version: number;
    files: Readonly<Record<string, string>>;
  } | null>(null);
  protected readonly sideTab = signal<SideTab>('files');
  protected readonly bottomTab = signal<BottomTab>('tests');
  protected readonly run = signal<WebRun | undefined>(undefined);
  protected readonly runError = signal<string | null>(null);
  /** The latest HTTP-client run (requests sent to a fresh application). */
  protected readonly requestRun = signal<WebRun | undefined>(undefined);
  protected readonly requestError = signal<string | null>(null);
  /** The HTTP client's requests as kept in this browser. */
  protected readonly savedRequests = signal<readonly WebHttpRequest[] | undefined>(undefined);
  /** Which run finished last: its output and diagnostics are shown. */
  private readonly latest = signal<'tests' | 'requests'>('tests');
  protected readonly timedSession = signal<WebTimedSession | undefined>(undefined);
  private readonly clockOffset = signal(0);
  protected readonly now = signal(Date.now());
  protected readonly announcement = signal('');

  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  private accountTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly pollTimers: Partial<
    Record<'tests' | 'requests', ReturnType<typeof setTimeout>>
  > = {};
  private destroyed = false;

  protected readonly sideTabs: readonly TabItem[] = [
    { id: 'files', label: 'Files' },
    { id: 'instructions', label: 'Instructions' },
  ];

  protected readonly bottomTabs = computed<readonly TabItem[]>(() => [
    { id: 'tests', label: 'Tests' },
    { id: 'http', label: 'HTTP client' },
    { id: 'output', label: 'Output' },
  ]);

  protected readonly editableFiles = computed(() =>
    (this.loaded()?.project.files ?? []).filter((f) => f.editable).map((f) => f.path),
  );

  protected readonly modified = computed(() => {
    const starter = this.loaded()?.starter ?? {};
    const contents = this.contents();
    return new Set(this.editableFiles().filter((p) => contents[p] !== starter[p]));
  });

  /** Only editable files are ever sent to the server. */
  private readonly submittedFiles = computed(() => {
    const contents = this.contents();
    return Object.fromEntries(this.editableFiles().map((p) => [p, contents[p] ?? '']));
  });

  protected readonly namespace = computed(() => `${this.id()}/${this.framework()}`);

  /** A run of this user is in progress (the server allows one at a time). */
  protected readonly running = computed(() =>
    [this.run(), this.requestRun()].some((r) => r !== undefined && r.status !== 'completed'),
  );

  /** The run whose output and diagnostics are shown: the one that finished last. */
  protected readonly outputRun = computed(() =>
    this.latest() === 'requests' ? this.requestRun() : this.run(),
  );

  protected readonly remainingMs = computed(() => {
    const t = this.timedSession();
    if (!t) return undefined;
    return Math.max(0, Date.parse(t.deadline) - (this.now() + this.clockOffset()));
  });

  protected readonly timedOver = computed(() => {
    const t = this.timedSession();
    return t !== undefined && (t.status !== 'active' || this.remainingMs() === 0);
  });

  protected readonly remainingLabel = computed(() => {
    const ms = this.remainingMs();
    if (ms === undefined) return '';
    const total = Math.ceil(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return `${h > 0 ? `${h}:` : ''}${String(m).padStart(h > 0 ? 2 : 1, '0')}:${String(s).padStart(2, '0')}`;
  });

  protected readonly diagnostics = computed<readonly WebDiagnostic[]>(
    () => this.outputRun()?.result?.diagnostics ?? [],
  );

  constructor() {
    effect(() => {
      const id = this.id();
      const framework = this.framework();
      const timed = this.timed();
      untracked(() => void this.load(id, framework, timed));
    });

    const clock = setInterval(() => this.now.set(Date.now()), 1000);

    const beforeUnload = (event: BeforeUnloadEvent): void => {
      if (this.timedSession()?.status === 'active' && !this.timedOver()) event.preventDefault();
      this.flushLocal();
    };
    window.addEventListener('beforeunload', beforeUnload);

    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      clearInterval(clock);
      window.removeEventListener('beforeunload', beforeUnload);
      this.flushLocal();
      clearTimeout(this.pollTimers.tests);
      clearTimeout(this.pollTimers.requests);
      clearTimeout(this.accountTimer);
    });
  }

  private async load(id: string, framework: string, timedId: string | undefined): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    this.run.set(undefined);
    this.requestRun.set(undefined);
    this.latest.set('tests');
    this.recovery.set(null);
    try {
      const fw = framework as WebFramework;
      const [detail, projectRes] = await Promise.all([
        this.service.detail(id),
        this.service.project(id, fw),
      ]);
      const project = projectRes.project;
      const starter = Object.fromEntries(project.files.map((f) => [f.path, f.content]));
      const version = projectRes.challengeVersion;

      // Drafts: this browser's and the account's; the newer wins.
      const local = readLocalDraft(id, fw);
      const account = await this.service.accountDraft(id, fw).then(
        (r) => r.draft,
        () => null,
      );
      const candidates = [local, account].filter((d): d is NonNullable<typeof d> => !!d);
      const newest = candidates.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
      let contents: Record<string, string> = { ...starter };
      if (newest && newest.challengeVersion === version) {
        contents = { ...starter, ...pickEditable(newest.files, project) };
      } else if (newest) {
        // Written for another version of the challenge: never applied silently, never discarded silently.
        this.recovery.set({ version: newest.challengeVersion, files: newest.files });
      }

      if (timedId) {
        const timedRes = await this.service.getTimed(timedId);
        this.timedSession.set(timedRes.session);
        this.clockOffset.set(Date.parse(timedRes.serverTime) - Date.now());
      } else {
        this.timedSession.set(undefined);
      }

      this.loaded.set({
        challenge: detail.challenge,
        project,
        executionAvailable: detail.executionAvailable,
        starter,
      });
      this.contents.set(contents);
      this.savedRequests.set(readLocalRequests(id, fw));
      this.openTabs.set([project.entryFile]);
      this.active.set(project.entryFile);
      this.saveStatus.set('saved');
    } catch (err) {
      this.loadError.set(errorMessage(err));
    } finally {
      this.loading.set(false);
    }
  }

  /* ---------- Files and tabs ---------- */

  protected openFile(path: string): void {
    if (!this.openTabs().includes(path)) this.openTabs.update((tabs) => [...tabs, path]);
    this.active.set(path);
    this.revealLine.set(undefined);
  }

  protected closeTab(path: string, event?: Event): void {
    event?.stopPropagation();
    const tabs = this.openTabs();
    if (tabs.length <= 1) return;
    const index = tabs.indexOf(path);
    const next = tabs.filter((t) => t !== path);
    this.openTabs.set(next);
    if (this.active() === path) this.active.set(next[Math.max(0, index - 1)] ?? next[0] ?? '');
  }

  protected fileName(path: string): string {
    return path.slice(path.lastIndexOf('/') + 1);
  }

  protected isEditable(path: string): boolean {
    return this.editableFiles().includes(path);
  }

  protected onChange(change: { path: string; content: string }): void {
    if (!this.isEditable(change.path)) return;
    this.contents.update((c) => ({ ...c, [change.path]: change.content }));
    this.saveStatus.set('unsaved');
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flushLocal(), 600);
    clearTimeout(this.accountTimer);
    this.accountTimer = setTimeout(() => void this.saveToAccount(), 3000);
  }

  protected openDiagnostic(d: WebDiagnostic): void {
    if (!d.file) return;
    this.sideTab.set('files');
    this.openFile(d.file);
    this.revealLine.set(d.line);
  }

  /* ---------- Drafts ---------- */

  private flushLocal(): void {
    const loaded = this.loaded();
    if (!loaded || this.saveStatus() === 'saved') return;
    clearTimeout(this.saveTimer);
    writeLocalDraft(this.id(), this.framework() as WebFramework, {
      challengeVersion: loaded.challenge.version,
      files: this.submittedFiles(),
      updatedAt: new Date().toISOString(),
    });
    if (this.saveStatus() === 'unsaved') this.saveStatus.set('saved-locally');
  }

  private async saveToAccount(): Promise<void> {
    const loaded = this.loaded();
    if (!loaded || this.destroyed) return;
    this.flushLocal();
    this.saveStatus.set('saving');
    try {
      await this.service.saveAccountDraft(
        this.id(),
        this.framework() as WebFramework,
        loaded.challenge.version,
        this.submittedFiles(),
      );
      if (this.saveStatus() === 'saving') this.saveStatus.set('saved');
    } catch {
      // Still safe in this browser.
      if (this.saveStatus() === 'saving') this.saveStatus.set('saved-locally');
    }
  }

  protected restoreRecovery(): void {
    const r = this.recovery();
    const loaded = this.loaded();
    if (!r || !loaded) return;
    this.contents.update((c) => ({ ...c, ...pickEditable(r.files, loaded.project) }));
    this.recovery.set(null);
    this.saveStatus.set('unsaved');
    this.flushLocal();
    void this.saveToAccount();
  }

  protected discardRecovery(): void {
    this.recovery.set(null);
    removeLocalDraft(this.id(), this.framework() as WebFramework);
    void this.service
      .deleteAccountDraft(this.id(), this.framework() as WebFramework)
      .catch(() => undefined);
  }

  protected askReset(): void {
    this.resetDialog()?.open();
  }

  protected reset(): void {
    const loaded = this.loaded();
    if (!loaded) return;
    this.contents.set({ ...loaded.starter });
    removeLocalDraft(this.id(), this.framework() as WebFramework);
    void this.service
      .deleteAccountDraft(this.id(), this.framework() as WebFramework)
      .catch(() => undefined);
    this.saveStatus.set('saved');
    this.announce('The project was reset to the starter code.');
  }

  protected switchFramework(event: Event): void {
    const framework = (event.target as HTMLSelectElement).value;
    this.flushLocal();
    void this.router.navigate(['/web-challenges', this.id(), framework, 'workspace']);
  }

  /* ---------- Runs and submissions ---------- */

  protected async runTests(mode: 'visible' | 'submit'): Promise<void> {
    if (this.running()) return;
    this.runError.set(null);
    this.bottomTab.set('tests');
    this.flushLocal();
    try {
      const timed = this.timedSession();
      const res = await this.service.createRun(this.id(), {
        framework: this.framework() as WebFramework,
        files: this.submittedFiles(),
        mode,
        ...(mode === 'submit' && timed ? { timedSessionId: timed.id } : {}),
      });
      this.run.set(res.run);
      this.announce(mode === 'submit' ? 'Submission started.' : 'Running the visible tests.');
      this.poll(res.run.id, 'tests');
    } catch (err) {
      this.runError.set(errorMessage(err));
    }
  }

  /* ---------- HTTP client ---------- */

  protected async sendRequests(requests: WebHttpRequest[]): Promise<void> {
    if (this.running()) return;
    this.requestError.set(null);
    this.flushLocal();
    this.saveRequests(requests);
    try {
      const res = await this.service.createRun(this.id(), {
        framework: this.framework() as WebFramework,
        files: this.submittedFiles(),
        mode: 'requests',
        requests,
      });
      this.requestRun.set(res.run);
      this.announce('Building the application and sending the requests.');
      this.poll(res.run.id, 'requests');
    } catch (err) {
      this.requestError.set(errorMessage(err));
    }
  }

  protected saveRequests(requests: WebHttpRequest[]): void {
    writeLocalRequests(this.id(), this.framework() as WebFramework, requests);
  }

  private poll(runId: string, kind: 'tests' | 'requests'): void {
    const target = kind === 'tests' ? this.run : this.requestRun;
    const error = kind === 'tests' ? this.runError : this.requestError;
    clearTimeout(this.pollTimers[kind]);
    this.pollTimers[kind] = setTimeout(async () => {
      if (this.destroyed) return;
      try {
        const res = await this.service.getRun(runId);
        target.set(res.run);
        if (res.run.status !== 'completed') {
          this.poll(runId, kind);
          return;
        }
        this.latest.set(kind);
        const verdict = res.run.result?.verdict ?? 'infrastructure-error';
        const what =
          res.run.mode === 'submit'
            ? 'Submission'
            : res.run.mode === 'requests'
              ? 'HTTP requests'
              : 'Visible tests';
        this.announce(`${what}: ${verdict.replace(/-/g, ' ')}.`);
        if (res.run.progress) this.service.recordProgress(res.run.progress);
        if (res.run.timedSessionId) {
          const t = await this.service.getTimed(res.run.timedSessionId).catch(() => undefined);
          if (t) this.timedSession.set(t.session);
        }
      } catch (err) {
        error.set(errorMessage(err));
        target.set(undefined);
      }
    }, 1000);
  }

  /* ---------- Timed sessions ---------- */

  protected async finishTimed(): Promise<void> {
    const t = this.timedSession();
    if (!t) return;
    try {
      this.timedSession.set((await this.service.finishTimed(t.id)).session);
    } catch (err) {
      this.runError.set(errorMessage(err));
    }
  }

  protected timeUsed(): string {
    const t = this.timedSession();
    if (!t) return '';
    const end = t.finishedAt
      ? Date.parse(t.finishedAt)
      : Math.min(Date.parse(t.deadline), this.now() + this.clockOffset());
    const minutes = Math.max(0, Math.round((end - Date.parse(t.startedAt)) / 60_000));
    return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
  }

  protected verdictLabel(verdict: WebVerdict): string {
    return WEB_VERDICT_LABELS[verdict];
  }

  private announce(text: string): void {
    this.announcement.set(text);
  }

  protected saveLabel(): string {
    switch (this.saveStatus()) {
      case 'saved':
        return 'All changes saved';
      case 'saving':
        return 'Saving…';
      case 'saved-locally':
        return 'Saved in this browser';
      default:
        return 'Unsaved changes';
    }
  }
}

function pickEditable(
  files: Readonly<Record<string, string>>,
  project: WebImplementation,
): Record<string, string> {
  const editable = new Set(project.files.filter((f) => f.editable).map((f) => f.path));
  return Object.fromEntries(Object.entries(files).filter(([p]) => editable.has(p)));
}
