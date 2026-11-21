import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import type { Invoke, InvokeOutcome } from '@pracstack/code-runner';

/**
 * Calls a runner function synchronously. Never retried: a retry could run a
 * submission twice. The response is returned as untrusted data; the runner
 * classes validate it.
 */
export function lambdaInvoke(client = new LambdaClient({ maxAttempts: 1 })): Invoke {
  return async (functionName, payload): Promise<InvokeOutcome> => {
    try {
      const res = await client.send(
        new InvokeCommand({
          FunctionName: functionName,
          InvocationType: 'RequestResponse',
          Payload: new TextEncoder().encode(JSON.stringify(payload)),
        }),
      );
      const text = res.Payload ? new TextDecoder().decode(res.Payload) : '';
      if (res.FunctionError) {
        let error = res.FunctionError;
        try {
          const body = JSON.parse(text) as { errorMessage?: unknown; errorType?: unknown };
          error = `${String(body.errorType ?? '')} ${String(body.errorMessage ?? '')}`.slice(
            0,
            500,
          );
        } catch {
          /* keep the generic error */
        }
        return { kind: 'function-error', error };
      }
      try {
        return { kind: 'returned', payload: JSON.parse(text) as unknown };
      } catch {
        return { kind: 'returned', payload: undefined };
      }
    } catch (err) {
      // Throttled, missing, not permitted, or unreachable.
      return { kind: 'refused', message: err instanceof Error ? err.name : 'InvokeFailed' };
    }
  };
}
