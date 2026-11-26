import { WEB_VERDICT_LABELS, type WebVerdict } from '@pracstack/api-contracts';
import type { EditorLanguage } from '../../../shared/editor/code-editor';
import type { StatusType } from '../../../shared/ui/status-indicator/status-indicator';

export const VERDICT_LABELS = WEB_VERDICT_LABELS;

export const VERDICT_STATUS: Readonly<Record<WebVerdict, StatusType>> = {
  accepted: 'success',
  'tests-failed': 'error',
  'compilation-error': 'error',
  'startup-error': 'error',
  'time-limit-exceeded': 'warning',
  'resource-limit-exceeded': 'warning',
  'infrastructure-error': 'neutral',
  responded: 'success',
};

/** Monaco language for a project file (syntax highlighting only; no language server). */
export function monacoLanguage(path: string): string {
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  const map: Readonly<Record<string, string>> = {
    cs: 'csharp',
    csproj: 'xml',
    xml: 'xml',
    java: 'java',
    py: 'python',
    ts: 'typescript',
    js: 'javascript',
    json: 'json',
    html: 'html',
    css: 'css',
    yml: 'yaml',
    yaml: 'yaml',
    properties: 'ini',
    md: 'markdown',
    sql: 'sql',
  };
  return map[ext] ?? 'plaintext';
}

/** The editor language whose live syntax check applies (C# and Java only). */
export function syntaxLanguage(path: string): EditorLanguage | undefined {
  if (path.endsWith('.cs')) return 'csharp';
  if (path.endsWith('.java')) return 'java';
  return undefined;
}
