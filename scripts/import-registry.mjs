#!/usr/bin/env node
/**
 * The commercial register, loaded the way a million rows should be.
 *
 * The admin screen uploads through PostgREST, a batch at a time. For a quarter
 * of the national register that is two thousand round trips and ten minutes at
 * best, and it was always the wrong tool — the browser is right for a hundred
 * rows and for checking that the columns parse, not for the whole file.
 *
 * `COPY` is what Postgres provides for this. The rows stream from the file into
 * the server on one connection, and Supabase is Postgres, so the same
 * DATABASE_URL that installs the migrations does it.
 *
 * ============================================================================
 * Through a staging table
 * ============================================================================
 * `COPY` has no `on conflict`. So the rows land in an unlogged staging table
 * first and are merged in one statement — which also means the merge is atomic:
 * either the quarter is in, or nothing changed, and a run that dies halfway
 * leaves no half-imported snapshot behind.
 *
 * ============================================================================
 * One mapping, not two
 * ============================================================================
 * Columns, digits and dates go through `src/lib/registryDataset.js` — the same
 * module the screen uses. A second copy here would agree with it until the
 * Ministry renamed a column, and then only one of them would be fixed.
 *
 *   node scripts/import-registry.mjs <file.xlsx> [--dataset <uuid>] [--dry-run]
 */

import pg from 'pg'
import { from as copyFrom } from 'pg-copy-streams'
import * as XLSX from 'xlsx'
import { readFileSync, existsSync } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { toCompany, describeHeaders, DATASET_ID } from '../src/lib/registryDataset.js'

const args = process.argv.slice(2)
const file = args.find((a) => !a.startsWith('--'))
const dataset = args[args.indexOf('--dataset') + 1] || DATASET_ID
const dryRun = args.includes('--dry-run')

if (!file || !existsSync(file)) {
  console.log('\n  الاستعمال: node scripts/import-registry.mjs <ملف.xlsx> [--dataset <uuid>] [--dry-run]\n')
  process.exit(2)
}

const url = readFileSync('.env.migrations', 'utf8').split(/\r?\n/)
  .find((l) => l.trim().startsWith('DATABASE_URL='))?.split('=').slice(1).join('=').trim()

const STAGING = 'registry_import_staging'
const COLUMNS = [
  'dataset_id', 'snapshot_period', 'snapshot_at', 'cr_number', 'name',
  'unified_number', 'registration_type', 'legal_entity', 'capital',
  'region', 'city', 'registration_date',
]

/** One CSV field. Postgres reads `\N` as null and doubled quotes as one. */
const field = (v) => {
  if (v === null || v === undefined || v === '') return '\\N'
  return `"${String(v).replace(/"/g, '""')}"`
}

console.log(`\n  ${file}`)
console.log('  جاري القراءة…')

const t0 = Date.now()
const wb = XLSX.read(readFileSync(file), { type: 'buffer', cellDates: true, dense: true })
const ws = wb.Sheets[wb.SheetNames[0]]
if (!ws) { console.log('\n  ❌ الملف لا يحتوي على أوراق\n'); process.exit(1) }

const headerRow = XLSX.utils.sheet_to_json(ws, { header: 1, range: 0, defval: null })[0] || []
const headers = headerRow.map((h) => String(h ?? '').trim()).filter(Boolean)
const { present, missing } = describeHeaders(headers)

console.log(`  الأعمدة المعروفة: ${present.map((c) => c.label).join('، ') || 'لا شيء'}`)
if (missing.length) console.log(`  غير موجودة: ${missing.map((c) => c.label).join('، ')}`)

if (!present.some((c) => c.field === 'crNumber')) {
  console.log('\n  ❌ لا يوجد عمود «رقم السجل» — هذا ليس ملف السجلات التجارية\n')
  process.exit(1)
}

const rows = XLSX.utils.sheet_to_json(ws, { defval: null })
console.log(`  ${rows.length.toLocaleString('ar-SA')} صف — قُرئ في ${Math.round((Date.now() - t0) / 1000)} ثانية`)

// 1,048,576 is Excel's ceiling, not a number a register lands on by chance.
if (rows.length >= 1048575) {
  console.log('\n  ⚠️  الملف عند الحدّ الأقصى لصفوف Excel — على الأرجح أنه مقطوع،')
  console.log('     وما بعد هذا الصف لن يدخل. استخرجه بصيغة CSV إن أمكن.\n')
}

const period = wb.SheetNames[0]
const snapshotAt = new Date().toISOString().slice(0, 10)

if (dryRun) {
  const sample = rows.slice(0, 3).map(toCompany)
  console.log('\n  عيّنة بعد التحويل:')
  sample.forEach((c) => console.log(`    ${c.crNumber} · ${c.name} · ${c.city ?? '—'} · ${c.capital ?? '—'}`))
  console.log('\n  (تجربة — لم يُكتب شيء)\n')
  process.exit(0)
}

const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await c.connect()

try {
  await c.query('begin')

  // Unlogged: this table is written once and thrown away in the same
  // transaction, so paying for write-ahead logging on a million rows buys
  // durability for data that will not outlive the statement.
  await c.query(`
    create unlogged table if not exists ${STAGING} (
      dataset_id uuid, snapshot_period text, snapshot_at date,
      cr_number text, name text, unified_number text,
      registration_type text, legal_entity text, capital numeric,
      region text, city text, registration_date date
    )`)
  await c.query(`truncate ${STAGING}`)

  console.log('  جاري الرفع…')
  const tCopy = Date.now()

  let skipped = 0
  const stream = c.query(copyFrom(`copy ${STAGING} (${COLUMNS.join(',')}) from stdin with (format csv, null '\\N')`))

  await pipeline(
    Readable.from((function* lines() {
      for (const raw of rows) {
        const r = toCompany(raw)
        // A row with no registration number has no identity in this register
        // and nothing to match on later.
        if (!r.crNumber || !r.name) { skipped += 1; continue }
        yield [
          field(dataset), field(period), field(snapshotAt),
          field(r.crNumber), field(r.name), field(r.unifiedNumber),
          field(r.crType), field(r.entityType), field(r.capital),
          field(r.region), field(r.city), field(r.foundingDate),
        ].join(',') + '\n'
      }
    })()),
    stream,
  )

  const { rows: [staged] } = await c.query(`select count(*)::int n from ${STAGING}`)
  console.log(`  ${staged.n.toLocaleString('ar-SA')} صف وصل في ${Math.round((Date.now() - tCopy) / 1000)} ثانية`)
  if (skipped) console.log(`  ${skipped.toLocaleString('ar-SA')} صف بلا رقم سجل أو اسم — تُرك`)

  // The merge, in one statement.
  //
  // `distinct on` because a file can carry the same registration twice and
  // `on conflict` cannot update a row it inserted in the same command — which
  // fails as «ON CONFLICT DO UPDATE command cannot affect row a second time»,
  // an error that names nothing a reader can act on.
  console.log('  جاري الدمج…')
  const tMerge = Date.now()
  const { rowCount } = await c.query(`
    insert into public.government_company_registry
      (dataset_id, snapshot_period, snapshot_at, cr_number, name, unified_number,
       registration_type, legal_entity, capital, region, city, registration_date)
    select distinct on (cr_number)
       dataset_id, snapshot_period, snapshot_at, cr_number, name, unified_number,
       registration_type, legal_entity, capital, region, city, registration_date
      from ${STAGING}
     order by cr_number
    on conflict (dataset_id, cr_number) do update set
       name = excluded.name,
       unified_number = excluded.unified_number,
       registration_type = excluded.registration_type,
       legal_entity = excluded.legal_entity,
       capital = excluded.capital,
       region = excluded.region,
       city = excluded.city,
       registration_date = excluded.registration_date,
       snapshot_period = excluded.snapshot_period,
       snapshot_at = excluded.snapshot_at,
       imported_at = now()`)

  await c.query(`drop table if exists ${STAGING}`)
  await c.query('commit')

  const { rows: [total] } = await c.query(
    'select count(*)::int n from public.government_company_registry where dataset_id = $1', [dataset])

  console.log(`  ${rowCount.toLocaleString('ar-SA')} صف دُمج في ${Math.round((Date.now() - tMerge) / 1000)} ثانية`)
  console.log(`\n  ✅ السجل يحتوي الآن ${total.n.toLocaleString('ar-SA')} شركة لهذه اللقطة`)
  console.log(`     الزمن الكلي: ${Math.round((Date.now() - t0) / 1000)} ثانية\n`)
} catch (e) {
  await c.query('rollback').catch(() => {})
  console.log(`\n  ❌ ${e.message}\n     لم يتغيّر شيء — العملية كلها في معاملة واحدة.\n`)
  process.exitCode = 1
} finally {
  await c.end()
}
