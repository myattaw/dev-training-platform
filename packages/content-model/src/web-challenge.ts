import type { Difficulty } from './challenge';
import type { InstructionBlock } from './instruction';

/**
 * Web Development Challenges: real application projects (several files, a
 * framework, HTTP endpoints) built and run in isolated containers and graded
 * by sending real HTTP requests. Distinct from algorithm Coding Challenges.
 *
 * One canonical challenge (a business problem and its HTTP contract) can have
 * several framework implementations, each with its own starter project and
 * reference solution. A challenge supported by three frameworks is still one
 * challenge.
 *
 * Public: catalog metadata, instructions, the HTTP contract, visible tests,
 * and the starter project (served by the API, never bundled in the web app).
 * Private: hidden tests and reference solutions.
 */

export type WebFramework = 'aspnetcore' | 'spring-boot' | 'django' | 'angular';

export const WEB_FRAMEWORKS: readonly WebFramework[] = [
  'aspnetcore',
  'spring-boot',
  'django',
  'angular',
];

export const WEB_FRAMEWORK_LABELS: Readonly<Record<WebFramework, string>> = {
  aspnetcore: 'ASP.NET Core',
  'spring-boot': 'Spring Boot',
  django: 'Django REST Framework',
  angular: 'Angular',
};

export type WebChallengeCategory =
  | 'rest-apis'
  | 'backend'
  | 'frontend'
  | 'full-stack'
  | 'database'
  | 'debugging'
  | 'testing'
  | 'security'
  | 'refactoring'
  | 'business-logic'
  | 'auth'
  | 'performance'
  | 'architecture';

export const WEB_CATEGORY_LABELS: Readonly<Record<WebChallengeCategory, string>> = {
  'rest-apis': 'REST APIs',
  backend: 'Backend development',
  frontend: 'Frontend development',
  'full-stack': 'Full-stack development',
  database: 'Database integration',
  debugging: 'Debugging',
  testing: 'Testing',
  security: 'Security',
  refactoring: 'Refactoring',
  'business-logic': 'Business logic',
  auth: 'Authentication and authorization',
  performance: 'Performance',
  architecture: 'Application architecture',
};

/** Who may open a challenge. Enforced by the API (never by the browser). */
export type WebChallengeAccess = 'free' | 'pro';

/** Where a framework implementation stands. Only `available` ones can be run. */
export type WebImplementationStatus = 'available' | 'coming-soon';

/** The database an implementation uses, stated plainly to learners. */
export type WebDatabase = 'in-memory' | 'sqlite' | 'h2';

export const WEB_DATABASE_LABELS: Readonly<Record<WebDatabase, string>> = {
  'in-memory': 'In-memory store (no database)',
  sqlite: 'SQLite (fresh file per run)',
  h2: 'H2 in-memory database',
};

/** One file of a project. */
export interface WebProjectFile {
  /** Project-relative path with forward slashes, e.g. `Controllers/EmployeesController.cs`. */
  readonly path: string;
  readonly content: string;
  /** Learners may change only editable files; the rest is the trusted template. */
  readonly editable: boolean;
}

/** An HTTP endpoint of the challenge's contract (documentation and the HTTP client's examples). */
export interface HttpEndpoint {
  readonly method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  readonly path: string;
  readonly summary: string;
  /** Example request body (JSON text). */
  readonly exampleBody?: string;
  /** Status codes and what they mean, e.g. `201 Created with the employee`. */
  readonly responses: readonly string[];
}

/* ---------- HTTP tests ---------- */

/** One assertion on a JSON response; `path` is a dot path (`items.0.name`, `length`). */
export type JsonAssertion =
  | { readonly path: string; readonly equals: unknown }
  | { readonly path: string; readonly exists: boolean }
  | {
      readonly path: string;
      readonly type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'null';
    }
  /** An array (at `path`) has an element whose fields include these values. */
  | { readonly path: string; readonly contains: Readonly<Record<string, unknown>> }
  /** An array (at `path`) has no element whose fields include these values. */
  | { readonly path: string; readonly notContains: Readonly<Record<string, unknown>> };

export interface HeaderAssertion {
  readonly name: string;
  /** A regular expression the header must match; omit to require only presence. */
  readonly matches?: string;
}

/** A request and what must come back. */
export interface HttpTestStep {
  readonly request: {
    readonly method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    readonly path: string;
    readonly headers?: Readonly<Record<string, string>>;
    /** Raw body text (JSON for most steps). */
    readonly body?: string;
  };
  readonly expect: {
    /** One status, or any of several equally correct ones. */
    readonly status: number | readonly number[];
    readonly json?: readonly JsonAssertion[];
    readonly headers?: readonly HeaderAssertion[];
  };
  /** Values from this response's JSON (dot paths) usable as `{{name}}` in later steps. */
  readonly capture?: Readonly<Record<string, string>>;
}

/**
 * A test: a sequence of requests against the running application. Tests run
 * in order against ONE application instance per run, like an API contract
 * suite, so they must not depend on absolute counts that earlier tests change.
 */
export interface WebTest {
  readonly id: string;
  readonly description: string;
  /** Hidden tests report only their category (e.g. `validation`) to learners. */
  readonly category: string;
  readonly steps: readonly HttpTestStep[];
}

/* ---------- Public shapes ---------- */

/** Public part of one framework implementation. */
export interface WebImplementation {
  readonly framework: WebFramework;
  readonly status: WebImplementationStatus;
  /** Human-readable runtime, e.g. `.NET 10 · ASP.NET Core 10`. */
  readonly runtime: string;
  readonly database: WebDatabase;
  /** The starter project (editable and read-only files). Served by the API only. */
  readonly files: readonly WebProjectFile[];
  /** The file opened first in the workspace. */
  readonly entryFile: string;
}

/** Catalog row (in the public manifest). */
export interface WebChallengeSummary {
  readonly id: string;
  readonly version: number;
  readonly title: string;
  readonly summary: string;
  readonly difficulty: Difficulty;
  readonly category: WebChallengeCategory;
  readonly estimatedMinutes: number;
  readonly access: WebChallengeAccess;
  readonly competencies: readonly string[];
  /** Frameworks with a verified, runnable implementation. */
  readonly frameworks: readonly WebFramework[];
  /** Frameworks announced but not runnable yet (never counted as available). */
  readonly comingSoon: readonly WebFramework[];
}

/** Everything a learner sees for a challenge (without the project files). */
export interface WebChallenge {
  readonly id: string;
  readonly version: number;
  readonly title: string;
  readonly summary: string;
  readonly difficulty: Difficulty;
  readonly category: WebChallengeCategory;
  readonly estimatedMinutes: number;
  readonly access: WebChallengeAccess;
  /** Taxonomy term ids (job analyzer, roles), e.g. `rest-apis`, `input-validation`. */
  readonly competencies: readonly string[];
  /** Skill Mastery skill ids worth practicing first (`technology/skill`). */
  readonly prerequisiteSkills: readonly string[];
  readonly objectives: readonly string[];
  /** Business scenario and requirements. */
  readonly instructions: readonly InstructionBlock[];
  readonly endpoints: readonly HttpEndpoint[];
  readonly hints: readonly string[];
  readonly visibleTests: readonly WebTest[];
  /** Hidden tests: categories and counts only. */
  readonly hiddenTestCategories: readonly { readonly category: string; readonly count: number }[];
  readonly implementations: readonly Omit<WebImplementation, 'files'>[];
}

/* ---------- Private grading data ---------- */

export interface WebImplementationGrading {
  readonly framework: WebFramework;
  /** Reference versions of the editable files (proven to pass every test by the build checks). */
  readonly referenceFiles: Readonly<Record<string, string>>;
  /** Spring Boot: the main class and the runner library set. */
  readonly spring?: { readonly mainClass: string; readonly librarySet: 'core' | 'jpa' | 'security' };
}

export interface WebChallengeGrading {
  readonly challengeId: string;
  readonly version: number;
  readonly hiddenTests: readonly WebTest[];
  readonly implementations: readonly WebImplementationGrading[];
}

/* ---------- Authoring shape ---------- */

export interface WebImplementationSource {
  readonly framework: WebFramework;
  readonly status: WebImplementationStatus;
  readonly runtime: string;
  readonly database: WebDatabase;
  /** Starter project files (all of them), path → content. */
  readonly starter: Readonly<Record<string, string>>;
  /** Paths of the starter files learners may edit. */
  readonly editable: readonly string[];
  /** Reference versions of editable files, path → content. */
  readonly reference: Readonly<Record<string, string>>;
  readonly entryFile: string;
  readonly spring?: WebImplementationGrading['spring'];
}

export interface WebChallengeSource {
  readonly challenge: Omit<WebChallenge, 'implementations' | 'hiddenTestCategories'>;
  readonly hiddenTests: readonly WebTest[];
  readonly implementations: readonly WebImplementationSource[];
}

/** The public challenge, the private grading data, and the starter projects. */
export function splitWebChallenge(source: WebChallengeSource): {
  readonly challenge: WebChallenge;
  readonly summary: WebChallengeSummary;
  readonly projects: readonly WebImplementation[];
  readonly grading: WebChallengeGrading;
} {
  const c = source.challenge;
  const categories = new Map<string, number>();
  for (const t of source.hiddenTests) categories.set(t.category, (categories.get(t.category) ?? 0) + 1);
  const projects: WebImplementation[] = source.implementations.map((impl) => ({
    framework: impl.framework,
    status: impl.status,
    runtime: impl.runtime,
    database: impl.database,
    entryFile: impl.entryFile,
    files: Object.keys(impl.starter)
      .sort()
      .map((path) => ({
        path,
        content: impl.starter[path] ?? '',
        editable: impl.editable.includes(path),
      })),
  }));
  const challenge: WebChallenge = {
    id: c.id,
    version: c.version,
    title: c.title,
    summary: c.summary,
    difficulty: c.difficulty,
    category: c.category,
    estimatedMinutes: c.estimatedMinutes,
    access: c.access,
    competencies: [...c.competencies],
    prerequisiteSkills: [...c.prerequisiteSkills],
    objectives: [...c.objectives],
    instructions: c.instructions,
    endpoints: c.endpoints,
    hints: [...c.hints],
    visibleTests: c.visibleTests,
    hiddenTestCategories: [...categories].map(([category, count]) => ({ category, count })),
    implementations: projects.map(({ files: _files, ...rest }) => rest),
  };
  const available = source.implementations.filter((i) => i.status === 'available');
  return {
    challenge,
    projects,
    summary: {
      id: c.id,
      version: c.version,
      title: c.title,
      summary: c.summary,
      difficulty: c.difficulty,
      category: c.category,
      estimatedMinutes: c.estimatedMinutes,
      access: c.access,
      competencies: [...c.competencies],
      frameworks: available.map((i) => i.framework),
      comingSoon: source.implementations
        .filter((i) => i.status === 'coming-soon')
        .map((i) => i.framework),
    },
    grading: {
      challengeId: c.id,
      version: c.version,
      hiddenTests: source.hiddenTests,
      implementations: source.implementations.map((i) => ({
        framework: i.framework,
        referenceFiles: i.reference,
        ...(i.spring ? { spring: i.spring } : {}),
      })),
    },
  };
}
