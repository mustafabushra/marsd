#!/usr/bin/env node
/**
 * Which screens write to the database, and which of them check anything first.
 *
 * A limit that exists in a plan and is never consulted at the point of action is
 * not a limit. Reading each screen to find out does not scale and is how the
 * watchlist ceiling stayed wrong; this enumerates the writes mechanically so a
 * gap shows up as an absence rather than as something nobody thought to look
 * for.
 *
 * It reports facts, not verdicts: a screen writing without an entitlement check
 * may be perfectly correct — deleting a row, or updating one's own profile. The
 * output is a list to work through, not a list of bugs.
 *
 * Usage: node scripts/audit-screens.mjs
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const PAGES = 'src/pages'

// Screens a company user reaches, and what each is for.
const COMPANY_SCREENS = {
  'CompanyDashboard.jsx': 'لوحة التحكم',
  'Search.jsx': 'البحث عن الشركات',
  'AddCompany.jsx': 'إضافة شركة',
  'AddReport.jsx': 'إضافة تقرير',
  'MyReports.jsx': 'تقاريري',
  'MyCompanies.jsx': 'الشركات المُرسلة',
  'TrustReport.jsx': 'تقرير الشركة',
  'Watchlist.jsx': 'قوائم المراقبة',
  'Compare.jsx': 'المقارنة',
  'CompanyUsers.jsx': 'إدارة المستخدمين',
  'Subscription.jsx': 'الاشتراك',
  'Profile.jsx': 'ملف الشركة',
  'Notifications.jsx': 'الإشعارات',
}

const rows = []

for (const [file, label] of Object.entries(COMPANY_SCREENS)) {
  let src
  try { src = readFileSync(join(PAGES, file), 'utf8') } catch { rows.push({ label, file, missing: true }); continue }

  const writes = [...src.matchAll(/\.from\(['"]([a-z_]+)['"]\)\s*\n?\s*\.(insert|update|delete|upsert)/g)]
    .map((m) => `${m[2]} ${m[1]}`)
  const uniqueWrites = [...new Set(writes)]

  rows.push({
    label,
    file,
    writes: uniqueWrites,
    // Does the screen consult the plan at all?
    entitlements: /useEntitlements/.test(src),
    limitCheck: /limitOf\(|remaining\(|allows\(|watchlistRoom\(/.test(src),
    featureGate: /\bcan\(['"]/.test(src),
    live: /useLiveData/.test(src),
    // A screen holding rows in useState with no supabase call is a mockup.
    real: /getSupabase|searchCompanies|getCompany/.test(src),
  })
}

const mark = (b) => (b ? '✅' : '—')

console.log('\n  شاشات لوحة الشركة:\n')
console.log('  بيانات  حدود  ميزة  لحظي  الشاشة')
console.log('  ' + '─'.repeat(58))

for (const r of rows) {
  if (r.missing) { console.log(`  ${'❌'.padEnd(6)}                   ${r.label}  (الملف مفقود)`); continue }
  console.log(`  ${mark(r.real).padEnd(6)} ${mark(r.limitCheck).padEnd(5)} ${mark(r.featureGate).padEnd(5)} ${mark(r.live).padEnd(5)} ${r.label}`)
  if (r.writes.length) console.log(`         يكتب: ${r.writes.join(' · ')}`)
}

// Admin screens: does the screen reach the database at all, and do its controls
// do anything?
//
// The first version of this looked for getSupabase and .from('…') and called
// AdminUsers invented data. It reads real users through api.getAdminUsers —
// going through the api module is a way of reaching the database, not evidence
// of not reaching it. A check that knows only one spelling of "real" reports the
// other spelling as fake, and a false accusation costs as much attention as a
// missed one.
console.log('\n  شاشات لوحة الإدارة:\n')

const adminFiles = readdirSync(PAGES)
  .filter((f) => f.startsWith('Admin') && f.endsWith('.jsx') && f !== 'AdminLogin.jsx')

const fake = []
const dead = []

for (const f of adminFiles) {
  const src = readFileSync(join(PAGES, f), 'utf8')
  const name = f.replace('.jsx', '')

  const reachesDb = /getSupabase|\.from\(['"]|from '\.\.\/lib\/api'|api\.\w+\(/.test(src)
  if (!reachesDb) { fake.push(name); continue }

  // A <button> with no onClick and no type="submit" is furniture. Counting them
  // is crude — a few are genuinely decorative — but a screen with several is
  // worth opening.
  const buttons = [...src.matchAll(/<button\b[^>]*?>/gs)]
  const inert = buttons.filter((b) => !/onClick|type=["']submit["']/.test(b[0])).length
  if (inert > 0) dead.push({ name, inert, total: buttons.length })
}

console.log('  بيانات مُختلقة — لا تصل القاعدة إطلاقاً:')
console.log(fake.length ? fake.map((f) => `    ❌ ${f}`).join('\n') : '    ✅ لا يوجد')

console.log('\n  أزرار بلا onClick:')
console.log(dead.length
  ? dead.sort((a, b) => b.inert - a.inert).map((d) => `    ⚠️  ${d.name}: ${d.inert} من ${d.total}`).join('\n')
  : '    ✅ لا يوجد')

console.log(`\n  ${fake.length} مُختلقة · ${dead.length} فيها أزرار معطّلة · من ${adminFiles.length}\n`)
