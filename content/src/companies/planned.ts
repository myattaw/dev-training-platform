import type { PlannedChallenge } from '@pracstack/content-model';

/**
 * Announced challenges: metadata only, nothing to open or grade. No release
 * dates are given because none are set.
 */
export const PLANNED_CHALLENGES: readonly PlannedChallenge[] = [
  {
    id: 'editor-with-selection',
    title: 'Editor with a Selection',
    summary:
      'Extend a cursor-based text buffer with a selected range: select, replace and delete the selection.',
    category: 'data-structures',
    difficulty: 'medium',
    tags: ['cursor-state', 'text-editing', 'index-boundaries', 'design'],
    availability: 'coming-soon',
    access: 'pro',
  },
  {
    id: 'piece-table-editor',
    title: 'Piece Table Text Buffer',
    summary:
      'Store a large document as pieces of the original and the added text, so edits stay fast however long the document is.',
    category: 'data-structures',
    difficulty: 'hard',
    tags: ['text-editing', 'design', 'index-boundaries', 'arrays'],
    availability: 'coming-soon',
    access: 'pro',
  },
];
