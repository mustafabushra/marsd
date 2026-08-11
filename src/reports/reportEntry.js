/**
 * What the serverless function needs, in one place, so it can be bundled once.
 *
 * The function imports the compiled output of this file rather than these
 * modules directly — see scripts/build-report-template.mjs for why. Keeping the
 * entry point separate means the template and the stylesheet stay ordinary
 * source files that the rest of the project can import normally.
 */
export { default as TrustReportDocument } from './TrustReportDocument.jsx'
export { documentShell, REPORT_CSS } from './documentShell.js'
