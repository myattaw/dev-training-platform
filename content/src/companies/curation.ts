import type { PreparationPath } from '@pracstack/content-model';
import type { CuratedRecommendation } from './recommend';

/**
 * Editorial choices per company. Reasons describe what a challenge practices;
 * they never claim the company asks it.
 */
export const CURATED_RECOMMENDATIONS: Readonly<Record<string, readonly CuratedRecommendation[]>> = {
  'liberty-mutual': [
    {
      challengeId: 'text-cursor-buffer',
      sourceProblemId: 'lc-companywise:2296',
      reason:
        'Recommended because it practices cursor state management: moving a cursor and editing text at its position.',
      similarityTags: ['cursor-state', 'text-editing', 'index-boundaries'],
      confidence: 'high',
    },
    {
      challengeId: 'apply-edit-commands',
      sourceProblemId: 'lc-companywise:2296',
      reason:
        'Recommended for efficient insertion and deletion: replay editing commands and handle their edge cases.',
      similarityTags: ['command-parsing', 'text-editing', 'index-boundaries'],
      confidence: 'high',
    },
    {
      challengeId: 'undo-redo-history',
      sourceProblemId: 'lc-companywise:2296',
      reason: 'Builds on the same editor state: record edits so they can be undone and redone.',
      similarityTags: ['undo-redo', 'stacks', 'design'],
      confidence: 'medium',
    },
    {
      challengeId: 'balanced-brackets',
      reason: 'Practices stacks, the data structure behind a fast two-stack text buffer.',
      similarityTags: ['stacks'],
      confidence: 'medium',
    },
    {
      challengeId: 'editor-with-selection',
      sourceProblemId: 'lc-companywise:2296',
      reason:
        'Extends the cursor buffer with a selected range: a natural next step in editor design.',
      similarityTags: ['cursor-state', 'text-editing'],
      confidence: 'medium',
    },
    {
      challengeId: 'piece-table-editor',
      sourceProblemId: 'lc-companywise:2296',
      reason: 'Practices an efficient text buffer for large documents.',
      similarityTags: ['text-editing', 'design'],
      confidence: 'medium',
    },
  ],
};

/** Shown only when every step points at content that exists (checked by the build). */
export const PREPARATION_PATHS: readonly PreparationPath[] = [
  {
    id: 'liberty-mutual-text-editor',
    companyId: 'liberty-mutual',
    title: 'Text editor preparation',
    summary:
      'Five steps from string handling to a timed session, built around the editing skills in the reported text-editor problem.',
    steps: [
      {
        title: 'Review string operations',
        description: 'Warm up with slicing and rebuilding strings.',
        target: { kind: 'challenge', challengeId: 'reverse-string' },
      },
      {
        title: 'Process editing commands',
        description: 'Replay typing, cursor moves and deletions, including the edge cases.',
        target: { kind: 'challenge', challengeId: 'apply-edit-commands' },
      },
      {
        title: 'Build a text buffer with a cursor',
        description: 'Design the data structure: two stacks around the cursor.',
        target: { kind: 'challenge', challengeId: 'text-cursor-buffer' },
      },
      {
        title: 'Add undo and redo',
        description: 'Record edits so they can be reversed and re-applied.',
        target: { kind: 'challenge', challengeId: 'undo-redo-history' },
      },
      {
        title: 'Complete a timed session',
        description: 'Solve a recommended challenge against the clock.',
        target: { kind: 'timed-session' },
      },
    ],
  },
];
