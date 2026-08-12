/**
 * هل تقول بلاطات مركز الإجراءات الحقيقة؟
 *
 * البلاطة رقم يُضغط. فإن قالت «١ تقرير للمراجعة» ثم فُتحت الشاشة فارغة، فالرقم
 * والشاشة يقرآن مصدرين مختلفين — وهذا عطل صامت: يبني وينجح ويعرض رقماً كاذباً.
 *
 * هذا السكربت يقرأ الاثنين جنباً إلى جنب لكل بلاطة، ويطبع أين يختلفان.
 * لا يكتب شيئاً.
 */
import pg from 'pg'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const p = join(root, '.env.migrations')
if (!existsSync(p)) { console.error('❌ .env.migrations مفقود'); process.exit(2) }
const line = readFileSync(p, 'utf8').split(/\r?\n/).find((l) => l.trim().startsWith('DATABASE_URL='))
const dbUrl = line ? line.split('=').slice(1).join('=').trim() : null
if (!dbUrl) { console.error('❌ DATABASE_URL مفقود'); process.exit(2) }

const c = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } })
const q = async (sql, args = []) => (await c.query(sql, args)).rows

await c.connect()

// الدوال security definer وتشترط جلسة. ننتحل صفة مسؤول منصة كما تفعل
// كتل الاختبار داخل المهاجرات نفسها.
const [admin] = await q(`select id, email from public.users where role = 'platform_admin' limit 1`)
if (!admin) { console.error('❌ لا يوجد platform_admin'); process.exit(2) }
await q(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub: admin.id })])
console.log(`المسؤول المنتحَل: ${admin.email}\n`)

// ---------------------------------------------------------------------------
const [{ admin_work_counts: wc }] = await q(`select public.admin_work_counts()`)
const byKind = wc?.by_kind || {}
console.log('admin_work_counts().by_kind =', JSON.stringify(byKind))
console.log('admin_work_counts().all     =', wc?.all, '\n')

const items = await q(`select kind, status, company_name, company_id from public.admin_work_items('all', null, 500)`)
const seen = {}
for (const i of items) seen[i.kind] = (seen[i.kind] || 0) + 1
console.log('admin_work_items(all) فعلياً =', JSON.stringify(seen), '\n')

console.log('='.repeat(70))
console.log('البلاطة  ←→  ما تعرضه الشاشة التي تفتحها')
console.log('='.repeat(70))

const row = (label, tile, screen, where) => {
  const ok = Number(tile) === Number(screen)
  console.log(
    `${ok ? '✅' : '❌'} ${label.padEnd(22)} بلاطة=${String(tile).padEnd(4)} شاشة=${String(screen).padEnd(4)} ${where}`
  )
}

// --- تقارير للمراجعة → /admin/reports
const [rep] = await q(`
  select count(*) filter (where status = 'pending_review')                       as pending_review,
         count(*) filter (where status in ('pending_review','request_info'))     as queue_shape
    from public.reports`)
row('تقارير للمراجعة', byKind.report_review || 0, rep.queue_shape, '/admin/reports')
console.log(`      └─ منها status=pending_review فقط: ${rep.pending_review}`)

// --- طلبات انضمام → /admin/company-approval
const [reg] = await q(`
  select count(*) filter (where r.kind = 'registration')                         as any_status,
         count(*) filter (where r.kind = 'registration'
                            and r.status in ('submitted','under_review','resubmitted')) as open_only
    from public.company_requests r`)
row('طلبات انضمام', byKind.registration || 0, reg.any_status, '/admin/company-approval')
console.log(`      └─ المفتوحة فقط: ${reg.open_only}`)

// --- طلبات ملكية → /admin/claim-requests
const [clm] = await q(`select count(*) as n from public.claim_requests where status = 'pending'`)
row('طلبات ملكية', byKind.claim || 0, clm.n, '/admin/claim-requests (claim_requests)')

// --- تحقق مستندات → /admin/documents?tab=pending
const [{ documents_overview: dov }] = await q(`select public.documents_overview('pending')`)
row('تحقق مستندات', byKind.document_review || 0,
  (dov?.items || []).length, '/admin/documents?tab=pending')
console.log(`      └─ counts من الدالة: ${JSON.stringify(dov?.counts || {})}`)

// --- اعتراضات → /admin/disputes
const [dis] = await q(`select count(*) as n from public.report_disputes where status = 'pending'`)
row('اعتراضات نشطة', byKind.dispute || 0, dis.n, '/admin/disputes')

// --- تنبيهات الثقة → /admin/trust-score
const [tr] = await q(`
  select count(*) filter (where ts.score < 50)                        as low,
         count(*)                                                     as scored,
         count(*) filter (where ts.score < 50 and co.approved)        as low_approved
    from public.trust_scores ts join public.companies co on co.id = ts.company_id`)
console.log(`\n❓ تنبيهات الثقة        بلاطة=${tr.low_approved} — لكن /admin/trust-score لا يعرض «تنبيهات» إطلاقاً`)
console.log(`      └─ إجمالي المقيَّمة ${tr.scored} · تحت ٥٠ ${tr.low} · منها معتمدة ${tr.low_approved}`)

await c.end()
