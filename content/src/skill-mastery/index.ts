import type { TrackSource } from '@pracstack/content-model';
import { angularTrack } from './angular/track';
import { csharpTrack } from './csharp/track';
import { oracleTrack } from './oracle/track';
import { postgresqlTrack } from './postgresql/track';
import { typescriptTrack } from './typescript/track';

/** All Skill Mastery tracks, in catalog order. */
export const TRACKS: readonly TrackSource[] = [
  typescriptTrack,
  angularTrack,
  postgresqlTrack,
  oracleTrack,
  csharpTrack,
];
