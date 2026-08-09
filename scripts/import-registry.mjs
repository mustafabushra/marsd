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
import { toCompany, describeHeaders, digits, isoDate, REGISTRY_COLUMNS, DATASET_ID } from '../src/lib/registryDataset.js'
import { mapHeader, rowFromLine } from '../src/lib/registryCsv.js'
import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'

const args = process.argv.slice(2)
const file = args.find((a) => !a.startsWith('--'))
// `indexOf` returns -1 when the flag is absent, and `args[-1 + 1]` is the file
// path — which Postgres then rejects as «invalid input syntax for type uuid»,
// naming the path and explaining nothing.
const datasetAt = args.indexOf('--dataset')
const dataset = (datasetAt > -1 && args[datasetAt + 1]) || DATASET_ID
const dryRun = args.includes('--dry-run')
// A partial import, for a database that cannot hold the whole quarter — or for
// seeing the thing work end to end before committing half an hour to it.
const limitAt = args.indexOf('--limit')
const limit = (limitAt > -1 && Number(args[limitAt + 1])) || Infinity

if (!file || !existsSync(file)) {
  console.log('\n  الاستعمال: node scripts/import-registry.mjs <ملف.xlsx> [--dataset <uuid>] [--dry-run]\n')
  process.exit(2)
}

const url = readFileSync('.env.migrations', 'utf8').split(/\r?\n/)
  .find((l) => l.trim().startsWith('DATABASE_URL='))?.split('=').slice(1).join('=').trim()

const STAGING = 'registry_import_staging'
const COLUMNS = [
  'dataset_id', 'snapshot_period', 'snapshot_at', 'cr_number', 'name',
  'unified_number', 'registration_type', 'legal_entity', 'legal_entity_2', 'capital',
  'region', 'city', 'registration_date',
]

/** One CSV field. Postgres reads `\N` as null and doubled quotes as one. */
const field = (v) => {
  // Empty means null, which is `COPY … format csv`'s own default. The first
  // version emitted the text-format marker and declared it — and Postgres read
  // it as two literal characters: «invalid input syntax for type numeric» on
  // the first company whose capital was not stated.
  if (v === null || v === undefined || v === '') return ''
  return `"${String(v).replace(/"/g, '""')}"`
}

const isCsv = /\.csv$/i.test(file)

console.log(`\n  ${file}`)

const t0 = Date.now()
let index = null
let headers = []
let rows = null

if (isCsv) {
  // Streamed. `XLSX.read` builds the whole sheet in memory before a single row
  // can be looked at, and on the real 349MB file that died at 2GB —
  // «Ineffective mark-compacts near heap limit» — having read nothing. A CSV
  // needs none of it: one line at a time, straight into COPY.
  const rl = createInterface({ input: createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity })
  let head = ''
  for await (const line of rl) { head = line; rl.close(); break }
  const mapped = mapHeader(head, REGISTRY_COLUMNS)
  index = mapped.index
  headers = mapped.names
  console.log('  CSV — يُقرأ سطراً سطراً، بلا حدّ للحجم')
} else {
  console.log('  جاري القراءة…')
  const wb = XLSX.read(readFileSync(file), { type: 'buffer', cellDates: true, dense: true })
  const ws = wb.Sheets[wb.SheetNames[0]]
  if (!ws) { console.log('\n  ❌ الملف لا يحتوي على أوراق\n'); process.exit(1) }
  headers = (XLSX.utils.sheet_to_json(ws, { header: 1, range: 0, defval: null })[0] || [])
    .map((h) => String(h ?? '').trim()).filter(Boolean)
  rows = XLSX.utils.sheet_to_json(ws, { defval: null })
  console.log(`  ${rows.length.toLocaleString('ar-SA')} صف`)
}

const { present, missing } = describeHeaders(headers)
console.log(`  الأعمدة المعروفة: ${present.map((c) => c.label).join('، ') || 'لا شيء'}`)
if (missing.length) console.log(`  غير موجودة: ${missing.map((c) => c.label).join('، ')}`)

if (!present.some((c) => c.field === 'crNumber')) {
  console.log('\n  ❌ لا يوجد عمود «رقم السجل» — هذا ليس ملف السجلات التجارية\n')
  process.exit(1)
}

/** Every data row, whichever kind of file this is. */
async function* readRows() {
  if (!isCsv) { for (const r of rows) yield toCompany(r); return }
  const rl = createInterface({ input: createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity })
  let first = true
  for await (const line of rl) {
    if (first) { first = false; continue }
    if (!line.trim()) continue
    yield rowFromLine(line, index, { digits, isoDate })
  }
}

const period = isCsv
  ? file.split(/[\/]/).pop().replace(/\.csv$/i, '')
  : 'الورقة الأولى'
const snapshotAt = new Date().toISOString().slice(0, 10)

if (dryRun) {
  console.log('\n  عيّنة بعد التحويل:')
  let n = 0
  for await (const r of readRows()) {
    console.log(`    ${r.crNumber} · ${r.name} · ${r.city ?? '—'} · ${r.capital ?? '—'} · ${r.entityType2 ?? r.entityType ?? '—'}`)
    if ((n += 1) >= 3) break
  }
  console.log('\n  (تجربة — لم يُكتب شيء)\n')
  process.exit(0)
}

const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await c.connect()

try {
  // Supabase caps how long one statement may run. A COPY of a million rows is
  // one statement and takes minutes, so it was cancelled at 100,000 rows —
  // «canceling statement due to statement timeout», which reads like a fault in
  // the data and is a setting on the connection.
  await c.query("set statement_timeout = 0")
  await c.query("set idle_in_transaction_session_timeout = 0")
  await c.query('begin')

  // Unlogged: this table is written once and thrown away in the same
  // transaction, so paying for write-ahead logging on a million rows buys
  // durability for data that will not outlive the statement.
  await c.query(`
    create unlogged table if not exists ${STAGING} (
      dataset_id uuid, snapshot_period text, snapshot_at date,
      cr_number text, name text, unified_number text,
      registration_type text, legal_entity text, legal_entity_2 text, capital numeric,
      region text, city text, registration_date date
    )`)
  await c.query(`truncate ${STAGING}`)

  console.log('  جاري الرفع…')
  const tCopy = Date.now()

  let skipped = 0
  let read = 0
  const stream = c.query(copyFrom(`copy ${STAGING} (${COLUMNS.join(',')}) from stdin with (format csv)`))

  await pipeline(
    Readable.from((async function* lines() {
      for await (const r of readRows()) {
        // A row with no registration number has no identity in this register
        // and nothing to match on later.
        if (!r.crNumber || !r.name) { skipped += 1; continue }
        read += 1
        yield [
          field(dataset), field(period), field(snapshotAt),
          field(r.crNumber), field(r.name), field(r.unifiedNumber),
          field(r.crType), field(r.entityType), field(r.entityType2), field(r.capital),
          field(r.region), field(r.city), field(r.foundingDate),
        ].join(',') + '\n'
        if (read >= limit) break
        if (read % 50000 === 0) process.stdout.write(`\r  ${read.toLocaleString('ar-SA')} صف…`)
      }
    })()),
    stream,
  )
  process.stdout.write('\r')


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
       registration_type, legal_entity, legal_entity_2, capital, region, city, registration_date)
    select distinct on (cr_number)
       dataset_id, snapshot_period, snapshot_at, cr_number, name, unified_number,
       registration_type, legal_entity, legal_entity_2, capital, region, city, registration_date
      from ${STAGING}
     order by cr_number
    on conflict (dataset_id, cr_number) do update set
       name = excluded.name,
       unified_number = excluded.unified_number,
       registration_type = excluded.registration_type,
       legal_entity = excluded.legal_entity,
       legal_entity_2 = excluded.legal_entity_2,
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
