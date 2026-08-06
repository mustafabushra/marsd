#!/usr/bin/env node
/**
 * Can a reporter hand over the evidence they signed for, and does it reach only
 * the people it should?
 *
 * The declaration reads «وأن لديّ مستندات تثبتها، وأتحمل المسؤولية القانونية».
 * `report_documents` was empty, no screen wrote to it, and there was no bucket
 * for the files — so the reporter accepted legal responsibility for proof the
 * product would not take, and the reviewer decided on an accusation with the
 * accuser's proof out of reach.
 *
 * The privacy boundary is the part that matters most. Migration 107 removed the
 * reporter's name from the timeline because a platform whose reporters can be
 * identified stops receiving honest reports. An invoice carries a letterhead and
 * a contract carries signatures, so an attachment reaching the reported company
 * undoes 107 through the file instead of through the field. That is asserted
 * here from four directions.
 *
 * Everything runs under real JWT claims inside a transaction that is rolled
 * back.
 *
 *   node scripts/probe-report-evidence.mjs
 */

import { readFileSync } from 'node:fs'
import pg from 'pg'

const url = readFileSync('.env.migrations', 'utf8').split(/\r?\n/)
  .find((l) => l.trim().startsWith('DATABASE_URL='))?.split('=').slice(1).join('=').trim()

const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await c.connect()

let failed = 0
const ok = (good, name, detail = '') => {
  console.log(`  ${good ? '✅' : '❌'} ${name}${detail ? ` · ${detail}` : ''}`)
  if (!good) failed++
}
const one = async (sql, p = []) => (await c.query(sql, p)).rows[0]
const claims = (id) => c.query('select set_config($1,$2,true)',
  ['request.jwt.claims', id ? JSON.stringify({ sub: id, role: 'authenticated' }) : ''])
const count = async (reportId) =>
  Number((await one('select count(*)::int n from public.report_attachments($1)', [reportId])).n)

const reporter = await one(`select u.id, u.tenant_id from public.users u
  where u.role in ('company_admin','company_member') and u.tenant_id is not null limit 1`)
const admin = await one("select id from public.users where role = 'platform_admin' limit 1")
const target = await one('select id, name from public.companies limit 1')

if (!reporter || !target) { console.log('  ⚠️  لا بيانات كافية — لا يمكن الفحص'); process.exit(0) }

// Someone from a *different* tenant. This is the case that would undo 107, so
// it is stated rather than hoped for: if there is nobody, the check says so
// instead of passing quietly.
const outsider = await one(`select u.id from public.users u
  where u.tenant_id is distinct from $1 and u.role in ('company_admin','company_member')
  limit 1`, [reporter.tenant_id])

console.log(`\n  المُبلِّغ: ${reporter.id}\n  الشركة المُبلَّغ عنها: ${target.name}\n`)

await c.query('begin')
try {
  // ---- the bucket exists, and is private ----------------------------------
  const bucket = await one("select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'report-documents'")
  ok(!!bucket, 'حاوية مرفقات التقارير موجودة')
  ok(bucket && bucket.public === false, 'وهي خاصة لا عامة',
    bucket?.public ? '⛔ عامة — أي رابط يفتحها' : '')
  ok(Number(bucket?.file_size_limit) > 0, 'ولها حد لحجم الملف',
    `${Math.round(Number(bucket?.file_size_limit) / 1024 / 1024)} م.ب`)
  ok((bucket?.allowed_mime_types || []).length > 0, 'وأنواع محدّدة',
    (bucket?.allowed_mime_types || []).join('، '))

  // ---- a report with evidence ---------------------------------------------
  const report = await one(`insert into public.reports
      (reporter_tenant_id, target_company_id, status, dealt_at, payment_commitment, delay_days)
    values ($1, $2, 'draft', now(), 'full', 0) returning id`, [reporter.tenant_id, target.id])

  await c.query('set local role authenticated')
  await claims(reporter.id)

  // The reporter attaches it, under their own session — this is the INSERT
  // policy doing the work, not the migration role.
  let attached = 0
  try {
    const r = await c.query(`insert into public.report_documents
        (report_id, s3_key, file_name, mime_type, file_size, uploaded_by)
      values ($1, $2, 'contract.pdf', 'application/pdf', 4096, $3) returning id`,
    [report.id, `${report.id}/probe-contract.pdf`, reporter.id])
    attached = r.rowCount
  } catch (e) {
    ok(false, 'المُبلِّغ يرفق مستنداً بتقريره', e.message.split('\n')[0].slice(0, 70))
  }
  if (attached) ok(true, 'المُبلِّغ يرفق مستنداً بتقريره')

  ok(await count(report.id) === 1, 'ويقرأ مرفقه')

  // ---- Marsad sees it ------------------------------------------------------
  if (admin) {
    await claims(admin.id)
    ok(await count(report.id) === 1, 'وإدارة مرصد تراه — وإلا فالمراجعة بلا دليل')
  }

  // ---- and nobody else -----------------------------------------------------
  if (outsider) {
    await claims(outsider.id)
    ok(await count(report.id) === 0, 'وشركة أخرى لا تراه',
      'المرفق يحمل هوية المُبلِّغ — كشفه يُبطل الترحيل 107')

    // Not only through the function: the table itself must refuse.
    const direct = await one(
      'select count(*)::int n from public.report_documents where report_id = $1', [report.id])
    ok(Number(direct.n) === 0, 'ولا تراه بالقراءة المباشرة من الجدول',
      Number(direct.n) ? `⛔ ${direct.n} صف` : '')
  } else {
    console.log('  ⏭  لا مستخدم من كيان آخر — حدّ الخصوصية لم يُختبر')
    failed++
  }

  // ---- no session at all ---------------------------------------------------
  await claims(null)
  ok(await count(report.id) === 0, 'وبلا جلسة لا شيء')

  // ---- evidence cannot be withdrawn after submission -----------------------
  // Once Marsad is judging it, proof that can vanish is not proof.
  await c.query('reset role')
  await c.query("update public.reports set status = 'pending_review' where id = $1", [report.id])
  await c.query('set local role authenticated')
  await claims(reporter.id)
  const gone = await c.query('delete from public.report_documents where report_id = $1', [report.id])
  ok(gone.rowCount === 0, 'والمُبلِّغ لا يسحب دليله بعد الإرسال',
    gone.rowCount ? '⛔ حُذف' : '')
} finally {
  await c.query('rollback').catch(() => {})
  await c.end()
}

console.log(failed ? `\n  ❌ ${failed} فحص فشل\n` : '\n  ✅ كل الفحوصات نجحت\n')
process.exit(failed ? 1 : 0)
