import { defineConfig } from 'vitest/config';

// Every Docker suite here rebuilds the shared image contexts in dist/ (scripts/build.ts)
// and starts memory-hungry containers: run the files one at a time, not in parallel.
export default defineConfig({
  test: {
    fileParallelism: false,
  },
});
