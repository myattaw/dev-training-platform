import { BROWSER_LANGUAGES, type ChallengeSource, type ChallengeTest } from './challenge';
import type { InstructionBlock } from './instruction';
import { blankIds, QUESTION_DIFFICULTIES, type QuestionSource, type TrackSource } from './skill';
import { SQL_IDENTIFIER, type SqlDatabase, type SqlTable } from './sql';

/**
 * Semantic validation that TypeScript cannot express: unique ids, cross
 * references, answer keys that match their options, and so on.
 *
 * Errors fail the content build. Warnings are reported but allowed.
 * Checks that need to *run* code (reference solutions, predict-output
 * answers) live in the content build, which has Node available.
 */
export interface ValidationIssue {
  readonly severity: 'error' | 'warning';
  /** Where the problem is, e.g. `challenge:pangram/hiddenTests[2]`. */
  readonly path: string;
  readonly message: string;
}

export const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Each skill needs enough questions for adaptive practice to vary them. */
export const MIN_QUESTIONS_PER_SKILL = 3;

class Issues {
  readonly list: ValidationIssue[] = [];
  error(path: string, message: string): void {
    this.list.push({ severity: 'error', path, message });
  }
  warning(path: string, message: string): void {
    this.list.push({ severity: 'warning', path, message });
  }
}

function checkId(issues: Issues, path: string, id: string): void {
  if (!ID_PATTERN.test(id)) issues.error(path, `id "${id}" must be lowercase kebab-case`);
}

function checkVersion(issues: Issues, path: string, version: number): void {
  if (!Number.isInteger(version) || version < 1) {
    issues.error(path, `version must be a positive integer (got ${version})`);
  }
}

/** Inline text supports `code` spans only: no Markdown emphasis or links. */
function checkInlineText(issues: Issues, path: string, text: string): void {
  if ((text.split('`').length - 1) % 2 !== 0) issues.error(path, 'unbalanced backticks');
  const outsideCode = text
    .split('`')
    .filter((_, i) => i % 2 === 0)
    .join('');
  if (/\*\*|__|\[[^\]]+\]\(/.test(outsideCode)) {
    issues.error(path, 'Markdown formatting is not supported; use plain text and `code`');
  }
}

function checkBlocks(
  issues: Issues,
  path: string,
  blocks: readonly InstructionBlock[],
  what: string,
): void {
  if (blocks.length === 0) issues.error(path, `${what} must not be empty`);
  blocks.forEach((b, i) => {
    const text = b.kind === 'list' ? b.items.join('') : b.kind === 'code' ? b.code : b.text;
    if (text.trim() === '') issues.error(`${path}[${i}]`, `${what} block is empty`);
    if (b.kind === 'list')
      b.items.forEach((item) => checkInlineText(issues, `${path}[${i}]`, item));
    else if (b.kind !== 'code') checkInlineText(issues, `${path}[${i}]`, b.text);
  });
}

function findDuplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const v of values) (seen.has(v) ? dupes : seen).add(v);
  return [...dupes];
}

/* ---------------- Challenges ---------------- */

export function validateChallenges(sources: readonly ChallengeSource[]): ValidationIssue[] {
  const issues = new Issues();
  for (const dupe of findDuplicates(sources.map((s) => s.challenge.id))) {
    issues.error(`challenge:${dupe}`, 'duplicate challenge id');
  }
  for (const source of sources) validateChallenge(issues, source);
  return issues.list;
}

function validateChallenge(issues: Issues, source: ChallengeSource): void {
  const c = source.challenge;
  const path = `challenge:${c.id}`;
  checkId(issues, path, c.id);
  checkVersion(issues, path, c.version);
  if (c.title.trim() === '') issues.error(path, 'title is required');
  if (c.summary.trim() === '') issues.error(path, 'summary is required');
  checkBlocks(issues, `${path}/instructions`, c.instructions, 'instructions');
  c.tags.forEach((t) => checkId(issues, `${path}/tags`, t));

  const languages = Object.entries(c.languages);
  if (languages.length === 0) issues.error(path, 'at least one language is required');
  for (const [lang, setup] of languages) {
    if (!setup) continue;
    const e = setup.entryPoint;
    const pattern =
      lang === 'java'
        ? new RegExp(`\\bclass\\s+${e}\\b|\\bstatic\\s+[\\w<>\\[\\],\\s]+\\s${e}\\s*\\(`)
        : lang === 'csharp'
          ? // A class (or record), or a static method; C# methods are PascalCase.
            new RegExp(
              `\\b(?:class|record)\\s+${e}\\b|\\bstatic\\s+[\\w<>\\[\\],?()\\s]+\\s${csharpName(e)}\\s*\\(`,
            )
          : lang === 'python'
            ? new RegExp(`^(?:def|class)\\s+(?:${e}|${snakeCase(e)})\\b`, 'm')
            : lang === 'swift'
              ? // Swift is called through its adapter (support code), which declares PracStackEntry.
                /\benum\s+PracStackEntry\b/
              : new RegExp(`export\\s+(?:abstract\\s+)?(?:function|class|const)\\s+${e}\\b`);
    if (setup.supportCode !== undefined) {
      if ((BROWSER_LANGUAGES as readonly string[]).includes(lang)) {
        issues.error(
          `${path}/languages/${lang}`,
          'support code is only for languages that run on the server',
        );
      } else if (setup.supportCode.trim() === '') {
        issues.error(`${path}/languages/${lang}`, 'support code must not be empty');
      }
    }
    // The entry point may be declared by the support code (e.g. a test driver class).
    if (!pattern.test(`${setup.starterCode}\n${setup.supportCode ?? ''}`)) {
      issues.error(
        `${path}/languages/${lang}`,
        lang === 'java' || lang === 'csharp'
          ? `starter code must declare a class or static method "${lang === 'csharp' ? csharpName(e) : e}"`
          : lang === 'python'
            ? `starter code must define a function or class "${snakeCase(e)}"`
            : lang === 'swift'
              ? 'Swift needs an adapter in support code that declares enum PracStackEntry'
              : `starter code must export "${e}"`,
      );
    }
  }

  if (c.visibleTests.length === 0) issues.error(path, 'at least one visible test is required');
  if (source.hiddenTests.length === 0) {
    issues.error(path, 'at least one hidden test is required for server-side grading');
  }

  const all: readonly ChallengeTest[] = [...c.visibleTests, ...source.hiddenTests];
  const kinds = new Set(all.map((t) => t.kind));
  if (kinds.size > 1) {
    issues.error(path, 'all tests must be the same kind (either "call" or "operations")');
  }
  for (const dupe of findDuplicates(all.map((t) => t.description))) {
    issues.error(path, `duplicate test description "${dupe}"`);
  }
  for (const test of all) {
    if (test.kind === 'operations' && test.steps.length === 0) {
      issues.error(path, `operations test "${test.description}" has no steps`);
    }
  }

  const visibleKeys = new Set(c.visibleTests.map(testKey));
  source.hiddenTests.forEach((t, i) => {
    if (visibleKeys.has(testKey(t))) {
      issues.warning(`${path}/hiddenTests[${i}]`, 'duplicates a visible test, so it hides nothing');
    }
  });

  for (const [key, value] of Object.entries(source.limits ?? {})) {
    if (typeof value !== 'number' || value <= 0) {
      issues.error(`${path}/limits`, `${key} must be a positive number`);
    }
  }
}

function testKey(test: ChallengeTest): string {
  return test.kind === 'call'
    ? JSON.stringify(test.input)
    : JSON.stringify([test.constructorArgs, test.steps]);
}

/* ---------------- Skill Mastery tracks ---------------- */

export function validateTracks(tracks: readonly TrackSource[]): ValidationIssue[] {
  const issues = new Issues();
  const ids = (pick: (t: TrackSource) => string[]): string[] => tracks.flatMap(pick);

  for (const dupe of findDuplicates(tracks.map((t) => t.id))) {
    issues.error(`track:${dupe}`, 'duplicate technology id');
  }
  for (const dupe of findDuplicates(ids((t) => t.topics.map((x) => x.id)))) {
    issues.error(`topic:${dupe}`, 'duplicate topic id');
  }
  for (const dupe of findDuplicates(
    ids((t) => t.topics.flatMap((x) => x.skills.map((s) => s.id))),
  )) {
    issues.error(`skill:${dupe}`, 'duplicate skill id');
  }
  const questionIds = ids((t) =>
    t.topics.flatMap((x) => x.skills.flatMap((s) => s.questions.map((q) => q.id))),
  );
  for (const dupe of findDuplicates(questionIds)) {
    issues.error(`question:${dupe}`, 'duplicate question id');
  }

  for (const track of tracks) {
    const trackPath = `track:${track.id}`;
    checkId(issues, trackPath, track.id);
    if (track.topics.length === 0) issues.error(trackPath, 'a track needs at least one topic');
    // Prerequisites must come earlier in the same track, which also rules out cycles.
    const earlierSkills = new Set<string>();
    for (const topic of track.topics) {
      const topicPath = `${trackPath}/${topic.id}`;
      checkId(issues, topicPath, topic.id);
      if (topic.skills.length === 0) issues.error(topicPath, 'a topic needs at least one skill');
      for (const skill of topic.skills) {
        const skillPath = `${topicPath}/${skill.id}`;
        checkId(issues, skillPath, skill.id);
        if (skill.questions.length < MIN_QUESTIONS_PER_SKILL) {
          issues.error(skillPath, `needs at least ${MIN_QUESTIONS_PER_SKILL} questions`);
        }
        const covered = new Set(skill.questions.map((q) => q.difficulty));
        const missing = QUESTION_DIFFICULTIES.filter((d) => !covered.has(d));
        if (missing.length > 0) {
          issues.warning(
            skillPath,
            `no questions at difficulty ${missing.join(', ')}; practice will use the nearest level`,
          );
        }
        for (const q of skill.questions) validateQuestion(issues, `${skillPath}/${q.id}`, q);
        validateFamilies(issues, skillPath, skill.questions);
        for (const prerequisite of skill.prerequisites ?? []) {
          if (!earlierSkills.has(prerequisite))
            issues.error(
              skillPath,
              `prerequisite "${prerequisite}" must be a skill earlier in the same track`,
            );
        }
        earlierSkills.add(skill.id);
      }
    }
  }
  return issues.list;
}

function validateQuestion(issues: Issues, path: string, q: QuestionSource): void {
  checkId(issues, path, q.id);
  checkVersion(issues, path, q.version);
  checkBlocks(issues, `${path}/prompt`, q.prompt, 'prompt');
  checkBlocks(issues, `${path}/explanation`, q.explanation, 'explanation');
  q.hints.forEach((h, i) => {
    if (h.trim() === '') issues.error(`${path}/hints[${i}]`, 'hint is empty');
  });

  switch (q.format) {
    case 'multiple-choice': {
      const optionIds = q.options.map((o) => o.id);
      if (q.options.length < 2) issues.error(path, 'needs at least two options');
      for (const dupe of findDuplicates(optionIds)) {
        issues.error(path, `duplicate option id "${dupe}"`);
      }
      for (const dupe of findDuplicates(q.options.map((o) => o.text.trim()))) {
        issues.error(path, `duplicate option text "${dupe}"`);
      }
      q.options.forEach((o) => checkInlineText(issues, `${path}/options/${o.id}`, o.text));
      for (const id of q.answer.correct) {
        if (!optionIds.includes(id)) issues.error(path, `correct answer "${id}" is not an option`);
      }
      if (q.selection === 'single' && q.answer.correct.length !== 1) {
        issues.error(path, 'single-selection questions need exactly one correct option');
      }
      if (q.selection === 'multiple' && q.answer.correct.length === 0) {
        issues.error(path, 'multiple-selection questions need at least one correct option');
      }
      break;
    }
    case 'predict-output':
      if (q.code.source.trim() === '') issues.error(path, 'code is required');
      if (q.answer.output === '') issues.error(path, 'expected output must not be empty');
      break;
    case 'sql-query':
      if (q.answer.referenceQuery.trim() === '') issues.error(path, 'referenceQuery is required');
      validateDatabase(issues, `${path}/database:${q.database.id}`, q.database);
      break;
    case 'fill-in-blank': {
      const inTemplate = blankIds(q.template.source);
      const answered = Object.keys(q.answer.blanks);
      if (inTemplate.length === 0) issues.error(path, 'template has no {{blank:id}} markers');
      for (const dupe of findDuplicates(inTemplate)) {
        issues.error(path, `blank "${dupe}" appears more than once`);
      }
      for (const id of inTemplate) {
        if (!answered.includes(id)) issues.error(path, `blank "${id}" has no accepted answers`);
      }
      for (const id of answered) {
        if (!inTemplate.includes(id)) issues.error(path, `answer for unknown blank "${id}"`);
        const accepted = q.answer.blanks[id]?.accepted ?? [];
        if (accepted.length === 0 || accepted.some((a) => a.trim() === '')) {
          issues.error(path, `blank "${id}" needs non-empty accepted answers`);
        }
      }
      break;
    }
  }
}

function validateDatabase(issues: Issues, path: string, db: SqlDatabase): void {
  if (db.schema.trim() === '') issues.error(path, 'schema is required');
  if (db.sample.length === 0) issues.error(path, 'sample data is required');
  if (db.hidden.length === 0) {
    issues.error(path, 'at least one hidden dataset is required, so hard-coded answers fail');
  }
  const shape = (tables: readonly SqlTable[]) =>
    tables
      .map((t) => `${t.table}(${t.columns.join(',')})`)
      .sort()
      .join(' ');
  const sampleShape = shape(db.sample);
  [db.sample, ...db.hidden].forEach((tables, i) => {
    const where = i === 0 ? `${path}/sample` : `${path}/hidden[${i - 1}]`;
    if (i > 0 && shape(tables) !== sampleShape) {
      issues.error(where, 'must have the same tables and columns as the sample data');
    }
    for (const t of tables) {
      for (const name of [t.table, ...t.columns]) {
        if (!SQL_IDENTIFIER.test(name)) issues.error(where, `invalid SQL identifier "${name}"`);
      }
      t.rows.forEach((row, r) => {
        if (row.length !== t.columns.length) {
          issues.error(
            where,
            `${t.table} row ${r + 1} has ${row.length} values for ${t.columns.length} columns`,
          );
        }
      });
    }
  });
}

/**
 * Families group variants of one concept. Their variants must share a format,
 * and no two questions in a skill may be the same exercise: a "variant" that
 * only renames things without changing the prompt, code, data or answer is
 * a duplicate, not new practice.
 */
function validateFamilies(
  issues: Issues,
  skillPath: string,
  questions: readonly QuestionSource[],
): void {
  const formats = new Map<string, string>();
  const seen = new Map<string, string>();
  for (const q of questions) {
    const family = q.family ?? q.id;
    if (q.family !== undefined) checkId(issues, `${skillPath}/${q.id}`, q.family);
    const format = formats.get(family);
    if (format && format !== q.format) {
      issues.error(
        `${skillPath}/${q.id}`,
        `family "${family}" mixes ${format} and ${q.format} questions`,
      );
    }
    formats.set(family, q.format);

    const fingerprint = contentFingerprint(q);
    const twin = seen.get(fingerprint);
    if (twin)
      issues.error(
        `${skillPath}/${q.id}`,
        `same exercise as ${twin} (prompt, code, data and answer are identical)`,
      );
    seen.set(fingerprint, q.id);
  }
}

/** Everything a learner sees or is graded on, without ids, versions, hints or explanations. */
function contentFingerprint(q: QuestionSource): string {
  const { id, version, family, hints, explanation, difficulty, ...rest } = q as QuestionSource & {
    family?: string;
  };
  void id;
  void version;
  void family;
  void hints;
  void explanation;
  void difficulty;
  return JSON.stringify(rest).replace(/\s+/g, ' ');
}

/** The C# name the runner also accepts for an entry point: `isPangram` → `IsPangram`. */
export function csharpName(entryPoint: string): string {
  return entryPoint.charAt(0).toUpperCase() + entryPoint.slice(1);
}

/** Validates questions used outside a skill (e.g. in Enterprise Scenarios). */
export function validateQuestionSources(
  path: string,
  questions: readonly QuestionSource[],
): ValidationIssue[] {
  const issues = new Issues();
  for (const dupe of findDuplicates(questions.map((q) => q.id))) {
    issues.error(path, `duplicate question id "${dupe}"`);
  }
  for (const q of questions) validateQuestion(issues, `${path}/${q.id}`, q);
  return issues.list;
}

/** Validates instruction blocks used outside challenges and skills. */
export function validateInstructionBlocks(
  path: string,
  blocks: readonly InstructionBlock[],
  what: string,
): ValidationIssue[] {
  const issues = new Issues();
  checkBlocks(issues, path, blocks, what);
  return issues.list;
}

/** Python's name for an entry point: `isPangram` → `is_pangram` (classes keep their name). */
function snakeCase(name: string): string {
  return /^[A-Z]/.test(name) ? name : name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}
