#!/usr/bin/env node
/**
 * Compile the report template into something a serverless runtime can load.
 *
 * ============================================================================
 * Why this exists
 * ============================================================================
 * api/trust-report-pdf.js imported the document straight from
 * src/reports/TrustReportDocument.jsx, and the fonts with
 * `import … with { type: 'json' }`. Both work locally because vite transpiles
 * everything it serves. Neither is guaranteed in a plain Node runtime:
 *
 *   .jsx is not JavaScript. Node does not transpile it, and whether the
 *     platform's bundler does is a property of the platform, not of this code.
 *   `with { type: 'json' }` is an import attribute — newer than `assert`, and
 *     not understood by every Node the function might land on.
 *
 * Both fail at *module load*, before a single line of the handler runs. That is
 * exactly what was observed: FUNCTION_INVOCATION_FAILED for every request,
 * including one with a malformed uuid that the handler rejects on its second
 * line. A crash before your code is a crash your code cannot report.
 *
 * So the template is bundled ahead of time into plain ES2022 with the fonts
 * inlined, and the function imports that. React stays external — the runtime
 * has it, and duplicating it would be megabytes for nothing.
 *
 *   node scripts/build-report-template.mjs
 */

import { build } from 'esbuild'
import { mkdirSync } from 'node:fs'

const OUT = 'api/_report/document.js'

mkdirSync('api/_report', { recursive: true })

await build({
  entryPoints: ['src/reports/reportEntry.js'],
  outfile: OUT,
  bundle: true,
  format: 'esm',
  platform: 'node',
  // The floor Vercel's Node runtimes have supported for years. Nothing here
  // needs anything newer, and asking for less is how the import-attribute
  // problem happened in the first place.
  target: 'node18',
  jsx: 'automatic',
  loader: { '.json': 'json' },
  // React is provided by the function's own dependencies.
  external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/server'],
  logLevel: 'warning',
})

console.log(`✓ ${OUT}`)
