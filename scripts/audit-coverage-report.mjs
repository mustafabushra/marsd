#!/usr/bin/env node
/**
 * حصر كل تغيير حسّاس، وهل يترك أثراً.
 *
 * ليس فحصاً ينجح أو يرسب — تقريرٌ يُبنى من القاعدة نفسها. يعدّ كل دالة تكتب
 * في جدول ذي أثر، ويقول أين يُولَّد قيد التدقيق إن وُجد.
 *
 * التصنيف من الدالة لا من اسمها: يُقرأ نصّها ويُنظر أتكتب في audit_logs، أم
 * في سجلّ نطاق (company_request_events)، أم لا تكتب شيئاً.
 *
 *   node scripts/audit-coverage-report.mjs
 */
import pg from 'pg'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const envPath = join(root, '.env.migrations')
if (!existsSync(envPath)) { console.error('❌ .env.migrations مفقود'); process.exit(2) }
const line = readFileSync(envPath, 'utf8').split(/\r?\n/)
  .find((l) => l.trim().startsWith('DATABASE_URL='))
const c = new pg.Client({
  connectionString: line.split('=').slice(1).join('=').trim(),
  ssl: { rejectUnauthorized: false },
})
await c.connect()
const q = async (s) => (await c.query(s)).rows

// الجداول التي يعني تغييرها أثراً على شركة أو مستخدم أو سجلّ علني.
const SENSITIVE = [
  'companies', 'reports', 'disputes', 'trust_scores', 'company_documents',
  'company_requests', 'claim_requests', 'users', 'tenants', 'subscriptions',
  'plans', 'credits_ledger', 'audit_logs', 'system_settings', 'pending_invites',
]

const fns = await q(`
  select p.proname, pg_get_functiondef(p.oid) def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f'
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
   order by 1`)

const WRITES = new RegExp(
  `(insert\\s+into|update|delete\\s+from)\\s+(public\\.)?(${SENSITIVE.join('|')})\\b`, 'i')
const AUDITS = /insert\s+into\s+(public\.)?audit_logs/i
const DOMAIN = /insert\s+into\s+(public\.)?(company_request_events|review_actions|company_audit_log)/i

const rows = []
for (const f of fns) {
  if (f.proname.startsWith('audit_') || f.proname === 'stamp_audit_actor') continue
  if (!WRITES.test(f.def)) continue
  // المشغّلات تُصنَّف على حدة أدناه.
  if (/RETURNS trigger/i.test(f.def)) continue

  const audited = AUDITS.test(f.def)
  const domain = DOMAIN.test(f.def)
  const definer = /SECURITY DEFINER/i.test(f.def)
  rows.push({
    op: f.proname,
    audited,
    where: audited ? 'داخل الدالة (SQL)' : domain ? 'سجلّ نطاق فقط' : '—',
    definer,
  })
}

// المشغّلات التي تكتب في audit_logs تلقائياً.
const triggers = await q(`
  select tg.tgname, cl.relname tbl, p.proname
    from pg_trigger tg
    join pg_class cl on cl.oid = tg.tgrelid
    join pg_proc p on p.oid = tg.tgfoid
    join pg_namespace n on n.oid = cl.relnamespace
   where n.nspname = 'public' and not tg.tgisinternal`)

const auditTriggers = []
for (const t of triggers) {
  const [{ def } = {}] = await q(
    `select pg_get_functiondef(p.oid) def from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname='public' and p.proname = '${t.proname}'`)
  if (def && AUDITS.test(def)) auditTriggers.push(`${t.tbl} → ${t.tgname}`)
}

// حماية السجلّ.
const pols = await q("select cmd from pg_policies where tablename = 'audit_logs'")
const canDelete = pols.some((p) => p.cmd === 'DELETE')
const canUpdate = pols.some((p) => p.cmd === 'UPDATE')
const protectedLog = !canDelete && !canUpdate

rows.sort((a, b) => Number(a.audited) - Number(b.audited) || a.op.localeCompare(b.op))

const W = 34
console.log('العملية'.padEnd(W) + 'مُدقَّقة  أين يُولَّد القيد        محميّ من التعديل')
console.log('─'.repeat(88))
for (const r of rows) {
  console.log(
    r.op.slice(0, W - 1).padEnd(W)
    + (r.audited ? '✅     ' : '❌     ')
    + r.where.padEnd(24)
    + (r.audited ? (protectedLog ? 'نعم' : 'لا') : '—'))
}

console.log('\nمشغّلات تكتب في السجلّ تلقائياً:')
for (const t of auditTriggers) console.log(`   ${t}`)

const audited = rows.filter((r) => r.audited).length
const missing = rows.filter((r) => !r.audited)

console.log(`\nالمجموع: ${rows.length} عملية تكتب في جدول حسّاس`)
console.log(`   مُدقَّقة    : ${audited}`)
console.log(`   غير مُدقَّقة: ${missing.length}`)
console.log(`\nحماية audit_logs: DELETE ${canDelete ? '⚠️ مسموح' : '✅ ممنوع'} · UPDATE ${canUpdate ? '⚠️ مسموح' : '✅ ممنوع'}`)

if (missing.length) {
  console.log('\nغير مُدقَّقة — تُقرأ ولا يُدَّعى أنها مغطّاة:')
  for (const r of missing) console.log(`   · ${r.op}${r.where === 'سجلّ نطاق فقط' ? '  (سجلّ نطاق فقط)' : ''}`)
}

await c.end()
