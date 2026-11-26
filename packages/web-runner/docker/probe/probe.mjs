// HTTP probe for web-challenge applications (local Docker). TRUSTED image, but it
// runs next to untrusted code: it joins the application container's network
// namespace (`--network container:<app>`), which has only a loopback interface,
// so the only thing it can reach is the learner's application on 127.0.0.1.
//
// stdin:  ProbeInput JSON (requests only; never expected values)
// stdout: "\n<nonce><ProbeOutput JSON>\n"
//
// The request logic is in probe-lib.mjs (shared with the Lambda web runners).
import { runSequences, waitForApp } from './probe-lib.mjs';

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
const { nonce, port, waitMs, requestTimeoutMs } = input;

// Exit only after stdout has drained: exiting right after write() loses output
// beyond the pipe buffer (~64 KB) and truncated large results.
function finish(output) {
  return new Promise(() => {
    process.stdout.write(`\n${nonce}${JSON.stringify(output)}\n`, () => process.exit(0));
  });
}

if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  await finish({ kind: 'error', message: 'invalid port' });
}
if (waitMs > 0 && !(await waitForApp(port, waitMs))) {
  await finish({ kind: 'not-ready' });
}
await finish({
  kind: 'completed',
  results: await runSequences(port, input.sequences, requestTimeoutMs),
});
