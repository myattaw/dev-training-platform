import { PGlite } from '@electric-sql/pglite';

/**
 * An empty, freshly initialized PostgreSQL cluster (data directory dump).
 *
 * Initializing a cluster (initdb) is by far the slowest part of starting
 * PGlite, about a second; loading a dump of one takes a fraction of that,
 * and creating an exercise's tables and rows in it only milliseconds. So
 * each run starts from this dump, and the AWS SQL runner image ships one
 * made at image build time (`make-base-cluster.ts`), so even a cold start
 * skips initdb.
 */
export async function makeBaseCluster(): Promise<Blob> {
  const pg = await PGlite.create();
  try {
    return await pg.dumpDataDir('none');
  } finally {
    await pg.close();
  }
}
