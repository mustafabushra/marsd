#!/usr/bin/env node
/**
 * Can a company be suspended without saying why, and does the panel see it?
 *
 * Suspension hides a business from the registry. Until 084 it was one click with
 * nothing recorded — no reason, no time, no name — while every lesser action on
 * the platform already required all three. The rule now lives in a trigger, so
 * this checks the trigger rather than the screen: the screen is not the only way
 * to write that column.
 *
 * Runs as the `authenticated` role with a real admin's claims, which is what
 * PostgREST sets up for a signed-in request. Everything is rolled back.
 *
 * Usage: node scripts/probe-company-status.mjs
 */

import { readFileSync } from 'node:fs'
import pg from 'pg'

const url = readFileSync('.env.migrations', 'utf8').split(/\r?\n/)
  .find((l) => l.trim().startsWith('DATABASE_URL=')).split('=').slice(1).join('=').trim()
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await c.connect()

let fail = 0
const ok = (label, pass, note = '') => {
  console.log(`  ${pass ? '✅' : '❌'} ${label}${note ? ' · ' + note : ''}`)
  if (!pass) fail++
}
const q = async (sql, args) => (await c.query(sql, args)).rows

const [admin] = await q("select id, email from public.users where role = 'platform_admin' limit 1")
const [member] = await q(`
  select u.id from public.users u
   where u.role <> 'platform_admin' and u.tenant_id is not null limit 1`)
const [co] = await q("select id, name from public.companies where approved limit 1")

console.log(`\n  ${co.name}\n`)

const as = async (userId, fn) => {
  await c.query('begin')
  await c.query('set local role authenticated')
  await c.query('select set_config($1, $2, true)',
    ['request.jwt.claims', JSON.stringify({ sub: userId, role: 'authenticated' })])
  try { return await fn() } finally { await c.query('rollback') }
}

// Each attempt gets a savepoint: a statement that raises aborts the whole
// transaction, and every check after it would fail with 25P02 rather than with
// its own result.
let sp = 0
const raises = async (sql, args) => {
  const name = `t${++sp}`
  await c.query(`savepoint ${name}`)
  try {
    await c.query(sql, args)
    await c.query(`release savepoint ${name}`)
    return null
  } catch (e) {
    await c.query(`rollback to savepoint ${name}`)
    return e.message.split('\n')[0]
  }
}

// ---- as an admin ----------------------------------------------------------
await as(admin.id, async () => {
  const noReason = await raises(
    "update public.companies set status = 'suspended' where id = $1", [co.id])
  ok('التعليق بلا سبب مرفوض', !!noReason, noReason || 'مرّ!')

  const blank = await raises(
    "update public.companies set status = 'suspended', status_reason = '   ' where id = $1", [co.id])
  ok('سبب من مسافات مرفوض', !!blank, blank || 'مرّ!')

  const good = await raises(
    "update public.companies set status = 'suspended', status_reason = 'فحص آلي' where id = $1", [co.id])
  ok('التعليق بسبب يمرّ', !good, good || '')

  const [row] = await q('select status, status_reason, status_at, status_by from public.companies where id = $1', [co.id])
  ok('يُختم بمن ومتى', row.status_at != null && row.status_by === admin.id,
     `${row.status_by === admin.id ? admin.email : row.status_by}`)

  // The reason must reach the roster, or the panel shows a suspension with no
  // explanation next to it.
  const [r] = await q('select status, status_reason, status_by from public.company_roster() where company_id = $1', [co.id])
  ok('السجلّ يحمل الحالة والسبب', r?.status === 'suspended' && r?.status_reason === 'فحص آلي')
  ok('السجلّ يُظهر بريد من علّق', r?.status_by === admin.email, r?.status_by || '—')

  await c.query("update public.companies set status = 'active' where id = $1", [co.id])
  const [back] = await q('select status, status_reason from public.companies where id = $1', [co.id])
  ok('إعادة التفعيل تمسح السبب', back.status === 'active' && back.status_reason === null,
     back.status_reason || 'فارغ')

  const badValue = await raises(
    "update public.companies set status = 'deleted' where id = $1", [co.id])
  ok('قيمة حالة غير معروفة مرفوضة', !!badValue, badValue || 'مرّ!')
})

// ---- as an ordinary company member ---------------------------------------
if (member) {
  await as(member.id, async () => {
    const denied = await raises(
      "update public.companies set status = 'suspended', status_reason = 'محاولة' where id = $1", [co.id])
    const [row] = await q('select status from public.companies where id = $1', [co.id])
    // Either the guard raised, or RLS matched no row — both mean it did not happen.
    ok('عضو شركة لا يستطيع التعليق', !!denied || row.status !== 'suspended',
       denied ? '' : 'لم يُرفع خطأ لكن لم يتغيّر شيء')
  })
} else {
  ok('عضو شركة لا يستطيع التعليق', false, 'لا يوجد مستخدم غير إداري للفحص')
}

// ---- and the registry is still readable -----------------------------------
await as(admin.id, async () => {
  const rows = await q('select * from public.company_roster()')
  const [{ n }] = await q('select count(*)::int as n from public.companies')
  ok('السجلّ يعيد كل الشركات', rows.length === n, `${rows.length} من ${n}`)
  ok('كل صف له حالة', rows.every((r) => !!r.status))
})

console.log(fail ? `\n  ❌ ${fail} فحص فشل\n` : '\n  ✅ التعليق محاسَب عليه في القاعدة نفسها\n')
await c.end()
process.exit(fail ? 1 : 0)
