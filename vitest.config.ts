import { defineConfig } from 'vitest/config'

// Default unit-test run: fast, hermetic, no real omp/pi processes.
// The real-binary compatibility suite lives in integration/omp and runs via
// `pnpm test:omp` (vitest.omp.config.ts).
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx']
  }
})
