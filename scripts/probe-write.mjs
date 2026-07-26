#!/usr/bin/env node
/**
 * Does a write through the anon key actually change anything?
 *
 * PostgREST answers an UPDATE that row-level security filtered down to nothing
 * with success and an empty result, not an error. A check that only looks at
 * `error` therefore reports a write as having worked when nothing was written —
 * which is how the admin settings page came to be called functional.
 *
 * This writes, reads back, and restores.
 */

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = (k) => {
  const l = readFileSync('.env.production', 'utf8').split('\n').find((x) => x.trim().startsWith(k + '='))
  return l.slice(l.indexOf('=') + 1).trim()
}
const supabase = createClient(env('VITE_SUPABASE_URL'), env('VITE_SUPABASE_ANON_KEY'))

const probe = async (table, keyCol, keyVal, col, mutate) => {
  const { data: before } = await supabase.from(table).select(col).eq(keyCol, keyVal).maybeSingle()
  if (!before) { console.log(`  SKIP  ${table} — لا صف للاختبار`); return }

  const original = before[col]
  const changed = mutate(original)

  const { error } = await supabase.from(table).update({ [col]: changed }).eq(keyCol, keyVal)
  const { data: after } = await supabase.from(table).select(col).eq(keyCol, keyVal).maybeSingle()

  const actuallyChanged = JSON.stringify(after?.[col]) !== JSON.stringify(original)

  if (actuallyChanged) {
    await supabase.from(table).update({ [col]: original }).eq(keyCol, keyVal)
    console.log(`  WROTE   ${table}.${col}  — الكتابة نفذت فعلاً (أُعيدت القيمة)`)
  } else {
    console.log(`  BLOCKED ${table}.${col}  — ${error ? 'رُفضت: ' + error.message : 'قُبلت ظاهرياً ولم تُغيّر شيئاً'}`)
  }
}

console.log('\n  ما الذي يستطيع مفتاح المتصفح كتابته فعلاً:\n')

await probe('system_settings', 'key', 'entitlements_enforcement', 'value', (v) => ({ ...v, __probe: Date.now() }))

const { data: plan } = await supabase.from('plans').select('id').eq('code', 'free').maybeSingle()
if (plan) await probe('plans', 'id', plan.id, 'sort_order', (v) => (Number(v) || 0) + 100)

const { data: t } = await supabase.from('tenants').select('id').limit(1).maybeSingle()
if (t) await probe('tenants', 'id', t.id, 'city', (v) => (v === 'PROBE' ? 'PROBE2' : 'PROBE'))

// The one that matters most: can a browser mint itself credits?
const { data: tenantRow } = await supabase.from('tenants').select('id').limit(1).maybeSingle()
if (tenantRow) {
  const ins = await supabase.from('credits_ledger').insert([{ tenant_id: tenantRow.id, amount: 9999, reason: 'admin_adjustment' }]).select('id').maybeSingle()
  if (ins.data?.id) {
    await supabase.from('credits_ledger').delete().eq('id', ins.data.id)
    console.log('  WROTE   credits_ledger — متصفح يستطيع منح نفسه رصيداً (حُذف الصف)')
  } else {
    console.log(`  BLOCKED credits_ledger — ${ins.error ? ins.error.message : 'لم يُنشأ صف'}`)
  }
}

console.log('')
