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
  WebHttpResponse,
  WebRun,
  WebSession,
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
import { StatusIndicator } from '../../../shared/ui/status-indicator/status-indicator';
import { type TabItem, Tabs } from '../../../shared/ui/tabs/tabs';
import { DifficultyBadge } from '../../challenges/ui/difficulty-badge';
import {
  readLocalDraft,
  removeLocalDraft,
  WebChallengesService,
  writeLocalDraft,
} from '../data-access/web-challenges.service';
import { FileTree } from '../ui/file-tree';
import { HttpClient } from '../ui/http-client';
import { SESSION_LABELS, SESSION_STATUS } from '../ui/labels';
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

const FINAL_SESSION_STATES = [
  'build-failed',
  'startup-failed',
  'resource-limit',
  'expired',
  'stopped',
  'unavailable',
];

/**
 * The multi-file workspace for a Web Development Challenge: edit the project,
 * run the application and send it HTTP requests, run the visible tests, and
 * submit for grading. Drafts are kept per challenge and framework (in this
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
    StatusIndicator,
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
  protected readonly sessionLabels = SESSION_LABELS;
  protected readonly sessionStatus = SESSION_STATUS;

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
  protected readonly session = signal<WebSession | undefined>(undefined);
  protected readonly sessionError = signal<string | null>(null);
  /** Content of the editable files when the running application was started. */
  private readonly sessionFiles = signal<string | null>(null);
  protected readonly httpBusy = signal(false);
  protected readonly httpResponse = signal<WebHttpResponse | undefined>(undefined);
  protected readonly timedSession = signal<WebTimedSession | undefined>(undefined);
  private readonly clockOffset = signal(0);
  protected readonly now = signal(Date.now());
  protected readonly announcement = signal('');

  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  private accountTimer: ReturnType<typeof setTimeout> | undefined;
  private pollTimer: ReturnType<typeof setTimeout> | undefined;
  private sessionTimer: ReturnType<typeof setTimeout> | undefined;
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

  protected readonly running = computed(() => {
    const r = this.run();
    return r !== undefined && r.status !== 'completed';
  });

  protected readonly appStarting = computed(() => {
    const s = this.session()?.state;
    return s === 'queued' || s === 'building' || s === 'starting';
  });

  protected readonly appReady = computed(() => this.session()?.state === 'ready');

  /** The running application was built from different code than the editor shows. */
  protected readonly stale = computed(
    () => this.appReady() && this.sessionFiles() !== JSON.stringify(this.submittedFiles()),
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

  protected readonly diagnostics = computed<readonly WebDiagnostic[]>(() => {
    const sessionDiagnostics =
      this.session()?.state === 'build-failed' ? (this.session()?.diagnostics ?? []) : [];
    return [...(this.run()?.result?.diagnostics ?? []), ...sessionDiagnostics];
  });

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
      clearTimeout(this.pollTimer);
      clearTimeout(this.sessionTimer);
      clearTimeout(this.accountTimer);
      // Leaving the workspace stops its application: nothing keeps running unattended.
      const s = this.session();
      if (s && !FINAL_SESSION_STATES.includes(s.state))
        void this.service.stopSession(s.id).catch(() => undefined);
    });
  }

  private async load(id: string, framework: string, timedId: string | undefined): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    this.run.set(undefined);
    this.session.set(undefined);
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
      this.poll(res.run.id);
    } catch (err) {
      this.runError.set(errorMessage(err));
    }
  }

  private poll(runId: string): void {
    clearTimeout(this.pollTimer);
    this.pollTimer = setTimeout(async () => {
      if (this.destroyed) return;
      try {
        const res = await this.service.getRun(runId);
        this.run.set(res.run);
        if (res.run.status !== 'completed') {
          this.poll(runId);
          return;
        }
        const verdict = res.run.result?.verdict ?? 'infrastructure-error';
        this.announce(
          `${res.run.mode === 'submit' ? 'Submission' : 'Visible tests'}: ${verdict.replace(/-/g, ' ')}.`,
        );
        if (res.run.progress) this.service.recordProgress(res.run.progress);
        if (res.run.timedSessionId) {
          const t = await this.service.getTimed(res.run.timedSessionId).catch(() => undefined);
          if (t) this.timedSession.set(t.session);
        }
      } catch (err) {
        this.runError.set(errorMessage(err));
        this.run.set(undefined);
      }
    }, 1000);
  }

  /* ---------- Running application and HTTP client ---------- */

  protected async startApp(): Promise<void> {
    this.sessionError.set(null);
    this.bottomTab.set('http');
    this.flushLocal();
    try {
      const files = this.submittedFiles();
      const res = await this.service.createSession(
        this.id(),
        this.framework() as WebFramework,
        files,
      );
      this.session.set(res.session);
      this.sessionFiles.set(JSON.stringify(files));
      this.announce('Building and starting the application.');
      this.watchSession(res.session.id);
    } catch (err) {
      this.sessionError.set(errorMessage(err));
    }
  }

  protected async stopApp(): Promise<void> {
    const s = this.session();
    if (!s) return;
    clearTimeout(this.sessionTimer);
    try {
      this.session.set((await this.service.stopSession(s.id)).session);
      this.announce('The application was stopped.');
    } catch (err) {
      this.sessionError.set(errorMessage(err));
    }
  }

  private watchSession(id: string): void {
    clearTimeout(this.sessionTimer);
    const current = this.session();
    const delay = current?.state === 'ready' ? 10_000 : 1500;
    this.sessionTimer = setTimeout(async () => {
      if (this.destroyed) return;
      try {
        const before = this.session()?.state;
        const res = await this.service.getSession(id);
        this.session.set(res.session);
        if (before !== res.session.state)
          this.announce(`Application: ${SESSION_LABELS[res.session.state]}.`);
        if (res.session.state === 'build-failed') this.bottomTab.set('output');
        if (!FINAL_SESSION_STATES.includes(res.session.state)) this.watchSession(id);
      } catch {
        // The session is gone (e.g. the server restarted).
        this.session.update((s) => (s ? { ...s, state: 'stopped' } : s));
      }
    }, delay);
  }

  protected async sendRequest(request: WebHttpRequest): Promise<void> {
    const s = this.session();
    if (!s) return;
    this.httpBusy.set(true);
    try {
      const res = await this.service.send(s.id, request);
      this.httpResponse.set(res.response);
      this.session.set(res.session);
    } catch (err) {
      this.httpResponse.set({ headers: {}, body: '', truncated: false, error: errorMessage(err) });
    } finally {
      this.httpBusy.set(false);
    }
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
    const end = t.finishedAt ? Date.parse(t.finishedAt) : Math.min(Date.parse(t.deadline), this.now() + this.clockOffset());
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
