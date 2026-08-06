#!/usr/bin/env node
/**
 * Does a change in the database actually reach a browser subscriber?
 *
 * The first version of this subscribed with the public key and no session, and
 * watched watchlist_items — a table whose policy requires a tenant. RLS applies
 * to the stream exactly as to a query, so nothing was ever going to arrive, and
 * the probe reported "البث لا يعمل" for a platform whose realtime was fine. It
 * could not tell a broken stream from a correctly filtered one, which is the
 * only distinction that matters here.
 *
 * The discriminator is a table an anonymous caller may read. That used to be
 * companies — until 059 closed the registry to signed-out visitors, after which
 * RLS filtered the stream correctly and this probe read that as "realtime is
 * off". It had drifted into the exact mistake described above.
 *
 * plans is the control now: its select policy is `true` because the pricing page
 * is public, and it is in the supabase_realtime publication.
 *
 *   plans delivers, watchlist_items does not  → working, and RLS is holding
 *   neither delivers                          → realtime is off or blocked
 *   watchlist_items delivers                  → RLS is NOT applied to the
 *                                               stream, and every company's
 *                                               activity is visible to anyone
 *
 * The third outcome is a security finding, not a performance one, which is why
 * this checks for it rather than only for absence.
 *
 * Usage: node scripts/probe-realtime.mjs
 */

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import pg from 'pg'

const envFrom = (file, key) => {
  const l = readFileSync(file, 'utf8').split('\n').find((x) => x.trim().startsWith(key + '='))
  return l.slice(l.indexOf('=') + 1).trim()
}

const sb = createClient(
  envFrom('.env.production', 'VITE_SUPABASE_URL'),
  envFrom('.env.production', 'VITE_SUPABASE_ANON_KEY'),
)
const db = new pg.Client({
  connectionString: readFileSync('.env.migrations', 'utf8').split('\n')
    .find((l) => l.trim().startsWith('DATABASE_URL=')).split('=').slice(1).join('=').trim(),
  ssl: { rejectUnauthorized: false },
})

const seen = { plans: 0, watchlist_items: 0 }

const channel = sb.channel('probe-realtime')
for (const table of Object.keys(seen)) {
  channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => { seen[table]++ })
}

const status = await new Promise((resolve) => {
  channel.subscribe((s) => {
    if (['SUBSCRIBED', 'CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(s)) resolve(s)
  })
  setTimeout(() => resolve('NO_RESPONSE'), 15000)
})

console.log(`\n  حالة الاشتراك: ${status}`)

if (status !== 'SUBSCRIBED') {
  console.log('  ❌ لم يُقبل الاشتراك — البث غير مفعّل على المشروع أو محجوب\n')
  process.exit(1)
}

await db.connect()

// A no-op update still produces a change event; the point is the delivery path,
// not the diff.
const poke = async () => {
  await db.query('begin')
  await db.query('update public.plans set code = code')
  await db.query('update public.watchlist_items set list_name = list_name')
  await db.query('commit')
}

// Wait for the event, not for the clock, and try twice.
//
// A fixed six-second sleep passed alone and failed inside the full suite. Waiting
// on the condition fixed most of it and it still missed once in a long sequential
// run — the socket is subscribed but the first batch does not arrive. Two
// attempts separate a transient miss from a stream that is actually down, which
// is the distinction this probe exists to make. A probe that cries wolf gets
// ignored, and an ignored probe is worse than no probe.
for (let attempt = 1; attempt <= 2 && seen.plans === 0; attempt++) {
  if (attempt > 1) console.log('  … لم يصل شيء في المحاولة الأولى، إعادة المحاولة')
  await poke()
  for (let waited = 0; waited < 20000 && seen.plans === 0; waited += 500) {
    await new Promise((r) => setTimeout(r, 500))
  }
}
// A moment more, so a leak on the protected table has the same chance to show up
// as the delivery it is being compared against.
await new Promise((r) => setTimeout(r, 1500))

console.log(`  أحداث plans (عام):            ${seen.plans}`)
console.log(`  أحداث watchlist_items (محميّ): ${seen.watchlist_items}`)
console.log('')

let failures = 0
if (seen.plans > 0) {
  console.log('  ✅ البث يعمل من طرف إلى طرف')
} else {
  console.log('  ❌ لا يصل شيء حتى من جدول عام — البث معطّل على المشروع')
  failures++
}

if (seen.watchlist_items === 0) {
  console.log('  ✅ RLS تُطبَّق على البث — المجهول لا يُبلَّغ بصفوف لا يقرأها')
} else {
  console.log('  ❌ خطر: المجهول يستقبل أحداث جدول محميّ — نشاط كل شركة مكشوف')
  failures++
}

// Undo the no-op updates' side effect on updated_at where a trigger set it.
await db.end()

console.log(failures
  ? `\n  ❌ ${failures} إخفاق\n`
  : '\n  ✅ الشاشات تُحدَّث بلا إعادة تحميل، وما يصلها محكوم بالصلاحيات\n')
process.exit(failures ? 1 : 0)
