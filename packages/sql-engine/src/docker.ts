/** Small Docker CLI helpers shared by the local database containers. */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

export async function docker(args: string[]): Promise<string> {
  return (await exec('docker', args, { maxBuffer: 10 * 1024 * 1024 })).stdout.trim();
}

/** stdout and stderr of a container, or '' when it does not exist. */
export async function containerLogs(name: string): Promise<string> {
  const logs = await exec('docker', ['logs', name], { maxBuffer: 10 * 1024 * 1024 }).catch(() => ({
    stdout: '',
    stderr: '',
  }));
  return `${logs.stdout}${logs.stderr}`;
}

export async function running(name: string): Promise<boolean> {
  try {
    return (await docker(['inspect', '-f', '{{.State.Running}}', name])) === 'true';
  } catch {
    return false;
  }
}

/** The host port a container port is published on. */
export async function hostPort(name: string, containerPort: string): Promise<number> {
  const mapping = await docker(['port', name, containerPort]);
  return Number(mapping.split('\n')[0]?.split(':').pop());
}

export async function stopContainer(name: string): Promise<void> {
  await docker(['rm', '-f', name]).catch(() => undefined);
}
