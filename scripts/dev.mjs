// Runs the local API (with reload on change) and the Angular dev server together.
// Ctrl+C stops both; if either exits, the other is stopped too.
import { spawn } from 'node:child_process';

// Optional: PRACSTACK_WEB_PORT=4300 npm start (the API port is PRACSTACK_API_PORT, default 3100).
const webPort = process.env.PRACSTACK_WEB_PORT;

const processes = [
  { name: 'api', color: 35, command: 'npm run api:watch' },
  { name: 'web', color: 36, command: `npx ng serve${webPort ? ` --port ${webPort}` : ''}` },
].map(({ name, color, command }) => {
  const child = spawn(command, { shell: true, stdio: ['inherit', 'pipe', 'pipe'] });
  const prefix = `\x1b[${color}m[${name}]\x1b[0m `;
  const forward = (stream, target) =>
    stream.on('data', (chunk) => {
      for (const line of chunk.toString().split(/\r?\n/)) if (line) target.write(prefix + line + '\n');
    });
  forward(child.stdout, process.stdout);
  forward(child.stderr, process.stderr);
  child.on('exit', (code) => {
    console.log(`${prefix}exited with code ${code}`);
    shutdown(code ?? 0);
  });
  return child;
});

let stopping = false;
function shutdown(code) {
  if (stopping) return;
  stopping = true;
  for (const child of processes) if (child.exitCode === null) child.kill();
  setTimeout(() => process.exit(code), 500);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
