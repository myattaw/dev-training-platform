import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import type { WebHttpRequest, WebHttpResponse } from '@pracstack/api-contracts';
import type { HttpEndpoint } from '@pracstack/content-model';

const METHODS: readonly WebHttpRequest['method'][] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

/**
 * A small HTTP client for the learner's running application. Requests go to
 * the API, which forwards them only to this user's own sandboxed application
 * (relative paths only; see docs/execution-security.md). Nothing here can
 * reach another host.
 */
@Component({
  selector: 'app-http-client',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="request" (submit)="$event.preventDefault(); submit()" aria-label="HTTP request">
      <div class="line">
        <label>
          <span class="sr-only">Method</span>
          <select
            class="select method"
            [value]="method()"
            (change)="method.set($any($event.target).value)"
          >
            @for (m of methods; track m) {
              <option [value]="m">{{ m }}</option>
            }
          </select>
        </label>
        <label class="path">
          <span class="sr-only">Path</span>
          <input
            class="input mono"
            type="text"
            spellcheck="false"
            [value]="path()"
            (input)="path.set($any($event.target).value)"
            placeholder="/api/…"
          />
        </label>
        <button type="submit" class="btn btn--primary" [disabled]="!canSend()">
          {{ busy() ? 'Sending…' : 'Send' }}
        </button>
        @if (endpoints().length > 0) {
          <label>
            <span class="sr-only">Example requests</span>
            <select
              class="select"
              (change)="useExample($any($event.target).value); $any($event.target).value = ''"
            >
              <option value="">Examples…</option>
              @for (e of endpoints(); track $index) {
                <option [value]="$index">{{ e.method }} {{ e.path }}</option>
              }
            </select>
          </label>
        }
      </div>
      @if (!ready()) {
        <p class="hint text-secondary">{{ notReadyMessage() }}</p>
      }
      <div class="fields">
        <label class="field">
          <span class="field-label"
            >Headers <span class="text-secondary">(one per line, Name: value)</span></span
          >
          <textarea
            class="input mono"
            rows="2"
            spellcheck="false"
            [value]="headers()"
            (input)="headers.set($any($event.target).value)"
          ></textarea>
        </label>
        @if (method() !== 'GET' && method() !== 'DELETE') {
          <label class="field">
            <span class="field-label">Body (JSON)</span>
            <textarea
              class="input mono"
              rows="5"
              spellcheck="false"
              [value]="body()"
              (input)="body.set($any($event.target).value)"
            ></textarea>
          </label>
        }
      </div>
      @if (formError(); as e) {
        <p class="error" role="alert">{{ e }}</p>
      }
    </form>

    <section class="response" aria-label="HTTP response" aria-live="polite">
      @if (response(); as r) {
        @if (r.error) {
          <p class="error">{{ r.error }}</p>
        } @else {
          <p class="status-line">
            <span class="status" [class.ok]="(r.status ?? 0) < 400">{{ r.status }}</span>
            @if (r.durationMs !== undefined) {
              <span class="text-secondary">≈ {{ r.durationMs }} ms</span>
            }
            @if (r.truncated) {
              <span class="text-secondary">(body truncated at 64 KB)</span>
            }
          </p>
          <details>
            <summary>Headers ({{ headerList().length }})</summary>
            <dl class="headers mono">
              @for (h of headerList(); track h[0]) {
                <div>
                  <dt>{{ h[0] }}</dt>
                  <dd>{{ h[1] }}</dd>
                </div>
              }
            </dl>
          </details>
          <pre class="body mono">{{ prettyBody() }}</pre>
        }
      } @else {
        <p class="text-secondary hint">Send a request to see the response.</p>
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
    .line {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      align-items: center;
    }
    .path {
      flex: 1 1 240px;
    }
    .path .input {
      width: 100%;
    }
    .method {
      width: 96px;
    }
    .mono {
      font-family: var(--font-mono, monospace);
      font-size: var(--font-size-sm);
    }
    .fields {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      margin-top: var(--space-2);
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
      margin: var(--space-1) 0 0;
      font-size: var(--font-size-sm);
    }
    .error {
      margin: var(--space-1) 0 0;
      color: var(--color-error);
      font-size: var(--font-size-sm);
    }
    .response {
      border-top: 1px solid var(--color-border);
      padding-top: var(--space-2);
    }
    .status-line {
      display: flex;
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
      max-height: 320px;
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
  readonly ready = input(false);
  readonly busy = input(false);
  readonly response = input<WebHttpResponse | undefined>(undefined);
  readonly notReadyMessage = input('Start the application with Run application to send requests.');
  readonly send = output<WebHttpRequest>();

  protected readonly methods = METHODS;
  protected readonly method = signal<WebHttpRequest['method']>('GET');
  protected readonly path = signal('/');
  protected readonly headers = signal('');
  protected readonly body = signal('');
  protected readonly formError = signal<string | null>(null);

  protected readonly canSend = computed(
    () => this.ready() && !this.busy() && this.path().startsWith('/'),
  );

  protected readonly headerList = computed(() => Object.entries(this.response()?.headers ?? {}));
  protected readonly prettyBody = computed(() => {
    const text = this.response()?.body ?? '';
    try {
      return text ? JSON.stringify(JSON.parse(text), null, 2) : '(empty body)';
    } catch {
      return text;
    }
  });

  protected useExample(index: string): void {
    const e = this.endpoints()[Number(index)];
    if (!e) return;
    this.method.set(e.method);
    this.path.set(e.path);
    this.body.set(e.exampleBody ?? '');
    this.headers.set(e.exampleBody ? 'Content-Type: application/json' : '');
  }

  protected submit(): void {
    this.formError.set(null);
    const headers: Record<string, string> = {};
    for (const line of this.headers().split('\n')) {
      if (!line.trim()) continue;
      const colon = line.indexOf(':');
      if (colon <= 0) {
        this.formError.set(`"${line.trim()}" is not a header (use Name: value).`);
        return;
      }
      headers[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
    }
    const withBody =
      this.method() !== 'GET' && this.method() !== 'DELETE' && this.body().trim() !== '';
    if (withBody && !Object.keys(headers).some((h) => h.toLowerCase() === 'content-type')) {
      headers['Content-Type'] = 'application/json';
    }
    this.send.emit({
      method: this.method(),
      path: this.path().trim(),
      ...(Object.keys(headers).length ? { headers } : {}),
      ...(withBody ? { body: this.body() } : {}),
    });
  }
}
