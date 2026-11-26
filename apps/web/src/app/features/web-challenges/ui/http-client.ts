import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import {
  WEB_REQUEST_LIMITS,
  WEB_VERDICT_LABELS,
  type WebDiagnostic,
  type WebHttpExchange,
  type WebHttpRequest,
  type WebRun,
} from '@pracstack/api-contracts';
import type { HttpEndpoint } from '@pracstack/content-model';
import { Icon } from '../../../shared/ui/icon/icon';

const METHODS: readonly WebHttpRequest['method'][] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

/** A request as edited: headers as text lines ("Name: value"). */
interface Row {
  readonly id: number;
  readonly method: WebHttpRequest['method'];
  readonly path: string;
  readonly headers: string;
  readonly body: string;
}

const RUN_STATUS: Readonly<Record<string, string>> = {
  queued: 'Waiting for a free runner…',
  building: 'Building your code…',
  starting: 'Starting the application…',
  testing: 'Sending the requests…',
};

const hasBody = (method: WebHttpRequest['method']) => method !== 'GET' && method !== 'DELETE';

/**
 * The HTTP client: the learner lists requests, and one Send builds the
 * current code, starts a fresh application, sends the requests in order
 * (state carries over from one request to the next), returns every response
 * and stops the application. Requests go to the API, which sends them only to
 * this user's own sandboxed application (relative paths only; see
 * docs/execution-security.md). Nothing here can reach another host, and
 * nothing keeps running between sends.
 */
@Component({
  selector: 'app-http-client',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="requests" (submit)="$event.preventDefault(); submit()" aria-label="HTTP requests">
      <p class="hint text-secondary">
        Send builds your current code, starts a fresh application, sends these requests in order,
        and stops it. Each send counts as one run toward your daily limit; nothing is graded.
      </p>
      <ol class="list">
        @for (row of rows(); track row.id; let i = $index) {
          <li class="request">
            <div class="line">
              <span class="num text-secondary" aria-hidden="true">{{ i + 1 }}</span>
              <select
                class="select method"
                [attr.aria-label]="'Method of request ' + (i + 1)"
                [value]="row.method"
                (change)="update(row.id, { method: $any($event.target).value })"
              >
                @for (m of methods; track m) {
                  <option [value]="m" [selected]="m === row.method">{{ m }}</option>
                }
              </select>
              <input
                class="input mono path"
                type="text"
                spellcheck="false"
                [attr.aria-label]="'Path of request ' + (i + 1)"
                [value]="row.path"
                (input)="update(row.id, { path: $any($event.target).value })"
                placeholder="/api/…"
              />
              <button
                type="button"
                class="btn btn--icon btn--sm"
                [attr.aria-label]="'Remove request ' + (i + 1)"
                [disabled]="rows().length === 1"
                (click)="remove(row.id)"
              >
                <app-icon name="close" />
              </button>
            </div>
            <details class="extra" [open]="row.headers !== '' || row.body !== ''">
              <summary>Headers{{ hasBody(row.method) ? ' and body' : '' }}</summary>
              <div class="fields">
                <label class="field">
                  <span class="field-label"
                    >Headers <span class="text-secondary">(one per line, Name: value)</span></span
                  >
                  <textarea
                    class="input mono"
                    rows="2"
                    spellcheck="false"
                    [value]="row.headers"
                    (input)="update(row.id, { headers: $any($event.target).value })"
                  ></textarea>
                </label>
                @if (hasBody(row.method)) {
                  <label class="field">
                    <span class="field-label">Body (JSON)</span>
                    <textarea
                      class="input mono"
                      rows="4"
                      spellcheck="false"
                      [value]="row.body"
                      (input)="update(row.id, { body: $any($event.target).value })"
                    ></textarea>
                  </label>
                }
              </div>
            </details>
          </li>
        }
      </ol>
      <div class="line actions">
        <button
          type="button"
          class="btn btn--sm"
          (click)="add()"
          [disabled]="rows().length >= maxRequests"
        >
          Add request
        </button>
        @if (endpoints().length > 0) {
          <label>
            <span class="sr-only">Add an example request</span>
            <select
              class="select select--sm"
              [disabled]="rows().length >= maxRequests"
              (change)="addExample($any($event.target).value); $any($event.target).value = ''"
            >
              <option value="">Add an example…</option>
              @for (e of endpoints(); track $index) {
                <option [value]="$index">{{ e.method }} {{ e.path }}</option>
              }
            </select>
          </label>
        }
        <span class="count text-secondary">{{ rows().length }}/{{ maxRequests }} requests</span>
        <button type="submit" class="btn btn--sm btn--primary" [disabled]="!canSend()">
          <app-icon name="play" /> {{ busy() ? 'Running…' : 'Send requests' }}
        </button>
      </div>
      @if (disabledMessage(); as m) {
        <p class="hint text-secondary">{{ m }}</p>
      }
      @if (formError(); as e) {
        <p class="error" role="alert">{{ e }}</p>
      }
    </form>

    <section class="responses" aria-label="HTTP responses" aria-live="polite">
      @if (run(); as r) {
        @if (r.status !== 'completed') {
          <p class="text-secondary">{{ runStatus[r.status] ?? 'Running…' }}</p>
        } @else if (r.result; as result) {
          @if (result.verdict !== 'responded') {
            <div class="failed">
              <p class="error">
                <strong>{{ verdictLabels[result.verdict] }}.</strong>
                {{ result.message ?? 'The application could not answer the requests.' }}
              </p>
              @for (d of result.diagnostics; track $index) {
                <p class="diag">
                  @if (d.file) {
                    <button type="button" class="btn btn--link" (click)="openDiagnostic.emit(d)">
                      {{ d.file }}:{{ d.line }}
                    </button>
                  }
                  {{ d.message }}
                </p>
              }
              @if (result.logs.length > 0) {
                <p class="text-secondary small">The application's output is in the Output tab.</p>
              }
            </div>
          } @else {
            <ol class="list">
              @for (x of result.exchanges ?? []; track $index; let i = $index) {
                <li class="exchange">
                  <p class="status-line">
                    <span class="num text-secondary">{{ i + 1 }}</span>
                    <span class="mono">{{ x.request.method }} {{ x.request.path }}</span>
                    @if (x.response.error) {
                      <span class="error">{{ x.response.error }}</span>
                    } @else {
                      <span class="status" [class.ok]="(x.response.status ?? 0) < 400">{{
                        x.response.status
                      }}</span>
                      @if (x.response.durationMs !== undefined) {
                        <span class="text-secondary">≈ {{ x.response.durationMs }} ms</span>
                      }
                      @if (x.response.truncated) {
                        <span class="text-secondary">(body truncated)</span>
                      }
                    }
                  </p>
                  @if (!x.response.error) {
                    <details>
                      <summary>Headers ({{ headerList(x).length }})</summary>
                      <dl class="headers mono">
                        @for (h of headerList(x); track h[0]) {
                          <div>
                            <dt>{{ h[0] }}</dt>
                            <dd>{{ h[1] }}</dd>
                          </div>
                        }
                      </dl>
                    </details>
                    <pre class="body mono">{{ prettyBody(x) }}</pre>
                  }
                </li>
              }
            </ol>
          }
        }
      } @else {
        <p class="text-secondary hint">Send the requests to see the responses.</p>
      }
    </section>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      min-height: 0;
      padding: var(--space-2) var(--space-3);
      overflow: auto;
    }
    .list {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .line {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      align-items: center;
    }
    .actions {
      margin-top: var(--space-2);
    }
    .count {
      margin-left: auto;
      font-size: var(--font-size-sm);
    }
    .num {
      min-width: 1.5em;
      font-size: var(--font-size-sm);
      text-align: right;
    }
    .path {
      flex: 1 1 240px;
    }
    .method {
      width: 96px;
    }
    .mono {
      font-family: var(--font-mono, monospace);
      font-size: var(--font-size-sm);
    }
    .extra {
      margin: var(--space-1) 0 0 calc(1.5em + var(--space-2));
      font-size: var(--font-size-sm);
    }
    .fields {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      margin-top: var(--space-1);
    }
    .field {
      display: flex;
      flex: 1 1 260px;
      flex-direction: column;
      gap: 2px;
    }
    .field-label {
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-bold);
    }
    textarea {
      resize: vertical;
    }
    .hint {
      margin: 0;
      font-size: var(--font-size-sm);
    }
    .small {
      font-size: var(--font-size-sm);
    }
    .error {
      margin: var(--space-1) 0 0;
      color: var(--color-error);
      font-size: var(--font-size-sm);
    }
    .diag {
      margin: var(--space-1) 0 0;
      font-family: var(--font-mono, monospace);
      font-size: var(--font-size-sm);
    }
    .responses {
      border-top: 1px solid var(--color-border);
      padding-top: var(--space-2);
    }
    .status-line {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      align-items: baseline;
      margin: 0 0 var(--space-1);
    }
    .status {
      font-weight: var(--font-weight-bold);
      color: var(--color-error);
    }
    .status.ok {
      color: var(--color-success);
    }
    .headers {
      margin: var(--space-1) 0;
    }
    .headers div {
      display: flex;
      gap: var(--space-2);
    }
    .headers dt {
      color: var(--color-text-secondary);
    }
    .headers dd {
      margin: 0;
      word-break: break-all;
    }
    .body {
      margin: var(--space-1) 0 0;
      padding: var(--space-2);
      max-height: 240px;
      overflow: auto;
      background: var(--color-surface-muted);
      border: 1px solid var(--color-border);
      white-space: pre-wrap;
      word-break: break-word;
    }
  `,
})
export class HttpClient {
  readonly endpoints = input<readonly HttpEndpoint[]>([]);
  /** The requests to start from (e.g. kept in this browser); read when it changes. */
  readonly initial = input<readonly WebHttpRequest[] | undefined>(undefined);
  /** Why requests cannot be sent now (no execution, time is up); empty when they can. */
  readonly disabledMessage = input('');
  /** A run of this user is in progress (one at a time). */
  readonly busy = input(false);
  /** The latest HTTP-client run. */
  readonly run = input<WebRun | undefined>(undefined);
  readonly send = output<WebHttpRequest[]>();
  /** The request list changed (best effort: header lines without a colon are left out). */
  readonly changed = output<WebHttpRequest[]>();
  readonly openDiagnostic = output<WebDiagnostic>();

  protected readonly methods = METHODS;
  protected readonly maxRequests = WEB_REQUEST_LIMITS.maxRequests;
  protected readonly verdictLabels = WEB_VERDICT_LABELS;
  protected readonly runStatus = RUN_STATUS;
  protected readonly hasBody = hasBody;
  private nextId = 1;
  protected readonly rows = signal<readonly Row[]>([this.row('GET', '/')]);
  protected readonly formError = signal<string | null>(null);

  protected readonly canSend = computed(
    () => !this.disabledMessage() && !this.busy() && this.rows().length > 0,
  );

  constructor() {
    effect(() => {
      const initial = this.initial();
      untracked(() => {
        if (initial && initial.length > 0) {
          this.rows.set(
            initial.map((r) =>
              this.row(
                r.method,
                r.path,
                Object.entries(r.headers ?? {})
                  .map(([name, value]) => `${name}: ${value}`)
                  .join('\n'),
                r.body ?? '',
              ),
            ),
          );
        }
      });
    });
  }

  protected update(id: number, change: Partial<Omit<Row, 'id'>>): void {
    this.rows.update((rows) => rows.map((r) => (r.id === id ? { ...r, ...change } : r)));
    this.emitChanged();
  }

  protected add(): void {
    if (this.rows().length >= this.maxRequests) return;
    this.rows.update((rows) => [...rows, this.row('GET', '/')]);
    this.emitChanged();
  }

  protected addExample(index: string): void {
    const e = this.endpoints()[Number(index)];
    if (!e || this.rows().length >= this.maxRequests) return;
    const row = this.row(
      e.method,
      e.path,
      e.exampleBody ? 'Content-Type: application/json' : '',
      e.exampleBody ?? '',
    );
    // A single untouched "GET /" is replaced rather than kept.
    const rows = this.rows();
    const pristine = rows.length === 1 && rows[0]?.path === '/' && rows[0].method === 'GET';
    this.rows.set(pristine ? [row] : [...rows, row]);
    this.emitChanged();
  }

  protected remove(id: number): void {
    if (this.rows().length <= 1) return;
    this.rows.update((rows) => rows.filter((r) => r.id !== id));
    this.emitChanged();
  }

  protected headerList(x: WebHttpExchange): [string, string][] {
    return Object.entries(x.response.headers);
  }

  protected prettyBody(x: WebHttpExchange): string {
    const text = x.response.body;
    try {
      return text ? JSON.stringify(JSON.parse(text), null, 2) : '(empty body)';
    } catch {
      return text;
    }
  }

  protected submit(): void {
    this.formError.set(null);
    const requests: WebHttpRequest[] = [];
    for (const [i, row] of this.rows().entries()) {
      const parsed = toRequest(row, true);
      if (typeof parsed === 'string') {
        this.formError.set(`Request ${i + 1}: ${parsed}`);
        return;
      }
      requests.push(parsed);
    }
    this.send.emit(requests);
  }

  private emitChanged(): void {
    this.changed.emit(
      this.rows()
        .map((r) => toRequest(r, false))
        .filter((r) => typeof r !== 'string'),
    );
  }

  private row(method: WebHttpRequest['method'], path: string, headers = '', body = ''): Row {
    return { id: this.nextId++, method, path, headers, body };
  }
}

/** The request a row describes, or (strict) why it is not valid. */
function toRequest(row: Row, strict: boolean): WebHttpRequest | string {
  const path = row.path.trim();
  if (strict && !path.startsWith('/')) return 'the path must start with / (for example /api/…).';
  const headers: Record<string, string> = {};
  for (const line of row.headers.split('\n')) {
    if (!line.trim()) continue;
    const colon = line.indexOf(':');
    if (colon <= 0) {
      if (strict) return `"${line.trim()}" is not a header (use Name: value).`;
      continue;
    }
    headers[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
  }
  const withBody = hasBody(row.method) && row.body.trim() !== '';
  if (withBody && !Object.keys(headers).some((h) => h.toLowerCase() === 'content-type')) {
    headers['Content-Type'] = 'application/json';
  }
  return {
    method: row.method,
    path,
    ...(Object.keys(headers).length ? { headers } : {}),
    ...(withBody ? { body: row.body } : {}),
  };
}
