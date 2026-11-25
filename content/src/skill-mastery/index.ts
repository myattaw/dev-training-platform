import type { TrackSource } from '@pracstack/content-model';
import { angularTrack } from './angular/track';
import { aspnetCoreTrack } from './aspnetcore/track';
import { awsTrack } from './aws/track';
import { azureTrack } from './azure/track';
import { csharpTrack } from './csharp/track';
import { djangoTrack } from './django/track';
import { engineeringTrack } from './engineering/track';
import { javaTrack } from './java/track';
import { oracleTrack } from './oracle/track';
import { plsqlTrack } from './plsql/track';
import { postgresqlTrack } from './postgresql/track';
import { pythonTrack } from './python/track';
import { powerPlatformTrack } from './powerplatform/track';
import { springBootTrack } from './spring-boot/track';
import { sqlServerTrack } from './sqlserver/track';
import { swiftTrack } from './swift/track';
import { typescriptTrack } from './typescript/track';

/** All Skill Mastery tracks, in catalog order. */
export const TRACKS: readonly TrackSource[] = [
  typescriptTrack,
  angularTrack,
  postgresqlTrack,
  oracleTrack,
  plsqlTrack,
  csharpTrack,
  pythonTrack,
  javaTrack,
  swiftTrack,
  aspnetCoreTrack,
  springBootTrack,
  djangoTrack,
  sqlServerTrack,
  awsTrack,
  azureTrack,
  powerPlatformTrack,
  engineeringTrack,
];
