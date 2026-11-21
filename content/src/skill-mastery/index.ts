import type { TrackSource } from '@pracstack/content-model';
import { postgresqlTrack } from './postgresql/track';
import { typescriptTrack } from './typescript/track';

/** All Skill Mastery tracks. Oracle SQL and Angular are added in later phases. */
export const TRACKS: readonly TrackSource[] = [typescriptTrack, postgresqlTrack];
