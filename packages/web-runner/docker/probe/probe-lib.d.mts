import type { ProbeRequest, ProbeResponse } from '../../src/protocol';

export declare const MAX_BODY_BYTES: number;
export declare function send(
  port: number,
  step: ProbeRequest,
  requestTimeoutMs: number,
): Promise<ProbeResponse>;
export declare function waitForApp(
  port: number,
  waitMs: number,
  stopped?: () => boolean,
): Promise<boolean>;
export declare function runSequences(
  port: number,
  sequences: readonly (readonly ProbeRequest[])[],
  requestTimeoutMs: number,
): Promise<ProbeResponse[][]>;
