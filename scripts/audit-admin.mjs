#!/usr/bin/env node
/**
 * Every screen in لوحة إدارة مرصد: what it reads, what it writes, whether its
 * controls are wired, and whether what it does reaches the company that it
 * happened to.
 *
 * "Do all the buttons work?" cannot be answered by opening the panel and
 * clicking, because the failures on this platform have not looked like failures.
 * A save that RLS filters out returns no error. A notification insert with the
 * wrong columns returned no error for months. A button with a plausible disabled
 * reason looks like policy. Every one of those reads as a working screen.
 *
 * So this asks the source four questions that the screen itself cannot fake:
 *
 *   بيانات   does it reach the database at all, or is it useState with rows typed in
 *   أزرار    does every <button> have a handler
 *   قراءة    does each write read its rows back, rather than trusting no-error
 *   إبلاغ    does a decision here tell the company it was made about
 *
 * The last one is the integration question. An admin panel that approves a
 * report and does not tell the company has not finished the job — the company
 * finds out by refreshing, or does not find out.
 *
 * Usage: node scripts/audit-admin.mjs
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const PAGES = 'src/pages'

// Screens whose job is to decide something about a company or a tenant. Only
// these are expected to notify — /admin/plans changing a limit is not news
// addressed to anyone in particular.
const DECIDES_FOR_A_COMPANY = new Set([
  'AdminReports', 'AdminRequests', 'AdminCompanyApproval', 'AdminCompanyVerification',
  'AdminClaimRequests', 'AdminCompaniesManagement', 'AdminTenants', 'AdminSubscriptions',
])

const files = readdirSync(PAGES)
  .filter((f) => f.startsWith('Admin') && f.endsWith('.jsx') && f !== 'AdminLogin.jsx')
  .sort()

const rows = []

for (const f of files) {
  const src = readFileSync(join(PAGES, f), 'utf8')
  const name = f.replace('.jsx', '')

  const reachesDb = /getSupabase|\.from\(['"]|from '\.\.\/lib\/api'|api\.\w+\(|\.rpc\(/.test(src)

  const writes = [...src.matchAll(/\.from\(['"]([a-z_]+)['"]\)\s*\n?\s*\.(insert|update|delete|upsert)/g)]
    .map((m) => ({ table: m[1], op: m[2] }))

  // audit_logs and notifications are deliberately best-effort: a decision must
  // not be undone because its paper trail failed to write, and both are wrapped
  // so a failure is logged rather than thrown. Counting them as unverified
  // writes made four screens that are entirely correct look like the ones that
  // are not — the whole point of this list is that it stays worth reading.
  const BEST_EFFORT = new Set(['audit_logs', 'notifications'])
  const uniqueWrites = [...new Set(writes.map((w) => `${w.op} ${w.table}`))]
  const mustVerify = [...new Set(
    writes.filter((w) => !BEST_EFFORT.has(w.table)).map((w) => `${w.op} ${w.table}`)
  )]

  const buttons = [...src.matchAll(/<button\b[^>]*?>/gs)]
  const inert = buttons.filter((b) => !/onClick|type=["']submit["']/.test(b[0])).length

  // Each write is judged on its own rather than by comparing two counts. The
  // counting version called AdminRequests unverified when every one of its
  // writes goes through a local helper that reads the rows back — the .select()
  // sits in the helper, not beside the write. A verification tool that cannot
  // see a one-line abstraction pushes people away from writing one.
  const unverifiedWrites = []
  for (const m of src.matchAll(/\.from\(['"]([a-z_]+)['"]\)\s*\n?\s*\.(insert|update|delete|upsert)\(/g)) {
    const [table, op] = [m[1], m[2]]
    if (BEST_EFFORT.has(table)) continue
    const before = src.slice(Math.max(0, m.index - 160), m.index)
    const after = src.slice(m.index, m.index + 520)
    const readsBackInline = /\.select\(/.test(after)
    const wrappedInHelper = /\b(wrote|writeChecked|mustWrite)\s*\(\s*$/.test(before.replace(/\s+$/, ' ')) ||
                            /\b(wrote|writeChecked|mustWrite)\s*\(/.test(before.slice(-60))
    if (!readsBackInline && !wrappedInHelper) unverifiedWrites.push(`${op} ${table}`)
  }

  rows.push({
    name,
    real: reachesDb,
    writes: uniqueWrites,
    mustVerify: mustVerify.length,
    unverified: [...new Set(unverifiedWrites)],
    inert,
    buttons: buttons.length,
    notifies: /notifyTenant\(|notifyUser\(/.test(src),
    shouldNotify: DECIDES_FOR_A_COMPANY.has(name),
    live: /useLiveData/.test(src),
    audits: /audit_logs/.test(src),
  })
}

const mark = (b) => (b ? '✅' : '—')

console.log('\n  لوحة إدارة مرصد — كل شاشة\n')
console.log('  بيانات  أزرار  قراءة  إبلاغ  لحظي  سجل   الشاشة')
console.log('  ' + '─'.repeat(66))

for (const r of rows) {
  const buttonsOk = r.inert === 0
  const readsBack = r.unverified.length === 0
  const notifyOk = !r.shouldNotify || r.notifies

  console.log(
    `  ${mark(r.real).padEnd(6)} ${mark(buttonsOk).padEnd(5)} ${mark(readsBack).padEnd(5)} ` +
    `${(r.shouldNotify ? mark(notifyOk) : '·').padEnd(5)} ${mark(r.live).padEnd(5)} ` +
    `${mark(r.audits).padEnd(5)} ${r.name}`
  )

  if (!r.real) console.log('           ⚠️  بيانات مكتوبة في الملف — لا تصل القاعدة إطلاقاً')
  if (r.inert) console.log(`           ⚠️  ${r.inert} من ${r.buttons} زراً بلا onClick`)
  if (r.unverified.length)
    console.log(`           ⚠️  بلا قراءة بعدها: ${r.unverified.join(' · ')} — الكتابة التي تحجبها RLS لا ترفع خطأ`)
  if (r.shouldNotify && !r.notifies) console.log('           ⚠️  يقرّر في شأن شركة ولا يبلّغها')
  if (r.writes.length) console.log(`           يكتب: ${r.writes.join(' · ')}`)
}

const fake = rows.filter((r) => !r.real)
const deadButtons = rows.filter((r) => r.inert > 0)
const unverified = rows.filter((r) => r.unverified.length)
const silent = rows.filter((r) => r.shouldNotify && !r.notifies)

console.log('\n  ' + '─'.repeat(66))
console.log(`  ${rows.length} شاشة`)
console.log(`  ${fake.length} بيانات مُختلقة${fake.length ? ': ' + fake.map((r) => r.name).join('، ') : ''}`)
console.log(`  ${deadButtons.length} فيها أزرار بلا onClick${deadButtons.length ? ': ' + deadButtons.map((r) => r.name).join('، ') : ''}`)
console.log(`  ${unverified.length} تكتب بلا قراءة بعدها${unverified.length ? ': ' + unverified.map((r) => r.name).join('، ') : ''}`)
console.log(`  ${silent.length} تقرّر بلا إبلاغ${silent.length ? ': ' + silent.map((r) => r.name).join('، ') : ''}`)
console.log('')
