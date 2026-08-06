#!/usr/bin/env node
/**
 * What is actually behind each admin screen?
 *
 * `audit-screens.mjs` answers a narrower question — does this screen reach the
 * database at all — and it has been reporting the same two failures for weeks.
 * This one asks what a person reviewing the admin area would ask: which screens
 * do real work, which only display, which are stubs, and which parts of running
 * the platform have no screen at all.
 *
 * It reads the source rather than the database, because the gap being looked
 * for is between what the product needs and what was built, and neither of
 * those is a row anywhere.
 *
 *   node scripts/audit-admin-screens.mjs
 */

import { readFileSync, readdirSync } from 'node:fs'

const DIR = 'src/pages'
const files = readdirSync(DIR).filter((f) => /^Admin.*\.jsx$/.test(f))

const TABLE = /from\(\s*['"`]([a-z_]+)['"`]\s*\)/g
const RPC = /\.rpc\(\s*['"`]([a-z_]+)['"`]/g
const WRITES = /\.(insert|update|upsert|delete)\s*\(/g

// Screens that reach the database through the api layer rather than calling
// supabase themselves. Missing this called AdminLogs a mock when it reads the
// audit trail on every load — a wrong finding is worse than no finding, because
// somebody acts on it.
const VIA_API = /\bapi\.(get|list|fetch|load|create|update|delete|save|approve|reject)[A-Z]\w*/g

// Sign-in pages have nothing to query. Counting them as mocks buries the real
// ones in noise.
const AUTH_PAGES = new Set(['AdminLogin'])

const rows = []

for (const file of files) {
  const src = readFileSync(`${DIR}/${file}`, "utf8")

  const tables = new Set([...src.matchAll(TABLE)].map((m) => m[1]))
  const rpcs = new Set([...src.matchAll(RPC)].map((m) => m[1]))
  const viaApi = new Set([...src.matchAll(VIA_API)].map((m) => m[0].replace('api.', '')))
  const writes = [...src.matchAll(WRITES)].length
    + [...viaApi].filter((f) => /^(create|update|delete|save|approve|reject)/.test(f)).length

  // A screen that renders arrays defined in its own file and never queries is
  // a mock, whatever it looks like on screen.
  const reads = tables.size + rpcs.size + viaApi.size
  const lines = src.split('\n').length

  // Buttons that do nothing are the other way a screen lies about being built.
  const buttons = (src.match(/<button/g) ?? []).length
  const handlers = (src.match(/onClick=/g) ?? []).length

  const name = file.replace(/\.jsx$/, '')
  if (AUTH_PAGES.has(name)) continue

  rows.push({
    name,
    tables: [...tables],
    rpcs: [...rpcs],
    viaApi: [...viaApi],
    writes,
    reads,
    lines,
    deadButtons: Math.max(0, buttons - handlers),
    comingSoon: /ComingSoon/.test(src),
  })
}

const kind = (r) => {
  // A screen that says plainly it is not built is the opposite of fabricated
  // data. Counting it as a fake made this audit cry wolf on two screens that
  // were correctly built, which is how an audit stops being read.
  if (r.comingSoon) return 'معلنة صراحةً'
  if (r.reads === 0) return 'مُختلَقة'
  if (r.writes === 0) return 'عرض فقط'
  return 'تعمل'
}

const byKind = { 'مُختلَقة': [], 'معلنة صراحةً': [], 'عرض فقط': [], 'تعمل': [] }
for (const r of rows) byKind[kind(r)].push(r)

console.log(`\n  ${rows.length} شاشة إدارية\n`)

for (const [k, list] of Object.entries(byKind)) {
  if (!list.length) continue
  const mark = k === 'مُختلَقة' ? '❌' : k === 'معلنة صراحةً' ? '📋' : k === 'عرض فقط' ? '👁' : '✅'
  console.log(`  ${mark} ${k} — ${list.length}`)
  for (const r of list.sort((a, b) => b.lines - a.lines)) {
    const sources = [...r.tables, ...r.rpcs.map((x) => `${x}()`), ...r.viaApi.map((x) => `api.${x}`)]
    const t = sources.length ? sources.slice(0, 4).join(', ') : '—'
    console.log(`     ${r.name.padEnd(26)} ${String(r.lines).padStart(4)} سطر  ${t}`)
    if (r.deadButtons > 0) console.log(`     ${' '.repeat(26)} ⚠️  ${r.deadButtons} زر بلا onClick`)
  }
  console.log()
}

// ---------------------------------------------------------------------------
// What has no screen
// ---------------------------------------------------------------------------
// Listed by hand because the question is "what does running this platform
// require", and no query answers that. Each entry names the table that already
// exists for it — a table with no screen is work that was started and stopped.
const NEEDS = [
  ['extraction_corrections', 'تصحيحات الاستخراج', 'يُجمع منذ اليوم ولا شاشة تقرأه — لا نعرف أي قاعدة استخراج تخطئ'],
  ['report_documents', 'مرفقات التقارير', 'الجدول فارغ ولا شاشة ترفع أو تراجع مستنداً'],
  ['document_reads', 'استهلاك قراءة المستندات', 'الحدود تُسجَّل ولا أحد يراها'],
  ['reference_activities', 'دليل الأنشطة', 'له شاشة — AdminActivities'],
]

const allTables = new Set(rows.flatMap((r) => r.tables))

console.log('  جداول بلا شاشة تقرأها:\n')
let orphans = 0
for (const [table, label, why] of NEEDS) {
  if (allTables.has(table)) continue
  orphans++
  console.log(`     ❌ ${label}  (${table})`)
  console.log(`        ${why}\n`)
}
if (!orphans) console.log('     ✅ لا يوجد\n')

const mock = byKind['مُختلَقة'].length
const dead = rows.reduce((n, r) => n + r.deadButtons, 0)
console.log(`  الخلاصة: ${byKind['تعمل'].length} تعمل · ${byKind['عرض فقط'].length} عرض · ${mock} مُختلَقة · ${dead} زر معطّل · ${orphans} جدول يتيم\n`)

// A fabricated screen or a dead button is a defect — something claims to work
// and does not. An orphan table is a gap: work that was started and has not
// been finished, which is a plan rather than a fault.
//
// Only the first kind fails. A check that reports a backlog as a failure fails
// on every run, and a check that always fails is a check nobody reads — which
// is precisely how the two honest ComingSoon screens sat in a red list for
// weeks while everyone learned to skip past it.
process.exit(mock + dead > 0 ? 1 : 0)
