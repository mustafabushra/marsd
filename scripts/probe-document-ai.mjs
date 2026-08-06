#!/usr/bin/env node
/**
 * Does document reading actually work in production, end to end?
 *
 * Every other check in this suite stops at the edge of the deployed function.
 * This one goes through it: a real Clerk token, the real quota row, the real
 * provider, the real key. It is the only way to answer the two questions the
 * local checks cannot — whether the model named in system_settings exists on
 * the account, and whether a request shaped the way the browser shapes it comes
 * back as fields rather than an error.
 *
 * It borrows an existing session rather than creating one, so it observes the
 * system instead of changing it. If nobody is signed in there is no session to
 * borrow, and the probe says so rather than inventing a user.
 *
 * Note: a successful run spends one of that user's 40 daily reads. That is the
 * cost of testing the real path, and it is the point.
 *
 *   node scripts/probe-document-ai.mjs
 */

import { readFileSync } from 'node:fs'
import pg from 'pg'

const BASE = process.env.MARSAD_URL || 'https://marsd-peach.vercel.app'

const readEnv = (file, key) => {
  try {
    const line = readFileSync(file, 'utf8').split(/\r?\n/)
      .find((l) => l.trim().startsWith(key + '='))
    return line
      ? line.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '').replace(/^﻿/, '')
      : null
  } catch { return null }
}

const CLERK = ['.env.clerk', '.env.production', '.env.local', '.env']
  .map((f) => readEnv(f, 'CLERK_SECRET_KEY')).find(Boolean)
if (!CLERK) { console.error('  ❌ لم أجد CLERK_SECRET_KEY محلياً'); process.exit(1) }

const DB = readEnv('.env.migrations', 'DATABASE_URL')
if (!DB) { console.error('  ❌ لم أجد DATABASE_URL في .env.migrations'); process.exit(1) }

// --- what the dashboard says the model is -----------------------------------
const c = new pg.Client({ connectionString: DB, ssl: { rejectUnauthorized: false } })
await c.connect()

const { rows: [cfg] } = await c.query(
  `select value ->> 'model' as model,
          (value ->> 'enabled')::boolean as enabled,
          (value ->> 'per_user_daily')::int as cap
     from public.system_settings where key = 'document_ai'`)

console.log(`  الإعدادات: الموديل «${cfg?.model}» · مُفعّل=${cfg?.enabled} · الحد=${cfg?.cap}`)

// A paused feature is a decision, not a fault. The probe still confirms the
// switch actually closes the endpoint — an off switch nobody tests is an off
// switch nobody can rely on — and then stops, rather than reporting the
// intended state as a failure every time the suite runs.
if (!cfg?.enabled) {
  const r = await fetch(`${BASE}/api/extract-document`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ doc_type: 'auto', images: [] }),
  })
  console.log(r.status === 401
    ? '  ✅ الميزة موقوفة عمداً، والخدمة ما زالت تطلب المصادقة'
    : `  ❌ الخدمة ردّت ${r.status} على طلب بلا توكن`)
  await c.end()
  process.exit(r.status === 401 ? 0 : 1)
}

const { rows: users } = await c.query(
  `select id, email from public.users where tenant_id is not null limit 20`)
await c.end()

if (!users.length) { console.error('  ❌ لا مستخدمين'); process.exit(1) }

// --- borrow a live session --------------------------------------------------
const clerk = async (path, init = {}) => {
  const r = await fetch(`https://api.clerk.com/v1${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${CLERK}`, 'Content-Type': 'application/json', ...init.headers },
  })
  return { status: r.status, body: await r.json().catch(() => null) }
}

let token = null
let who = null
for (const u of users) {
  const s = await clerk(`/sessions?user_id=${encodeURIComponent(u.id)}&status=active&limit=1`)
  const sess = Array.isArray(s.body) ? s.body[0] : s.body?.data?.[0]
  if (!sess) continue
  const t = await clerk(`/sessions/${sess.id}/tokens`, { method: 'POST', body: '{}' })
  if (t.body?.jwt) { token = t.body.jwt; who = u.email; break }
}

if (!token) {
  console.log('  ⚠️  لا توجد جلسة نشطة لأي مستخدم — لا يمكن إصدار توكن.')
  console.log('     سجّل الدخول في المتصفح مرة واحدة ثم أعد تشغيل الفحص.')
  process.exit(2)
}
console.log(`  🔑 توكن باسم: ${who}`)

// --- the request the browser would send -------------------------------------
// A rendered commercial registration whose every value is known here. That is
// the whole reason it is synthetic rather than a real scan: "did it read this
// correctly" has to be a fact, not an impression, and a real certificate has no
// answer key. The values are the ones the owner supplied as a live example.
const EXPECTED = {
  company_name_ar: 'مجموعة ظهران التجارية شركة شخص واحد',
  commercial_registration: '4030304834',
  unified_number: '7004309873',
  status: 'نشط',
  entity_type: 'شركة ذات مسؤولية محدودة',
  registration_date: '2018-06-06',
  annual_confirmation_date: '2027-04-03',
  capital: '50000',
  city: 'جدة',
  national_address: 'حي الأندلس',
  phone: '00966555000142',
  email: 'ibraheem.m.almahdi@gmail.com',
}

const fixture = new URL('./fixtures/mock-cr.jpg', import.meta.url)
const image = readFileSync(fixture).toString('base64')
console.log(`  📄 صورة الاختبار: ${Math.round(image.length / 1024)} كيلو base64`)

console.log(`  → POST ${BASE}/api/extract-document`)
const t0 = Date.now()
const r = await fetch(`${BASE}/api/extract-document`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({
    doc_type: 'commercial_registration',
    images: [{ media_type: 'image/jpeg', data: image }],
  }),
})
const ms = Date.now() - t0
const body = await r.json().catch(() => null)

console.log(`  الحالة: ${r.status} (${ms}ms)`)

if (r.status === 200) {
  const e = body.extraction || {}
  console.log(`  ✅ المسار كامل يعمل — الموديل «${body.model}» · متبقٍ ${body.remaining}\n`)

  // Whitespace and the Arabic comma are formatting, not reading. Everything
  // else is compared exactly: a certificate is copied, not paraphrased.
  const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()

  let right = 0
  let wrong = 0
  const bad = []
  for (const [k, want] of Object.entries(EXPECTED)) {
    const got = e[k]?.value
    const ok = norm(got) === norm(want)
    if (ok) right++; else { wrong++; bad.push([k, want, got ?? '(لم يُستخرج)']) }
    const conf = e[k] ? ` [${Math.round(e[k].confidence * 100)}%]` : ''
    console.log(`    ${ok ? '✅' : '❌'} ${k}${conf}`)
  }

  if (bad.length) {
    console.log('\n  الفروقات:')
    for (const [k, want, got] of bad) {
      console.log(`    ${k}\n      المتوقع: ${want}\n      المقروء: ${got}`)
    }
  }

  const pct = Math.round((right / (right + wrong)) * 100)
  console.log(`\n  الدقة: ${right}/${right + wrong} = ${pct}%`)
  console.log(`  الأنشطة: ${e.sub_activities?.length ?? 0}/4 · المديرون: ${e.managers?.length ?? 0}/1`)
  if (e.notes) console.log(`  ملاحظة الموديل: ${e.notes}`)

  // A reader that gets less than four fields in five right is not usable for a
  // registry people will trust, and passing it would be the report lying.
  process.exit(pct >= 80 ? 0 : 1)
}

console.log(`  الرسالة: ${body?.error || JSON.stringify(body)?.slice(0, 300)}`)
if (/غير متاح/.test(body?.error || '')) {
  console.log('  ❌ الموديل المذكور في الإعدادات غير موجود على حساب Groq — عدّله من لوحة التحكم.')
} else if (r.status === 429) {
  console.log('  ⚠️  الحد اليومي أو ازدحام — ليس عطلاً في الكود.')
} else {
  console.log('  ❌ فشل غير متوقّع.')
}
process.exit(1)
