import { defineConfig } from 'vitest/config'

// Real-binary RPC compatibility suite (`pnpm test:omp`). Spawns the actual
// omp/pi executables and drives them through the GUI's own transport,
// handshake and session layers. Requires a configured runtime (an API key
// in the environment or a logged-in agent config); model-calling tests
// skip cleanly when the runtime cannot actually complete a turn.
export default defineConfig({
  test: {
    include: ['integration/**/*.test.ts'],
    testTimeout: 90_000,
    hookTimeout: 30_000,
    // Real processes: run serially, never in parallel workers.
    pool: 'forks',
    maxConcurrency: 1,
    fileParallelism: false
  }
})
