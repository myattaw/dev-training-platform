import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { emptyAccountData } from './memory-account';
import { emptyStoreData, InMemoryProgressStore, type StoreData } from './memory-store';

/**
 * Local development store: in memory, persisted to a JSON file after every
 * write (write to a temp file, then rename, so a crash never leaves a
 * half-written file). Single process only.
 */
export class FileProgressStore extends InMemoryProgressStore {
  constructor(private readonly file: string) {
    super(load(file));
  }

  protected override persist(): Promise<void> {
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    renameSync(tmp, this.file);
    return Promise.resolve();
  }
}

function load(file: string): StoreData {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return emptyStoreData();
  }
  const data = JSON.parse(text) as Partial<StoreData>;
  if (data.version !== 1) {
    throw new Error(
      `${file} has an unsupported format. Delete it to start with empty local progress.`,
    );
  }
  return {
    ...emptyStoreData(),
    ...data,
    account: { ...emptyAccountData(), ...data.account },
  } as StoreData;
}
