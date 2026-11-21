import type { TrackSource } from '@pracstack/content-model';
import { oracleTrack } from './oracle/track';
import { postgresqlTrack } from './postgresql/track';
import { typescriptTrack } from './typescript/track';

/** All Skill Mastery tracks. Angular is added in a later phase. */
export const TRACKS: readonly TrackSource[] = [typescriptTrack, postgresqlTrack, oracleTrack];
