#!/usr/bin/env node
/**
 * Every command in the palette must point at a route that exists.
 *
 * This is the check that makes it safe to keep the command list in code instead
 * of the database. A route renamed in App.jsx and not renamed in commands.js is
 * a menu entry that leads to a 404 — and nothing about it looks wrong: the
 * palette renders, the item appears, the click navigates, and the person lands
 * on an error page and concludes the product is broken.
 *
 * There is no runtime error to catch, so the check has to happen here.
 *
 *   node scripts/verify-commands.mjs
 */

import { readFileSync } from 'node:fs'
import { COMMANDS, commandsFor } from '../src/lib/commands.js'
import { fold } from '../src/lib/extraction/fold.js'

let failed = 0
const check = (ok, name, detail = '') => {
  console.log(`  ${ok ? '✅' : '❌'} ${name}${ok ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}

// ---------------------------------------------------------------------------
// The routes the router actually declares
// ---------------------------------------------------------------------------
const app = readFileSync('src/App.jsx', 'utf8')
const routes = new Set(
  [...app.matchAll(/<Route\s+path="([^"]+)"/g)].map((m) => m[1]),
)
console.log(`  المسارات في App.jsx: ${routes.size}\n`)

// A route with a parameter cannot be a destination on its own, so a command
// must not point at one — «/admin/company/:id» is not somewhere to send anyone.
const isConcrete = (p) => !p.includes(':') && !p.includes('*')

for (const cmd of COMMANDS) {
  if (!isConcrete(cmd.to)) {
    check(false, `${cmd.id}`, `يشير لمسار فيه معامل: ${cmd.to}`)
    continue
  }
  check(routes.has(cmd.to), `${cmd.id} → ${cmd.to}`, 'المسار غير موجود في App.jsx')
}

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------
console.log('')
const ids = COMMANDS.map((c) => c.id)
check(new Set(ids).size === ids.length, 'لا معرّف مكرر',
  ids.filter((v, i) => ids.indexOf(v) !== i).join(', '))

const titles = COMMANDS.map((c) => `${c.category}:${c.title}`)
check(new Set(titles).size === titles.length, 'لا عنوان مكرر داخل التصنيف نفسه',
  titles.filter((v, i) => titles.indexOf(v) !== i).join(', '))

for (const c of COMMANDS) {
  if (!['admin', 'company', 'any'].includes(c.scope)) {
    check(false, c.id, `نطاق غير معروف: ${c.scope}`)
  }
  if (!c.keywords?.length) check(false, c.id, 'بلا كلمات بحث')
  if (!c.icon) check(false, c.id, 'بلا أيقونة')
}
check(true, 'كل أمر له نطاق وكلمات بحث وأيقونة')

// ---------------------------------------------------------------------------
// Permission
// ---------------------------------------------------------------------------
// The palette must not offer an administrator's screen to somebody who will be
// bounced to /unauthorized. Advertising a door you cannot open is worse than
// not listing it.
console.log('')
const asCompany = commandsFor({ isPlatformAdmin: false, hasTenant: true })
check(!asCompany.some((c) => c.to.startsWith('/admin')),
  'مستخدم الشركة لا يرى أي شاشة إدارية',
  asCompany.filter((c) => c.to.startsWith('/admin')).map((c) => c.id).join(', '))

const asVisitor = commandsFor({ isPlatformAdmin: false, hasTenant: false })
check(asVisitor.length === 0, 'من بلا حساب شركة لا يرى أوامر الشركة', `${asVisitor.length} أمر`)

const asAdmin = commandsFor({ isPlatformAdmin: true, hasTenant: false })
check(asAdmin.length === COMMANDS.length, 'مدير المنصة يرى كل شي',
  `${asAdmin.length} من ${COMMANDS.length}`)

// ---------------------------------------------------------------------------
// Arabic search actually works
// ---------------------------------------------------------------------------
// The whole reason this was not an off-the-shelf component. Each row is a
// spelling somebody would really type, paired with the command it must find.
console.log('')
const SEARCHES = [
  ['شركه', 'new-company'],       // taa-marbuta dropped
  ['شركة', 'new-company'],
  ['اضافة شركة', 'new-company'],
  ['بلاغ', 'new-report'],         // the word people use, not the screen's name
  ['تقرير', 'new-report'],
  ['اعدادات', 'admin-settings'],  // hamza dropped
  ['إعدادات', 'admin-settings'],
  ['من فعل', 'admin-logs'],
  ['سجل', 'admin-logs'],
  ['اشتراك', 'subscription'],
  ['مراقبة', 'watchlist'],
  ['isic', 'admin-activities'],
  ['audit', 'admin-logs'],
]

const all = commandsFor({ isPlatformAdmin: true, hasTenant: true })
const folded = all.map((c) => ({
  title: fold(c.title),
  hint: fold(c.hint ?? ''),
  keywords: c.keywords.map(fold),
}))

// Same ranking as the component. Duplicated deliberately: a check that imports
// the thing it checks proves only that the code runs.
const rank = (i, q) => {
  const f = folded[i]
  if (f.title === q) return 100
  if (f.title.startsWith(q)) return 90
  if (f.title.includes(q)) return 70
  let best = 0
  for (const k of f.keywords) {
    if (k === q) best = Math.max(best, 85)
    else if (k.startsWith(q)) best = Math.max(best, 65)
    else if (k.includes(q)) best = Math.max(best, 45)
  }
  if (best) return best
  return f.hint.includes(q) ? 30 : 0
}

for (const [term, wantId] of SEARCHES) {
  const q = fold(term)
  const hits = all
    .map((c, i) => ({ c, s: rank(i, q) }))
    .filter((r) => r.s > 0)
    .sort((a, b) => b.s - a.s || a.c.title.localeCompare(b.c.title, 'ar'))

  const found = hits.some((h) => h.c.id === wantId)
  const top = hits[0]?.c.id ?? 'لا شيء'
  check(found, `«${term}» تجد ${wantId}`, `الأول: ${top}`)
}

// Nonsense must find nothing rather than everything.
const junk = all.filter((c, i) => rank(i, fold('زقزقة')) > 0)
check(junk.length === 0, 'بحث بلا معنى لا يعيد نتائج', `${junk.length} نتيجة`)

console.log(failed ? `\n  ❌ ${failed} فحص فشل\n` : '\n  ✅ كل الفحوصات نجحت\n')
process.exit(failed ? 1 : 0)
