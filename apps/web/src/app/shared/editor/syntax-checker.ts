import { Injectable } from '@angular/core';
import type { CompileDiagnostic } from './compile.models';
import type { SyntaxLanguage, SyntaxRequest, SyntaxResponse } from './workers/syntax.models';

/**
 * Served from public/grammars (MIT-licensed Tree-sitter grammars; see docs/third-party-assets.md).
 * The grammars are stored gzip-compressed (`.gz`) and unpacked here: CloudFront does not
 * compress WebAssembly, and the C# grammar is 7 MB raw, about 400 KB compressed.
 */
const FILES = {
  runtime: '/grammars/web-tree-sitter.wasm',
  csharp: '/grammars/tree-sitter-c_sharp.wasm.gz',
  java: '/grammars/tree-sitter-java.wasm.gz',
} as const;

export const hasSyntaxCheck = (language: string): language is SyntaxLanguage =>
  language === 'csharp' || language === 'java';

/**
 * Checks C# and Java syntax in the browser as you type: free, nothing is
 * sent anywhere. Files load the first time a language is checked (the C#
 * grammar is about 400 KB compressed) and are cached by the browser.
 */
@Injectable({ providedIn: 'root' })
export class SyntaxChecker {
  private worker: Worker | undefined;
  private nextId = 1;
  private readonly pending = new Map<number, (response: SyntaxResponse) => void>();
  private runtimeSent = false;
  private readonly grammarsSent = new Set<SyntaxLanguage>();
  private readonly downloads = new Map<string, Promise<ArrayBuffer>>();

  /** Syntax errors in `code`; empty when it parses (or when checking is unavailable). */
  async check(
    language: SyntaxLanguage,
    code: string,
    options: { readonly names?: boolean } = {},
  ): Promise<readonly CompileDiagnostic[]> {
    try {
      const runtime = this.runtimeSent ? undefined : await this.download(FILES.runtime);
      const grammar = this.grammarsSent.has(language)
        ? undefined
        : await this.download(FILES[language]);
      const response = await this.send({
        id: this.nextId++,
        language,
        code,
        ...(options.names === false ? { names: false } : {}),
        ...(runtime ? { runtime } : {}),
        ...(grammar ? { grammar } : {}),
      });
      if (!response.ok) {
        console.warn(`Live syntax check unavailable: ${response.error}`);
        return [];
      }
      this.runtimeSent = true;
      this.grammarsSent.add(language);
      // The worker has them now; a new worker would fetch them again (from the browser cache).
      this.downloads.delete(FILES.runtime);
      this.downloads.delete(FILES[language]);
      return response.diagnostics;
    } catch {
      // A missing file or a failed worker only turns the live check off; running still works.
      return [];
    }
  }

  private send(request: SyntaxRequest): Promise<SyntaxResponse> {
    this.worker ??= this.createWorker();
    return new Promise((resolve) => {
      this.pending.set(request.id, resolve);
      // Copies, not transfers: the downloads are reused if a later check needs them again.
      this.worker!.postMessage(request);
    });
  }

  private createWorker(): Worker {
    const worker = new Worker(new URL('./workers/syntax.worker', import.meta.url), {
      type: 'module',
    });
    worker.addEventListener('message', ({ data }: MessageEvent<SyntaxResponse>) => {
      this.pending.get(data.id)?.(data);
      this.pending.delete(data.id);
    });
    worker.addEventListener('error', () => {
      // Answer everything waiting and start over with a fresh worker next time.
      for (const [id, resolve] of this.pending) resolve({ id, ok: false, error: 'worker failed' });
      this.pending.clear();
      this.worker?.terminate();
      this.worker = undefined;
      this.runtimeSent = false;
      this.grammarsSent.clear();
    });
    return worker;
  }

  private download(path: string): Promise<ArrayBuffer> {
    let file = this.downloads.get(path);
    if (!file) {
      file = fetch(path).then((res) => {
        if (!res.ok || !res.body) throw new Error(`${path}: ${res.status}`);
        if (!path.endsWith('.gz')) return res.arrayBuffer();
        return new Response(res.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
      });
      file.catch(() => this.downloads.delete(path));
      this.downloads.set(path, file);
    }
    return file;
  }
}
