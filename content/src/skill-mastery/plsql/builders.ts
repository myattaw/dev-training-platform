import type { QuestionDifficulty, QuestionSource } from '@pracstack/content-model';
import { choice, family, type FamilyQuestion } from '../family';
import { sql, text } from '../helpers';

/**
 * PL/SQL question builders. Every code sample runs on Oracle Database Free in a
 * fresh schema with the practice tables below (content/src/checks/plsql-snippets.ts):
 * - predict-output: DBMS_OUTPUT must print exactly the answer;
 * - fill-in-blank: every accepted answer must compile and run;
 * - code shown with a multiple-choice question must run, or fail with exactly
 *   the error its `fails` names ("what happens when…?").
 *
 * Scripts are written SQL*Plus style: a PL/SQL unit ends with a line holding
 * only `/`. Output is from DBMS_OUTPUT (SERVEROUTPUT on).
 */

/** The practice tables every code sample can use (also described to learners). */
export const PLSQL_SETUP = `
CREATE TABLE departments (id NUMBER PRIMARY KEY, name VARCHAR2(30) NOT NULL);
CREATE TABLE employees (
  id      NUMBER PRIMARY KEY,
  name    VARCHAR2(30) NOT NULL,
  dept_id NUMBER REFERENCES departments (id),
  salary  NUMBER(8, 2) NOT NULL
);
INSERT INTO departments VALUES (10, 'Engineering');
INSERT INTO departments VALUES (20, 'Sales');
INSERT INTO departments VALUES (30, 'Support');
INSERT INTO employees VALUES (1, 'Ada', 10, 5000);
INSERT INTO employees VALUES (2, 'Linus', 10, 4000);
INSERT INTO employees VALUES (3, 'Grace', 20, 4500);
INSERT INTO employees VALUES (4, 'Alan', 30, 3000);
COMMIT;
`;

/** Shown with questions whose code reads the tables. */
const TABLES =
  'The `employees` table (`id`, `name`, `dept_id`, `salary`) holds: 1 Ada (dept 10, 5000), ' +
  '2 Linus (dept 10, 4000), 3 Grace (dept 20, 4500) and 4 Alan (dept 30, 3000).';

const prompt = (question: string, tables: boolean | undefined) =>
  text(...[question, ...(tables ? [TABLES] : [])]);

export interface OutputVariant {
  readonly key: string;
  readonly code: string;
  readonly output: string;
  readonly why: string;
  /** The code reads the practice tables: describe them in the prompt. */
  readonly tables?: boolean;
}

/** "What does this print?" — run on Oracle; the output must match exactly. */
export const plsqlOutputFamily = (
  id: string,
  difficulty: QuestionDifficulty,
  hints: readonly string[],
  variants: readonly OutputVariant[],
): QuestionSource[] =>
  family(id, variants, (v): FamilyQuestion => ({
    difficulty,
    format: 'predict-output',
    prompt: prompt('What does this print? (Server output is on.)', v.tables),
    code: sql(v.code),
    answer: { output: v.output },
    hints: [...hints],
    explanation: text(v.why),
  }));

export interface BlankVariant {
  readonly key: string;
  readonly prompt: string;
  /** Code with `{{blank:id}}` placeholders. */
  readonly template: string;
  readonly blanks: Record<string, readonly string[]>;
  readonly why: string;
  readonly tables?: boolean;
}

/** Fill in the blanks (keywords: not case-sensitive). Every accepted answer is run. */
export const plsqlBlankFamily = (
  id: string,
  difficulty: QuestionDifficulty,
  hint: string,
  variants: readonly BlankVariant[],
): QuestionSource[] =>
  family(id, variants, (v): FamilyQuestion => ({
    difficulty,
    format: 'fill-in-blank',
    prompt: prompt(v.prompt, v.tables),
    template: sql(v.template),
    answer: {
      blanks: Object.fromEntries(
        Object.entries(v.blanks).map(([k, accepted]) => [
          k,
          { accepted: [...accepted], caseSensitive: false },
        ]),
      ),
    },
    hints: [hint],
    explanation: text(v.why),
  }));

export interface CodeChoiceVariant {
  readonly key: string;
  readonly question: string;
  readonly code: string;
  readonly correct: string;
  readonly wrong: readonly string[];
  readonly why: string;
  /** The code must fail with this error (`ORA-01422`, or `compile`); otherwise it must run. */
  readonly fails?: string;
  readonly tables?: boolean;
}

/** A question about a piece of code ("what happens when this runs?"). */
export const plsqlCodeChoiceFamily = (
  id: string,
  difficulty: QuestionDifficulty,
  hint: string,
  variants: readonly CodeChoiceVariant[],
): QuestionSource[] =>
  family(id, variants, (v): FamilyQuestion => ({
    difficulty,
    format: 'multiple-choice',
    prompt: prompt(v.question, v.tables),
    code: sql(v.code),
    ...choice(`${id}-${v.key}`, v.correct, v.wrong),
    ...(v.fails ? { plsqlCheck: { kind: 'fails' as const, error: v.fails } } : {}),
    hints: [hint],
    explanation: text(v.why),
  }));

export interface ConceptVariant {
  readonly key: string;
  readonly question: string;
  readonly correct: string;
  readonly wrong: readonly string[];
  readonly why: string;
}

/** Concept questions without code. Use sparingly; prefer code that is checked. */
export const plsqlConceptFamily = (
  id: string,
  difficulty: QuestionDifficulty,
  hint: string,
  variants: readonly ConceptVariant[],
): QuestionSource[] =>
  family(id, variants, (v): FamilyQuestion => ({
    difficulty,
    format: 'multiple-choice',
    prompt: text(v.question),
    ...choice(`${id}-${v.key}`, v.correct, v.wrong),
    hints: [hint],
    explanation: text(v.why),
  }));
