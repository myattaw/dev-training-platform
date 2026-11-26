import type { DockerWebRunner } from './docker-web-runner';
import type { ProbeRequest, WebProject } from './protocol';
import { type BatchPhase, type BatchRun, runBatch } from './run-tests';

/**
 * Runs one batch (build, start, send request sequences) somewhere isolated and
 * reports the raw outcome. Implementations never throw: anything that goes
 * wrong on their side is `unavailable` (an infrastructure error, never the
 * learner's fault). Grading happens on the trusted side (gradeBatch).
 */
export interface WebExecutor {
  runBatch(
    project: WebProject,
    sequences: readonly (readonly ProbeRequest[])[],
    onPhase?: (phase: BatchPhase) => void,
  ): Promise<BatchRun>;
}

/** Local Docker containers (DockerWebRunner); reports each phase as it happens. */
export class DockerWebExecutor implements WebExecutor {
  constructor(private readonly runner: DockerWebRunner) {}

  async runBatch(
    project: WebProject,
    sequences: readonly (readonly ProbeRequest[])[],
    onPhase?: (phase: BatchPhase) => void,
  ): Promise<BatchRun> {
    try {
      return await runBatch(this.runner, project, sequences, {
        onApp: (app) =>
          app.onChange(() => {
            if (app.state === 'building') onPhase?.('building');
            else if (app.state === 'starting') onPhase?.('starting');
            else if (app.state === 'ready') onPhase?.('testing');
          }),
      });
    } catch {
      return { kind: 'unavailable', message: 'The application runner failed.' };
    }
  }
}
