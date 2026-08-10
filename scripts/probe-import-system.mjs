#!/usr/bin/env node
/**
 * An import that stops must not become the register.
 *
 * 503 rows arrived from an upload that died and silently became «the
 * commercial register» — no error, no partial flag, nothing to notice. The
 * rows were all valid. That is the whole problem: nothing was wrong with the
 * data, so nothing could tell that 1.9 million companies were missing.
 *
 * This drives the lifecycle against synthetic generations: the ceilings that
 * mean a spreadsheet ate the file, a load whose numbers do not add up, the
 * gate that keeps an unpublished generation invisible, rollback, retry, and
 * the generation-to-generation diff.
 *
 * It publishes and rolls back real datasets, so the live pointer is saved at
 * the start and restored at the end — a test that leaves production pointing
 * somewhere else has broken the thing it was checking.
 *
 *   node scripts/probe-import-system.mjs
 */

import pg from 'pg'
import { readFileSync } from 'node:fs'

const url = readFileSync('.env.migrations', 'utf8').split(/\r?\n/)
  .find((l) => l.trim().startsWith('DATABASE_URL='))?.split('=').slice(1).join('=').trim()
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await db.connect()

let pass = 0
let fail = 0
const ok = (n, c, d = '') => {
  if (c) { pass += 1; console.log(`  ✅ ${n}`) }
  else { fail += 1; console.log(`  ❌ ${n}${d ? ` — ${d}` : ''}`) }
}

const HEADER = ['unified_number', 'cr_number', 'name', 'registration_type',
  'legal_entity', 'legal_entity_2', 'capital', 'region', 'city', 'registration_date']

let admin
let livePointer = null
const jobs = []

const as = (id) => db.query(`select set_config('request.jwt.claims', $1, true)`,
  [JSON.stringify({ sub: id, role: 'authenticated' })])

/** Run one statement as somebody; return its error message or null. */
async function run (actor, sql, params = []) {
  await db.query('begin'); await as(actor)
  try {
    const { rows } = await db.query(sql, params)
    await db.query('commit')
    return { ok: true, rows }
  } catch (e) {
    await db.query('rollback')
    return { ok: false, message: e.message }
  }
}

/** Load n synthetic rows into a dataset, as the streaming loader would. */
async function load (datasetId, rows) {
  for (const r of rows) {
    await db.query(
      `insert into public.government_company_registry
         (dataset_id, snapshot_period, snapshot_at, unified_number, cr_number, name,
          registration_type, legal_entity, capital, region, city, registration_date, source)
       values ($1,'فحص',current_date,$2,$3,$4,'رئيسي','شركة',$5,'منطقة الرياض','الرياض','2020-01-01','probe')`,
      [datasetId, `7${r.cr}`, r.cr, r.name, r.capital ?? 100000])
  }
}

// Registration numbers are digits. The first version of this generator used a
// letter prefix and `import_job_verify` refused all of them — correctly, which
// is the check doing its job on the fixture instead of on the code.
const gen = (prefix, n, from = 0) => Array.from({ length: n }, (_, i) => ({
  cr: `${prefix}${String(from + i).padStart(5, '0')}`,
  name: `شركة فحص ${prefix}-${from + i}`,
}))
const G1 = '91'
const G2 = '92'

try {
  ;({ rows: [admin] } = await db.query(
    `select id from public.users where role = 'platform_admin' order by created_at limit 1`))

  const { rows: [p] } = await db.query(
    `select value #>> '{}' v from public.system_settings where key = 'published_registry_dataset'`)
  livePointer = p?.v || null
  console.log(`  (المجموعة المنشورة قبل الفحص: ${livePointer})`)

  // ===== 1. The spreadsheet ceilings =====
  for (const rows of [1048576, 1048575, 65536, 65535]) {
    const s = await run(admin.id,
      `select * from public.import_job_start('ceiling.csv', 1000, $1, 'فحص', current_date)`, [rows])
    if (!s.ok) { ok(`سقف ${rows} يُرفض`, false, s.message?.slice(0, 70)); continue }
    const job = s.rows[0].job_id
    jobs.push(job)
    const v = await run(admin.id,
      'select public.import_job_validate($1, $2, true) r', [job, HEADER])
    const res = v.rows?.[0]?.r
    ok(`سقف ${rows} يُرفض عند التحقّق`, res?.ok === false && /سقف Excel/.test(JSON.stringify(res)),
      JSON.stringify(res?.checks?.find?.((c) => c.key === 'ceiling'))?.slice(0, 90))
    await run(admin.id, 'select public.import_job_cancel($1, $2)', [job, 'فحص'])
  }

  // ===== 2. A header that moved =====
  const s2 = await run(admin.id,
    `select * from public.import_job_start('bad-header.csv', 1000, 10, 'فحص', current_date)`)
  const job2 = s2.rows[0].job_id
  jobs.push(job2)
  const v2 = await run(admin.id, 'select public.import_job_validate($1, $2, true) r',
    [job2, ['cr_number', 'unified_number', ...HEADER.slice(2)]])
  ok('ترويسة مبدَّلة الأعمدة تُرفض', v2.rows[0].r.ok === false,
    JSON.stringify(v2.rows[0].r?.reason)?.slice(0, 80))
  await run(admin.id, 'select public.import_job_cancel($1, $2)', [job2, 'فحص'])

  // ===== 3. A file cut mid-line =====
  const s3 = await run(admin.id,
    `select * from public.import_job_start('cut.csv', 1000, 10, 'فحص', current_date)`)
  const job3 = s3.rows[0].job_id
  jobs.push(job3)
  const v3 = await run(admin.id, 'select public.import_job_validate($1, $2, false) r', [job3, HEADER])
  ok('ملف مقطوع في منتصف سطر يُرفض', v3.rows[0].r.ok === false)
  await run(admin.id, 'select public.import_job_cancel($1, $2)', [job3, 'فحص'])

  // ===== 4. Numbers that do not add up =====
  const s4 = await run(admin.id,
    `select * from public.import_job_start('short.csv', 1000, 100, 'فحص', current_date)`)
  const job4 = s4.rows[0].job_id
  const ds4 = s4.rows[0].dataset_id
  jobs.push(job4)
  await run(admin.id, 'select public.import_job_validate($1, $2, true)', [job4, HEADER])
  await load(ds4, gen('90', 40))                       // 40 loaded of 100 expected
  await run(admin.id, 'select public.import_job_finish_load($1)', [job4])
  const v4 = await run(admin.id, 'select public.import_job_verify($1) r', [job4])
  ok('تحميل ناقص لا يجتاز الفحص', v4.rows[0].r.ok === false,
    JSON.stringify(v4.rows[0].r.checks?.find((c) => c.key === 'accounted'))?.slice(0, 100))

  const pub4 = await run(admin.id, 'select public.import_job_publish($1)', [job4])
  ok('ولا يمكن نشره', pub4.ok === false && /لا تُنشر إلا بعد اجتياز الفحص/.test(pub4.message || ''),
    pub4.message?.slice(0, 80))

  const seen4 = await run(admin.id,
    `select count(*)::int n from public.search_companies_unified($1, 50)`, ['شركة فحص 90-'])
  ok('ومجموعته غير مرئية في البحث', seen4.rows[0].n === 0, `${seen4.rows[0].n} نتيجة`)
  await run(admin.id, 'select public.import_job_cancel($1, $2)', [job4, 'ناقص'])

  const { rows: [gone] } = await db.query(
    'select count(*)::int n from public.government_company_registry where dataset_id = $1', [ds4])
  ok('والإلغاء يمسح صفوفه غير المنشورة', gone.n === 0, `${gone.n} صفّاً باقياً`)

  const { rows: [kept] } = await db.query(
    'select status, rows_loaded, expected_rows from public.import_jobs where id = $1', [job4])
  ok('ويبقى سجلّ المهمّة نفسه', kept.status === 'cancelled' && Number(kept.rows_loaded) === 40,
    JSON.stringify(kept))

  // ===== 5. A generation that adds up, published =====
  const s5 = await run(admin.id,
    `select * from public.import_job_start('gen1.csv', 5000, 22, 'الربع الأول فحص', current_date)`)
  const job5 = s5.rows[0].job_id
  const ds5 = s5.rows[0].dataset_id
  jobs.push(job5)
  await run(admin.id, 'select public.import_job_validate($1, $2, true)', [job5, HEADER])
  await load(ds5, gen(G1, 20))
  await run(admin.id, 'select public.import_job_reject_row($1, 21, $2, $3, $4)',
    [job5, 'B99999', 'رقم سجل غير صالح', 'raw'])
  await run(admin.id, 'select public.import_job_reject_row($1, 22, $2, $3, $4)',
    [job5, 'B99998', 'اسم فارغ', 'raw'])
  await run(admin.id, 'select public.import_job_finish_load($1)', [job5])

  const v5 = await run(admin.id, 'select public.import_job_verify($1) r', [job5])
  ok('٢٠ محمّل + ٢ مرفوض = ٢٢ متوقّع يجتاز', v5.rows[0].r.ok === true,
    JSON.stringify(v5.rows[0].r.checks?.filter((c) => !c.ok))?.slice(0, 120))

  const before5 = await run(admin.id,
    `select count(*)::int n from public.search_companies_unified($1, 50)`, ['شركة فحص 91-'])
  ok('وقبل النشر لا يظهر منه شيء', before5.rows[0].n === 0, `${before5.rows[0].n} نتيجة`)

  // The synthetic generation is far smaller than whatever is live, which is
  // exactly the situation the shrink guard exists for. It has to refuse first.
  const guarded = await run(admin.id, 'select public.import_job_publish($1) r', [job5])
  ok('وانكماش يفوق الحدّ يوقف النشر',
    guarded.ok === false && /يحتاج تأكيداً صريحاً/.test(guarded.message || ''),
    guarded.message?.slice(0, 110))

  const pub5 = await run(admin.id, 'select public.import_job_publish($1, true) r', [job5])
  ok('والنشر ينجح بتأكيد صريح', pub5.ok === true, pub5.message?.slice(0, 90))

  const after5 = await run(admin.id,
    `select count(*)::int n from public.search_companies_unified($1, 50)`, ['شركة فحص 91-'])
  ok('وبعده يظهر', after5.rows[0].n > 0, `${after5.rows[0].n} نتيجة`)

  const { rows: [live5] } = await db.query('select public.published_registry_dataset() d')
  ok('والمؤشّر يشير إليه', live5.d === ds5)

  // ===== 6. A second generation, and the diff =====
  const s6 = await run(admin.id,
    `select * from public.import_job_start('gen2.csv', 5000, 21, 'الربع الثاني فحص', current_date)`)
  const job6 = s6.rows[0].job_id
  const ds6 = s6.rows[0].dataset_id
  jobs.push(job6)
  await run(admin.id, 'select public.import_job_validate($1, $2, true)', [job6, HEADER])

  // 18 carried over (2 struck off), 1 renamed, 3 brand new  → 21 rows
  const carried = gen(G1, 18)
  carried[0].name = 'شركة فحص 91-0 بعد التغيير'
  await load(ds6, [...carried, ...gen(G2, 3)])
  await run(admin.id, 'select public.import_job_finish_load($1)', [job6])
  const v6 = await run(admin.id, 'select public.import_job_verify($1) r', [job6])
  ok('الجيل الثاني يجتاز الفحص', v6.rows[0].r.ok === true,
    JSON.stringify(v6.rows[0].r.checks?.filter((c) => !c.ok))?.slice(0, 120))

  const pub6 = await run(admin.id, 'select public.import_job_publish($1, true) r', [job6])
  const diff = pub6.rows?.[0]?.r?.diff
  ok('والنشر يحسب الفرق', !!diff, pub6.message?.slice(0, 90))
  ok('  جديد = ٣', Number(diff?.new) === 3, String(diff?.new))
  ok('  متغيّر = ١', Number(diff?.changed) === 1, String(diff?.changed))
  ok('  محذوف = ٢', Number(diff?.removed) === 2, String(diff?.removed))

  const { rows: [rm] } = await db.query(
    `select count(*)::int n from public.import_diffs where job_id=$1 and change='removed'`, [job6])
  ok('والمحذوف مسجَّل صفّاً صفّاً', rm.n === 2, `${rm.n}`)

  const { rows: [stillThere] } = await db.query(
    `select count(*)::int n from public.government_company_registry where dataset_id=$1`, [ds5])
  ok('وصفوف الجيل السابق لم تُحذف', stillThere.n === 20, `${stillThere.n}`)

  const d2 = await run(admin.id,
    'select * from public.registry_generation_diff($1, $2)', [ds5, ds6])
  const m = Object.fromEntries((d2.rows || []).map((r) => [r.change, Number(r.n)]))
  ok('والمقارنة بين أي جيلين تعطي النتيجة نفسها',
    m.new === 3 && m.changed === 1 && m.removed === 2, JSON.stringify(m))

  // ===== 7. Rollback =====
  const rb = await run(admin.id, 'select public.import_job_rollback($1, $2)',
    [ds5, 'فحص التراجع'])
  ok('التراجع ينجح', rb.ok === true, rb.message?.slice(0, 80))

  const { rows: [live7] } = await db.query('select public.published_registry_dataset() d')
  ok('والمؤشّر يعود للجيل السابق', live7.d === ds5)

  const afterRb = await run(admin.id,
    `select count(*)::int n from public.search_companies_unified($1, 50)`, ['شركة فحص 92-'])
  ok('وشركات الجيل الملغى تختفي من البحث', afterRb.rows[0].n === 0, `${afterRb.rows[0].n}`)

  const noReason = await run(admin.id, 'select public.import_job_rollback($1, $2)', [ds6, ''])
  ok('والتراجع بلا سبب يُرفض', noReason.ok === false && /سبب/.test(noReason.message || ''))

  // ===== 8. Retry starts a fresh generation =====
  const s8 = await run(admin.id,
    `select * from public.import_job_start('retry.csv', 5000, 5, 'إعادة فحص', current_date)`)
  ok('إعادة المحاولة تبدأ مجموعة جديدة',
    s8.ok === true && s8.rows[0].dataset_id !== ds6, s8.message?.slice(0, 80))
  if (s8.ok) {
    jobs.push(s8.rows[0].job_id)
    const busy = await run(admin.id,
      `select * from public.import_job_start('second.csv', 5000, 5, 'فحص', current_date)`)
    ok('ولا مهمّتان مفتوحتان معاً',
      busy.ok === false && /مفتوحة/.test(busy.message || ''), busy.message?.slice(0, 70))
    await run(admin.id, 'select public.import_job_cancel($1, $2)', [s8.rows[0].job_id, 'فحص'])
  }

  // ===== 9. And none of it is reachable without the role =====
  const { rows: [coUser] } = await db.query(
    `select id from public.users where role = 'company_admin' limit 1`)
  const denied = await run(coUser.id,
    `select * from public.import_job_start('x.csv', 1, 1, 'x', current_date)`)
  ok('حساب شركة لا يبدأ استيراداً',
    denied.ok === false && /مسؤول المنصة/.test(denied.message || ''), denied.message?.slice(0, 70))

  const denied2 = await run(coUser.id, 'select public.import_job_publish($1)', [job6])
  ok('ولا ينشر', denied2.ok === false && /مسؤول المنصة/.test(denied2.message || ''))

  // ===== 10. The history says how complete each generation is =====
  // The existing 503 rows read 0.03% of their source. That number existed
  // nowhere before this, which is the only reason they could pass for the
  // register for as long as they did.
  const hist = await run(admin.id, 'select * from public.registry_import_history(20)')
  ok('وتاريخ الاستيراد يُقرأ', hist.ok === true, hist.message?.slice(0, 80))

  const live = (hist.rows || []).find((r) => r.is_published)
  ok('ويقول نسبة اكتمال كل جيل',
    live && live.completeness !== null && live.completeness !== undefined,
    JSON.stringify(live && { p: live.snapshot_period, c: live.completeness }))

  const denied3 = await run(coUser.id, 'select * from public.registry_import_history(5)')
  ok('ولا يقرأه حساب شركة', denied3.ok === false)

} catch (e) {
  fail += 1
  console.log(`  ❌ توقّف: ${e.message.slice(0, 200)}`)
} finally {
  await db.query('rollback').catch(() => {})

  // Put production back exactly as it was found.
  for (const j of jobs) {
    const { rows } = await db.query('select dataset_id from public.import_jobs where id=$1', [j])
      .catch(() => ({ rows: [] }))
    if (rows[0]) {
      await db.query('delete from public.government_company_registry where dataset_id=$1',
        [rows[0].dataset_id]).catch(() => {})
    }
    await db.query('delete from public.import_diffs where job_id=$1', [j]).catch(() => {})
    await db.query('delete from public.import_job_errors where job_id=$1', [j]).catch(() => {})
    await db.query('delete from public.import_jobs where id=$1', [j]).catch(() => {})
  }
  await db.query(
    `update public.system_settings set value = $1::jsonb where key = 'published_registry_dataset'`,
    [livePointer ? JSON.stringify(livePointer) : 'null']).catch(() => {})
  await db.query(`delete from public.audit_logs where action like 'registry_%'
                    and created_at > now() - interval '10 minutes'`).catch(() => {})

  const { rows: [back] } = await db.query(
    `select value #>> '{}' v from public.system_settings where key='published_registry_dataset'`)
  console.log(`  (المجموعة المنشورة بعد الفحص: ${back?.v})`)
  if (back?.v !== livePointer) {
    fail += 1
    console.log('  ❌ لم تُستعد المجموعة المنشورة — تدخّل يدوي مطلوب')
  }
  await db.end()
}

console.log(fail
  ? `\n  ❌ ${fail} من ${pass + fail}\n`
  : `\n  ✅ ${pass} فحصاً — لا جيل يُنشر حتى تتّفق الأعداد\n`)
process.exit(fail ? 1 : 0)
