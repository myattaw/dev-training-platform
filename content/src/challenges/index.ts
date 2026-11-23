import { readFileSync } from 'node:fs';
import type { ChallengeSource } from '@pracstack/content-model';
import { source as applyEditCommands } from './apply-edit-commands/challenge';
import * as applyEditCommandsRef from './apply-edit-commands/reference';
import { source as balancedBrackets } from './balanced-brackets/challenge';
import * as balancedBracketsRef from './balanced-brackets/reference';
import { source as lruCache } from './lru-cache/challenge';
import * as lruCacheRef from './lru-cache/reference';
import { source as mergeIntervals } from './merge-intervals/challenge';
import * as mergeIntervalsRef from './merge-intervals/reference';
import { source as pangram } from './pangram/challenge';
import * as pangramRef from './pangram/reference';
import { source as textCursorBuffer } from './text-cursor-buffer/challenge';
import * as textCursorBufferRef from './text-cursor-buffer/reference';
import { source as undoRedoHistory } from './undo-redo-history/challenge';
import * as undoRedoHistoryRef from './undo-redo-history/reference';
import { source as reverseString } from './reverse-string/challenge';
import * as reverseStringRef from './reverse-string/reference';
import { source as employeeApi } from './employee-api/challenge';

export interface ChallengeEntry {
  readonly source: ChallengeSource;
  /**
   * The TypeScript reference solution module. Private: used only to verify the tests.
   * Every language a challenge offers has a reference (content.spec.ts checks it).
   */
  readonly reference?: Readonly<Record<string, unknown>>;
  /**
   * The Java reference solution source, verified against every test through the
   * real Java runner (services/api/src/challenges/challenge-grading.spec.ts).
   */
  readonly javaReference?: string;
  /**
   * The C# reference solution source, verified against every test through the
   * real C# runner (services/api/src/challenges/challenge-grading.spec.ts).
   */
  readonly csharpReference?: string;
}

const javaReference = (id: string): string =>
  readFileSync(new URL(`./${id}/Reference.java`, import.meta.url), 'utf8');

const csharpReference = (id: string): string =>
  readFileSync(new URL(`./${id}/Reference.cs`, import.meta.url), 'utf8');

/** All challenges, in catalog order. */
export const CHALLENGES: readonly ChallengeEntry[] = [
  {
    source: pangram,
    reference: pangramRef,
    javaReference: javaReference('pangram'),
    csharpReference: csharpReference('pangram'),
  },
  {
    source: reverseString,
    reference: reverseStringRef,
    javaReference: javaReference('reverse-string'),
    csharpReference: csharpReference('reverse-string'),
  },
  {
    source: balancedBrackets,
    reference: balancedBracketsRef,
    javaReference: javaReference('balanced-brackets'),
    csharpReference: csharpReference('balanced-brackets'),
  },
  {
    source: mergeIntervals,
    reference: mergeIntervalsRef,
    javaReference: javaReference('merge-intervals'),
    csharpReference: csharpReference('merge-intervals'),
  },
  {
    source: lruCache,
    reference: lruCacheRef,
    javaReference: javaReference('lru-cache'),
    csharpReference: csharpReference('lru-cache'),
  },
  {
    source: applyEditCommands,
    reference: applyEditCommandsRef,
    javaReference: javaReference('apply-edit-commands'),
    csharpReference: csharpReference('apply-edit-commands'),
  },
  {
    source: textCursorBuffer,
    reference: textCursorBufferRef,
    javaReference: javaReference('text-cursor-buffer'),
    csharpReference: csharpReference('text-cursor-buffer'),
  },
  {
    source: undoRedoHistory,
    reference: undoRedoHistoryRef,
    javaReference: javaReference('undo-redo-history'),
    csharpReference: csharpReference('undo-redo-history'),
  },
  {
    source: employeeApi,
    csharpReference: csharpReference('employee-api'),
  },
];
