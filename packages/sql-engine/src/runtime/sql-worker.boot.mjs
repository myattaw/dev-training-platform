// Worker threads do not inherit the TypeScript loader of their parent, so
// this plain-JavaScript entry registers tsx and then loads the real worker.
import { register } from 'tsx/esm/api';

register();
await import('./sql-worker.ts');
