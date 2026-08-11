#!/usr/bin/env node
/**
 * Publishing is refused by the database from every state that is not `ready`.
 *
 * The button is a convenience. This is the control, so it is tested where it
 * lives: a job is put into each state in turn and import_job_publish is called
 * directly, with no interface in the way. Everything runs inside a transaction
 * that is rolled back, so no real generation is touched.
 *
 *   node scripts/probe-publish-gate.mjs
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

const ADMIN = 'publish_gate_probe'
const REFUSED = /لا تُنشر|صلاحي|حالة|permission|denied/i

try {
  await db.query(
    `insert into public.users (id, email, role)
     values ($1, 'publish-gate@marsad.test', 'platform_admin')
     on conflict (id) do update set role = 'platform_admin'`, [ADMIN])

  const { rows: [job] } = await db.query(
    'select id, status from public.import_jobs order by started_at desc limit 1')
  if (!job) throw new Error('لا توجد مهمّة استيراد لاختبارها')

  console.log('\n─── النشر من كل حالة ───')

  for (const st of ['loading', 'validating', 'verifying', 'failed', 'published', 'cancelled']) {
    await db.query('begin')
    await db.query(`select set_config('request.jwt.claims', $1, true)`,
      [JSON.stringify({ sub: ADMIN })])
    await db.query('update public.import_jobs set status = $1 where id = $2', [st, job.id])

    let refused = false
    let msg = ''
    try {
      await db.query('select public.import_job_publish($1::uuid, $2::boolean)', [job.id, false])
    } catch (e) {
      msg = e.message
      refused = REFUSED.test(msg)
    }
    await db.query('rollback')
    ok(`«${st}» يُرفض`, refused, msg ? msg.slice(0, 80) : 'نُشر بلا اعتراض')
  }

  // And the one state that is allowed still needs the permission.
  console.log('\n─── «ready» ───')
  await db.query('begin')
  await db.query(`select set_config('request.jwt.claims', $1, true)`,
    [JSON.stringify({ sub: ADMIN })])
  await db.query('update public.import_jobs set status = $1 where id = $2', ['ready', job.id])
  let readyErr = ''
  try {
    await db.query('select public.import_job_publish($1::uuid, $2::boolean)', [job.id, true])
  } catch (e) { readyErr = e.message }
  await db.query('rollback')
  ok('«ready» يُقبل من صاحب الصلاحية', readyErr === '', readyErr.slice(0, 90))

  // Same state, no permission.
  await db.query('begin')
  await db.query('update public.users set role = $1 where id = $2', ['support', ADMIN])
  await db.query(`select set_config('request.jwt.claims', $1, true)`,
    [JSON.stringify({ sub: ADMIN })])
  await db.query('update public.import_jobs set status = $1 where id = $2', ['ready', job.id])
  let permErr = ''
  try {
    await db.query('select public.import_job_publish($1::uuid, $2::boolean)', [job.id, true])
  } catch (e) { permErr = e.message }
  await db.query('rollback')
  ok('«ready» يُرفض بلا صلاحية data.publish', REFUSED.test(permErr), permErr.slice(0, 90) || 'نُشر بلا صلاحية')

  // The equation is the verifier's business, and `ready` is the only thing it
  // hands out — so a job whose numbers do not add up cannot be in `ready` by
  // any path that does not write the column by hand.
  console.log('\n─── المعادلة ───')
  const { rows: [bad] } = await db.query(
    `select count(*)::int n from public.import_jobs
      where status = 'ready' and (rows_loaded + rows_rejected) <> expected_rows`)
  ok('لا مهمّة «ready» ومعادلتها مفتوحة', bad.n === 0, `${bad.n} مهمّة`)
} catch (e) {
  fail += 1
  console.log(`  ❌ توقّف: ${e.message.slice(0, 200)}`)
  try { await db.query('rollback') } catch { /* already out */ }
} finally {
  try { await db.query('delete from public.users where id = $1', [ADMIN]) } catch { /* fine */ }
  await db.end()
}

console.log(fail ? `\n  ❌ ${fail} من ${pass + fail}\n` : `\n  ✅ ${pass} فحصاً — لا نشر إلا من «ready»، والقاعدة هي التي تقرّر\n`)
process.exit(fail ? 1 : 0)
