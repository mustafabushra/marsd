#!/usr/bin/env node
/**
 * Can a company actually save its own profile?
 *
 * /profile renders every field of the company record as an editable form and a
 * green "حفظ التغييرات" button. The button reports success whenever the request
 * does not error — and a row that RLS filters out of an UPDATE does not error, it
 * simply matches nothing. So the answer cannot be read off the screen, and it
 * cannot be read off the policy text either, because the policy that matters is
 * whichever one the database applies to that exact row for that exact caller.
 *
 * This asks the database, as the user, and then reads the row back.
 *
 * Usage: node scripts/probe-profile-save.mjs <email>
 */

import { readFileSync } from 'node:fs'
import pg from 'pg'

const email = process.argv[2]
if (!email) { console.error('  الاستخدام: node scripts/probe-profile-save.mjs <email>'); process.exit(1) }

const url = readFileSync('.env.migrations', 'utf8').split('\n')
  .find((l) => l.trim().startsWith('DATABASE_URL=')).split('=').slice(1).join('=').trim()
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await c.connect()

const { rows: [u] } = await c.query(
  `select u.id, u.role, u.tenant_id, t.name as tenant, t.company_id, co.name as company
     from public.users u
     left join public.tenants t on t.id = u.tenant_id
     left join public.companies co on co.id = t.company_id
    where lower(u.email) = lower($1)`, [email])

if (!u) { console.error(`  لا يوجد مستخدم: ${email}`); await c.end(); process.exit(1) }

console.log(`\n  ${email}  ·  ${u.role}`)
console.log(`  الكيان: ${u.tenant || '—'}`)
console.log(`  الشركة المرتبطة: ${u.company || '—'} (${u.company_id || 'لا يوجد'})\n`)

if (!u.company_id) {
  console.log('  ⛔ لا توجد شركة مرتبطة بالكيان — صفحة الملف تعرض "لا توجد شركة مرتبطة بحسابك".\n')
  await c.end()
  process.exit(0)
}

const marker = `probe-${Date.now()}`

await c.query('begin')
await c.query('set local role authenticated')
await c.query('select set_config($1, $2, true)', ['request.jwt.claims',
  JSON.stringify({ sub: u.id, role: 'authenticated' })])

// Exactly what handleSave sends: an UPDATE keyed on the company id.
const { rowCount } = await c.query(
  'update public.companies set name_en = $1 where id = $2', [marker, u.company_id])

console.log(`  UPDATE companies …  →  ${rowCount} صف`)
console.log(`  ${rowCount > 0 ? '✅' : '⛔'} ${rowCount > 0 ? 'الحفظ يصل فعلاً' : 'الحفظ لا يغيّر شيئاً — والواجهة تقول "تم الحفظ"'}`)

// Read it back over the same session; absence of an error proves nothing.
const { rows: [after] } = await c.query('select name_en from public.companies where id = $1', [u.company_id])
console.log(`  القراءة بعد الكتابة: name_en = ${after?.name_en === marker ? `"${marker}" ✅` : `${JSON.stringify(after?.name_en)} ⛔`}`)

// The columns the form shows as read-only text. The form is not the enforcement
// point — anything holding a session token can send whatever columns it likes.
const mustRefuse = async (label, sql) => {
  await c.query('savepoint s')
  try {
    const { rowCount } = await c.query(sql)
    console.log(`  ${rowCount > 0 ? '⛔' : '✅'} ${label}: ${rowCount} صف${rowCount > 0 ? '  ← مسموح وما كان المفروض' : ' (مرفوض)'}`)
  } catch (e) {
    console.log(`  ✅ ${label}: مرفوض — ${e.message.split('\n')[0]}`)
  }
  await c.query('rollback to savepoint s')
}

console.log('')
await mustRefuse('يمنح شركته توثيقاً', `update public.companies set verified = true where id = '${u.company_id}'`)
await mustRefuse('يغيّر اسم الشركة',   `update public.companies set name = 'x' where id = '${u.company_id}'`)
await mustRefuse('يغيّر السجل التجاري', `update public.companies set cr_number = '9999999999' where id = '${u.company_id}'`)
await mustRefuse('يعدّل شركة أخرى',    `update public.companies set name_en = 'x' where id <> '${u.company_id}'`)

await c.query('rollback')

// Nothing was kept: the whole probe ran inside a transaction that is now undone.
const { rows: [check] } = await c.query('select name_en from public.companies where id = $1', [u.company_id])
console.log(`\n  بعد التراجع: name_en = ${JSON.stringify(check?.name_en)}  (لم يتغيّر شيء)\n`)

await c.end()
