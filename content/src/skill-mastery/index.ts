import type { TrackSource } from '@pracstack/content-model';
import { angularTrack } from './angular/track';
import { aspnetCoreTrack } from './aspnetcore/track';
import { azureTrack } from './azure/track';
import { csharpTrack } from './csharp/track';
import { engineeringTrack } from './engineering/track';
import { oracleTrack } from './oracle/track';
import { postgresqlTrack } from './postgresql/track';
import { powerPlatformTrack } from './powerplatform/track';
import { sqlServerTrack } from './sqlserver/track';
import { typescriptTrack } from './typescript/track';

/** All Skill Mastery tracks, in catalog order. */
export const TRACKS: readonly TrackSource[] = [
  typescriptTrack,
  angularTrack,
  postgresqlTrack,
  oracleTrack,
  csharpTrack,
  aspnetCoreTrack,
  sqlServerTrack,
  azureTrack,
  engineeringTrack,
  powerPlatformTrack,
];
