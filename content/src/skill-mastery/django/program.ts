import type { CodeSnippet } from '@pracstack/content-model';
import { programBuilders } from '../program-builders';

/** Python builders: every Django question runs in the real Python runner. */
export const b = programBuilders('python');

/** A displayed-only Django template (not run). */
export const html = (source: string): CodeSnippet => ({ language: 'html', source });

/**
 * Options for the short, consistent setup every runnable Django program starts with.
 * The learner sees the complete program: these lines are part of the shown code.
 */
export interface DjangoSetup {
  /** INSTALLED_APPS (default: none, plus the script's own app when it defines models). */
  readonly apps?: readonly string[];
  /** In-memory SQLite database. */
  readonly db?: boolean;
  /** ROOT_URLCONF = this script (define `urlpatterns`) and ALLOWED_HOSTS for the test client. */
  readonly urls?: boolean;
  /** Fast MD5 password hashing for auth examples (never in a real project). */
  readonly fastHasher?: boolean;
  /** Extra settings, one `NAME=value` per entry. */
  readonly settings?: readonly string[];
  /**
   * Installs the script itself as an application with this label (an `AppConfig`
   * with `name = "__main__"`), so its models need no `Meta.app_label` and get
   * reverse relations, cascades and management commands like a real app.
   * Detected automatically from `app_label = "..."` in the body.
   */
  readonly app?: string;
}

const AUTH = ['django.contrib.contenttypes', 'django.contrib.auth'];
/** contenttypes and auth, the apps most examples need. */
export const authApps = AUTH;
/** contenttypes, auth and Django REST Framework. */
export const drfApps = [...AUTH, 'rest_framework'];

const APP_LABEL = /^ {8}app_label = "([a-z_]+)"$/gm;

/** The single app label the body's models declare, if any. */
function detectLabel(body: string): string | undefined {
  const labels = new Set([...body.matchAll(APP_LABEL)].map((m) => m[1] ?? ''));
  if (labels.size > 1) throw new Error(`one app label per program, got ${[...labels].join(', ')}`);
  return [...labels][0];
}

/** Removes `app_label` lines (and `Meta` classes left empty): the app config provides it. */
function stripAppLabels(body: string): string {
  return body
    .replace(/\n\n {4}class Meta:\n {8}app_label = "[a-z_]+"(?=\n(?! {8})|$)/g, '')
    .replace(/\n {8}app_label = "[a-z_]+"/g, '');
}

const pascal = (label: string) =>
  label
    .split('_')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('');

/**
 * A complete Django script: `settings.configure(...)` and `django.setup()`,
 * then `body`. Models in the body may declare `class Meta: app_label = "..."`;
 * the label becomes an app config for the script and the `app_label` lines are dropped.
 */
export function djangoProgram(body: string, setup: DjangoSetup = {}): string {
  const label = setup.app ?? detectLabel(body);
  const source = label ? stripAppLabels(body) : body;
  const config = label ? `${pascal(label)}Config` : undefined;
  const apps = [...(setup.apps ?? []), ...(config ? [`__main__.${config}`] : [])];
  const lines: string[] = [];
  if (apps.length) {
    lines.push(`INSTALLED_APPS=[${apps.map((a) => JSON.stringify(a)).join(', ')}],`);
  }
  if (setup.db) {
    lines.push(
      'DATABASES={"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": ":memory:"}},',
    );
  }
  if (setup.urls) {
    lines.push('ROOT_URLCONF=__name__,', 'ALLOWED_HOSTS=["testserver"],');
  }
  if (setup.fastHasher) {
    lines.push('PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"],');
  }
  for (const s of setup.settings ?? []) lines.push(s.endsWith(',') ? s : `${s},`);
  const configure =
    lines.length === 0
      ? 'settings.configure()'
      : `settings.configure(\n${lines.map((l) => `    ${l}`).join('\n')}\n)`;
  const appConfig = config
    ? `from django.apps import AppConfig
from django.conf import settings

class ${config}(AppConfig):  # this script is the "${label}" app
    name = "__main__"
    label = "${label}"
`
    : 'from django.conf import settings\n';
  return `import django
${appConfig}
${configure}
django.setup()

${source.trim()}
`;
}

/** Shorthand for `djangoProgram` with an in-memory database. */
export const dbProgram = (body: string, setup: DjangoSetup = {}): string =>
  djangoProgram(body, { db: true, ...setup });
