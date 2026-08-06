import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

// This config predates any installed test runner and pointed at a setup file
// that was never written, so it had never actually run. Two things changed:
//
//   setupFiles — removed. There is nothing to set up, and naming a file that
//   does not exist fails every suite before a single test is collected.
//
//   environment — 'node', not 'jsdom'. The extraction engine is pure by design
//   and must stay that way; running it without a DOM is what proves it. A test
//   that genuinely needs a browser opts in per file with the comment
//   `// @vitest-environment jsdom` at the top.
export default defineConfig({
  plugins: [react()],
  test: {
    // Only the application. `backend/` and `agents/` hold an abandoned NestJS
    // service and its specs; nothing under src/ or api/ imports a line of
    // either, and their tests cannot even be collected — `rxjs/operators` is not
    // installed. Left in the glob they made `vitest run` red for nine files
    // while every test that belongs to the product passed, which is why the
    // project had taken to running `vitest run src/lib` and quietly not running
    // the rest.
    //
    // backend/ is not deleted because backend/migrations is live and is where
    // every migration in this project lives.
    include: ['src/**/*.{test,spec}.{js,jsx,ts,tsx}'],
    environment: 'node',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', '**/__tests__/'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
})
