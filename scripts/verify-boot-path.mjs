#!/usr/bin/env node
/**
 * How many things happen, one after another, before a signed-in person sees
 * their dashboard?
 *
 * The answer was four, and the fourth could not start until the third finished:
 *
 *   1. Clerk answers
 *   2. useUserRole          → select role      from users where id = …
 *   3. useCompanyOnboarding → select tenant_id from users where id = …
 *   4. useEntitlements      → rpc my_entitlements
 *
 * Steps 2 and 3 read the same row of the same table as two separate round
 * trips. Each had its own loading gate, so each blanked the screen in turn —
 * the wait after signing in was not one slow query but four fast ones queued
 * behind each other, with three placeholders flashing through it.
 *
 * None of that shows up in a test of any single piece. It is a property of how
 * the pieces are arranged, so it is checked by reading the arrangement.
 *
 *   node scripts/verify-boot-path.mjs
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

let failed = 0
const check = (ok, name, detail = '') => {
  console.log(`  ${ok ? '✅' : '❌'} ${name}${ok ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.jsx?$/.test(e)) out.push(p.replace(/\\/g, '/'))
  }
  return out
}

// ---------------------------------------------------------------------------
// One read of the user's row
// ---------------------------------------------------------------------------
// Every hook that needs `role` or `tenant_id` must go through useUserRecord.
// A second direct query is a second round trip on every protected screen.
// Only the hooks that mount on the way to a dashboard. useUserTenant and
// useSystemStatus read the same row too, and folding them in would save another
// round trip — but they are not on this path, so making them fail this check
// would report a backlog as a defect on every run, and a check that always
// fails is one nobody reads.
const BOOT_HOOKS = [
  'src/hooks/useUserRole.js',
  'src/hooks/useCompanyOnboarding.js',
  'src/hooks/useCompanyStatus.js',
]

const offenders = []
for (const f of BOOT_HOOKS) {
  const src = readFileSync(f, 'utf8')
  if (/from\(\s*['"]users['"]\s*\)[\s\S]{0,120}?select\(\s*['"][^'"]*\b(role|tenant_id)\b/.test(src)) {
    offenders.push(f)
  }
}
check(offenders.length === 0, 'صف المستخدم يُقرأ مرة واحدة على مسار الدخول',
  offenders.join('، '))

// Reported, not failed.
const later = walk('src/hooks').filter((f) =>
  !BOOT_HOOKS.includes(f) && !f.endsWith('useUserRecord.js')
  && /from\(\s*['"]users['"]\s*\)[\s\S]{0,120}?select\(\s*['"][^'"]*\btenant_id\b/.test(f && readFileSync(f, 'utf8')))
if (later.length) {
  console.log(`     ⓘ خارج مسار الدخول ويقرأ الصف نفسه: ${later.map((f) => f.split('/').pop()).join('، ')}`)
}

// ---------------------------------------------------------------------------
// The shell must survive navigation
// ---------------------------------------------------------------------------
// A Suspense boundary around <Routes> takes the sidebar and the header down
// with the page: every navigation blanks the whole window and rebuilds it,
// which reads as a full reload between two screens that share their chrome.
const app = readFileSync('src/App.jsx', 'utf8').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
// Not `<Suspense[^>]*>`: the fallback holds JSX, so the first `>` it meets
// belongs to a component inside the attribute rather than to the tag. Match the
// pair loosely and let the distance between them carry the meaning.
const boundaryAroundRoutes = /<Suspense[\s\S]{0,400}?<Routes>/.test(app)
check(boundaryAroundRoutes, 'حدّ Suspense الخارجي موجود للصفحات بلا قشرة')

for (const shell of ['src/components/CompanyShell.jsx', 'src/components/AdminShell.jsx']) {
  const src = readFileSync(shell, 'utf8')
  const inMain = /<main[\s\S]{0,400}?<Suspense[\s\S]{0,300}?<Outlet/.test(src)
  check(inMain, `${shell.split('/').pop()} يحمل حدّ Suspense داخل <main>`,
    'بدونه يختفي الشريط الجانبي والرأس عند كل تنقّل')
}

// ---------------------------------------------------------------------------
// No skeleton without a delay
// ---------------------------------------------------------------------------
// Most navigations finish in well under a fifth of a second. A skeleton shown
// for eighty milliseconds is not a loading state, it is a flash — and a flash
// reads as something breaking, which is precisely what made the product feel
// unfinished once skeletons went in.
const files = walk('src')
const bare = []
for (const f of files) {
  if (/Skeleton\.jsx|DeferredSkeleton\.jsx/.test(f)) continue
  const src = readFileSync(f, 'utf8')
  for (const m of src.matchAll(/fallback=\{([^}]*)\}/g)) {
    if (/Skeleton/.test(m[1]) && !/DeferredSkeleton/.test(m[1])) bare.push(f)
  }
}
check(bare.length === 0, 'كل هيكل تحميل يمرّ عبر DeferredSkeleton',
  [...new Set(bare)].join('، '))

const deferred = readFileSync('src/components/DeferredSkeleton.jsx', 'utf8')
const delay = Number(/delay\s*=\s*(\d+)/.exec(deferred)?.[1])
check(delay >= 150 && delay <= 400, 'مهلة الظهور بين 150 و 400 مللي',
  `هي ${delay} — الأقصر يومض، والأطول يبدو تعليقاً`)
check(/minVisible/.test(deferred), 'للهيكل حدّ أدنى للبقاء بعد ظهوره',
  'هيكل يظهر ثم يختفي فوراً هو نفس الوميض في موضع آخر')

console.log(failed ? `\n  ❌ ${failed} فحص فشل\n` : '\n  ✅ كل الفحوصات نجحت\n')
process.exit(failed ? 1 : 0)
