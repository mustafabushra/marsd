#!/usr/bin/env node
/**
 * The commercial register, imported the way the import system says it must be.
 *
 * `import-registry.mjs` moves the rows. This is the lifecycle around it: count
 * the file before touching the database, open a job, validate, load into a new
 * generation, count what landed, verify, and stop short of publishing so a
 * person decides that.
 *
 * The count is taken here, by streaming, and never from the loader. A loader
 * that miscounts is precisely the failure being checked for, and asking it to
 * confirm itself proves only that it is consistent.
 *
 *   node scripts/run-registry-import.mjs <file.csv> [--period "الربع الثاني 2026"] [--at 2026-06-30]
 */

import pg from 'pg'
import { createReadStream, readFileSync, statSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { spawn } from 'node:child_process'

const args = process.argv.slice(2)
const FILE = args.find((a) => !a.startsWith('--'))
const at = (f, d) => { const i = args.indexOf(f); return i > -1 ? args[i + 1] : d }
const PERIOD = at('--period', 'الربع الثاني 2026')
const SNAP   = at('--at', '2026-06-30')

if (!FILE) {
  console.error('  الاستعمال: node scripts/run-registry-import.mjs <ملف.csv> [--period ...] [--at ...]')
  process.exit(1)
}

const url = readFileSync('.env.migrations', 'utf8').split(/\r?\n/)
  .find((l) => l.trim().startsWith('DATABASE_URL='))?.split('=').slice(1).join('=').trim()
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await db.connect()

const { rows: [admin] } = await db.query(
  `select id from public.users where role = 'platform_admin' order by created_at limit 1`)

/** Call a definer function as the administrator. */
async function call (sql, params = []) {
  await db.query('begin')
  await db.query(`select set_config('request.jwt.claims', $1, true)`,
    [JSON.stringify({ sub: admin.id, role: 'authenticated' })])
  try {
    const { rows } = await db.query(sql, params)
    await db.query('commit')
    return rows
  } catch (e) { await db.query('rollback'); throw e }
}

/** Read the file once: how many rows, what the header says, did it end cleanly. */
async function measure (path) {
  const rl = createInterface({ input: createReadStream(path, { encoding: 'utf8' }), crlfDelay: Infinity })
  let header = null
  let lines = 0
  let last = ''
  for await (const line of rl) {
    if (lines === 0) header = line
    if (line.trim() !== '') last = line
    lines += 1
  }
  const cols = header.replace(/^﻿/, '').split(',').map((s) => s.trim())
  return {
    header: cols,
    dataRows: lines - 1,
    // A file cut mid-write ends with fewer fields than its header promises.
    lastComplete: last.split(',').length >= cols.length,
  }
}

let job = null
try {
  console.log(`\n  الملف: ${FILE}`)
  console.log(`  الحجم: ${(statSync(FILE).size / 1024 / 1024).toFixed(1)} ميغابايت`)
  console.log('\n  ▸ القياس بالتدفّق…')
  const m = await measure(FILE)
  console.log(`     أسطر البيانات : ${m.dataRows.toLocaleString('en')}`)
  console.log(`     الترويسة      : ${m.header.join(' | ').slice(0, 130)}`)
  console.log(`     السطر الأخير  : ${m.lastComplete ? 'كامل' : 'مقطوع'}`)

  console.log('\n  ▸ فتح المهمّة…')
  const [j] = await call(
    `select * from public.import_job_start($1, $2, $3, $4, $5)`,
    [FILE.split(/[\\/]/).pop(), statSync(FILE).size, m.dataRows, PERIOD, SNAP])
  job = j.job_id
  console.log(`     المهمّة   : ${job}`)
  console.log(`     المجموعة  : ${j.dataset_id}`)

  console.log('\n  ▸ التحقّق قبل التحميل…')
  const [{ import_job_validate: v }] = await call(
    'select public.import_job_validate($1, $2, $3)', [job, m.header, m.lastComplete])
  for (const c of v.checks) console.log(`     ${c.ok ? '✓' : '✗'} ${c.label}${c.detail ? ` — ${c.detail}` : ''}`)
  if (!v.ok) throw new Error(`رُفض قبل التحميل: ${v.reason}`)

  console.log('\n  ▸ التحميل (COPY)…')
  await new Promise((resolve, reject) => {
    const p = spawn(process.execPath,
      ['scripts/import-registry.mjs', FILE, '--dataset', j.dataset_id],
      { stdio: ['ignore', 'inherit', 'inherit'] })
    p.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`المُحمِّل خرج بالرمز ${code}`)))
  })

  console.log('\n  ▸ عدّ ما وصل…')
  const [{ import_job_finish_load: f }] = await call(
    'select public.import_job_finish_load($1)', [job])
  console.log(`     محمّل : ${Number(f.rows_loaded).toLocaleString('en')}`)
  console.log(`     مرفوض: ${Number(f.rows_rejected).toLocaleString('en')}`)

  console.log('\n  ▸ الفحص…')
  const [{ import_job_verify: r }] = await call('select public.import_job_verify($1)', [job])
  for (const c of r.checks) console.log(`     ${c.ok ? '✓' : '✗'} ${c.label}${c.detail ? ` — ${c.detail}` : ''}`)

  console.log(r.ok
    ? `\n  ✅ المجموعة جاهزة للنشر — ولم تُنشر بعد.\n     النشر: select public.import_job_publish('${job}');\n`
    : '\n  ❌ لم تجتز الفحص — المجموعة غير منشورة والجيل السابق كما هو.\n')
  process.exitCode = r.ok ? 0 : 1
} catch (e) {
  console.log(`\n  ❌ ${e.message.slice(0, 300)}`)
  if (job) {
    console.log(`     المهمّة ${job} تركت بحالتها للفحص.`)
    console.log(`     للإلغاء: select public.import_job_cancel('${job}', 'سبب');`)
  }
  process.exitCode = 1
} finally {
  await db.end()
}
