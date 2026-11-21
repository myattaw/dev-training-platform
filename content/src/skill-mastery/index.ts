import type { TrackSource } from '@pracstack/content-model';
import { typescriptTrack } from './typescript/track';

/** All Skill Mastery tracks. PostgreSQL, Oracle SQL and Angular are added in later phases. */
export const TRACKS: readonly TrackSource[] = [typescriptTrack];
