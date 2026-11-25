import type { ValidationIssue } from './validate';
import { validateInstructionBlocks } from './validate';
import type { WebChallengeSource, WebTest } from './web-challenge';
import { WEB_CATEGORY_LABELS, WEB_FRAMEWORKS } from './web-challenge';

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SAFE_PATH = /^(?!\/)(?!.*\/\/)(?!.*(?:^|\/)\.\.?(?:\/|$))[A-Za-z0-9_\-./]{1,200}$/;
const CAPTURE = /^[a-zA-Z][a-zA-Z0-9_]{0,31}$/;
const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
/** Frameworks that have an application runner (Angular does not yet). */
const RUNNABLE = new Set(['aspnetcore', 'spring-boot', 'django']);
const MAX_PROJECT_BYTES = 400_000;

/**
 * Structural checks for Web Development Challenges. Behavior (starter fails,
 * reference passes every test, mutants fail) is checked against the real
 * runners in content/src/checks/web-references.spec.ts.
 */
export function validateWebChallenges(sources: readonly WebChallengeSource[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const error = (path: string, message: string) =>
    issues.push({ severity: 'error', path, message });
  const ids = new Set<string>();

  for (const source of sources) {
    const c = source.challenge;
    const path = `web-challenge:${c.id}`;
    if (!ID.test(c.id)) error(path, 'id must be kebab-case');
    if (ids.has(c.id)) error(path, 'duplicate web challenge id');
    ids.add(c.id);
    if (!Number.isInteger(c.version) || c.version < 1)
      error(path, 'version must be a positive integer');
    if (!c.title.trim()) error(path, 'title is required');
    if (!c.summary.trim()) error(path, 'summary is required');
    if (!(c.category in WEB_CATEGORY_LABELS)) error(path, `unknown category "${c.category}"`);
    if (
      !Number.isInteger(c.estimatedMinutes) ||
      c.estimatedMinutes < 5 ||
      c.estimatedMinutes > 240
    ) {
      error(path, 'estimatedMinutes must be 5–240');
    }
    if (c.objectives.length < 2) error(path, 'at least two learning objectives are required');
    if (c.hints.length < 1) error(path, 'at least one hint is required');
    for (const t of c.competencies)
      if (!ID.test(t)) error(path, `competency "${t}" must be a kebab-case term id`);
    for (const s of c.prerequisiteSkills) {
      if (!/^[a-z0-9-]+\/[a-z0-9-]+$/.test(s))
        error(path, `prerequisite skill "${s}" must be technology/skill`);
    }
    issues.push(
      ...validateInstructionBlocks(`${path}/instructions`, c.instructions, 'instructions'),
    );
    for (const e of c.endpoints) {
      if (!METHODS.has(e.method) || !e.path.startsWith('/'))
        error(path, `invalid endpoint ${e.method} ${e.path}`);
      if (e.exampleBody !== undefined) {
        try {
          JSON.parse(e.exampleBody);
        } catch {
          error(path, `endpoint ${e.method} ${e.path}: exampleBody is not JSON`);
        }
      }
    }

    const tests = [...c.visibleTests, ...source.hiddenTests];
    if (c.visibleTests.length < 1) error(path, 'at least one visible test is required');
    if (source.hiddenTests.length < 2) error(path, 'at least two hidden tests are required');
    const testIds = new Set<string>();
    for (const test of tests) {
      if (testIds.has(test.id)) error(path, `duplicate test id "${test.id}"`);
      testIds.add(test.id);
      validateTest(`${path}/test:${test.id}`, test, error);
    }

    const frameworks = new Set<string>();
    let available = 0;
    for (const impl of source.implementations) {
      const ipath = `${path}/${impl.framework}`;
      if (!WEB_FRAMEWORKS.includes(impl.framework)) error(ipath, 'unknown framework');
      if (frameworks.has(impl.framework)) error(ipath, 'duplicate framework');
      frameworks.add(impl.framework);
      if (impl.status === 'available') {
        available++;
        if (!RUNNABLE.has(impl.framework))
          error(ipath, 'this framework has no runner: it can only be coming-soon');
      }
      const starter = Object.keys(impl.starter);
      let bytes = 0;
      for (const file of starter) {
        if (!SAFE_PATH.test(file)) error(ipath, `unsafe file path "${file}"`);
        bytes += (impl.starter[file] ?? '').length;
      }
      if (bytes > MAX_PROJECT_BYTES) error(ipath, 'the starter project is too large');
      if (impl.status === 'available') {
        if (impl.editable.length === 0) error(ipath, 'at least one file must be editable');
        if (!impl.starter[impl.entryFile])
          error(ipath, `entryFile "${impl.entryFile}" is not a starter file`);
        if (Object.keys(impl.reference).length === 0)
          error(ipath, 'a reference solution is required');
      }
      for (const file of impl.editable) {
        if (!(file in impl.starter))
          error(ipath, `editable file "${file}" is not in the starter project`);
      }
      for (const file of Object.keys(impl.reference)) {
        if (!impl.editable.includes(file)) error(ipath, `reference file "${file}" is not editable`);
      }
      if (impl.framework === 'spring-boot' && impl.status === 'available' && !impl.spring) {
        error(ipath, 'Spring Boot implementations need spring.mainClass and spring.librarySet');
      }
    }
    if (available === 0) error(path, 'at least one framework implementation must be available');
  }
  return issues;
}

function validateTest(
  path: string,
  test: WebTest,
  error: (path: string, message: string) => void,
): void {
  if (!ID.test(test.id)) error(path, 'test id must be kebab-case');
  if (!test.description.trim()) error(path, 'description is required');
  if (!ID.test(test.category)) error(path, 'category must be kebab-case');
  if (test.steps.length === 0) error(path, 'at least one step is required');
  const captured = new Set<string>();
  for (const [i, step] of test.steps.entries()) {
    const spath = `${path}/step ${i + 1}`;
    if (!METHODS.has(step.request.method)) error(spath, 'invalid method');
    if (!step.request.path.startsWith('/') || step.request.path.startsWith('//')) {
      error(spath, 'path must be relative to the application, starting with one "/"');
    }
    for (const m of step.request.path.matchAll(/\{\{(\w+)\}\}/g)) {
      if (!captured.has(m[1] ?? '')) error(spath, `{{${m[1]}}} is used before it is captured`);
    }
    const statuses = Array.isArray(step.expect.status) ? step.expect.status : [step.expect.status];
    for (const s of statuses)
      if (!Number.isInteger(s) || s < 100 || s > 599) error(spath, `invalid status ${s}`);
    for (const h of step.expect.headers ?? []) {
      if (h.matches !== undefined) {
        try {
          new RegExp(h.matches);
        } catch {
          error(spath, `header ${h.name}: invalid regular expression`);
        }
      }
    }
    for (const name of Object.keys(step.capture ?? {})) {
      if (!CAPTURE.test(name)) error(spath, `invalid capture name "${name}"`);
      captured.add(name);
    }
  }
}
