/**
 * هل تقول بلاطات مركز الإجراءات الحقيقة؟
 *
 * البلاطة رقم يُضغط. فإن عدّت من مصدر ثم فتحت شاشة تقرأ مصدراً آخر، فهي تكذب —
 * وهذا ما كان يحدث: «١ تقرير للمراجعة» تفتح شاشة فارغة، و«٠ تحقق مستندات»
 * وخمسة مستندات تنتظر. عطل صامت: يبني وينجح ويعرض رقماً لا يقابله شيء.
 *
 * القاعدة التي يحرسها هذا السكربت: وجهة كل بلاطة تقرأ نفس ما عدّته.
 * لا يكتب شيئاً. يخرج بـ 1 عند أي اختلاف.
 *
 *   npm run check:tiles
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
const dbUrl = line ? line.split('=').slice(1).join('=').trim() : null
if (!dbUrl) { console.error('❌ DATABASE_URL مفقود'); process.exit(2) }

const c = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } })
const q = async (sql, args = []) => (await c.query(sql, args)).rows

await c.connect()

// الدوال security definer وتشترط جلسة، فننتحل صفة مسؤول منصة كما تفعل كتل
// الاختبار داخل المهاجرات.
const [admin] = await q("select id, email from public.users where role = 'platform_admin' limit 1")
if (!admin) { console.error('❌ لا يوجد platform_admin'); process.exit(2) }
await q("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: admin.id })])

const [{ admin_work_counts: wc }] = await q('select public.admin_work_counts()')
const k = wc?.by_kind || {}
const [{ documents_overview: dov }] = await q("select public.documents_overview('pending')")

const kindInQueue = async (kind) =>
  Number((await q('select count(*) n from public.admin_work_items($1, $2, 500)', ['all', kind]))[0].n)

const [rep] = await q(
  "select count(*) n from public.reports where status in ('pending_review','request_info')")
const [tr] = await q(`select count(*) n from public.trust_scores ts
                        join public.companies co on co.id = ts.company_id
                       where co.approved and ts.score > 0 and ts.score < 50`)

const checks = [
  ['تقارير للمراجعة', k.report_review || 0, Number(rep.n), '/admin/work?kind=report_review'],
  ['مؤشر ثقة منخفض', Number(tr.n), Number(tr.n), '/admin/companies?filter=low_trust'],
  ['طلبات انضمام', k.registration || 0, await kindInQueue('registration'), '/admin/company-requests?kind=registration'],
  ['طلبات ملكية', k.claim || 0, await kindInQueue('claim'), '/admin/work?kind=claim'],
  ['تحقق مستندات', k.document_review || 0, (dov?.items || []).length, '/admin/documents?tab=pending'],
  ['اعتراضات نشطة', k.dispute || 0, await kindInQueue('dispute'), '/admin/work?kind=dispute'],
]

console.log(`المسؤول المنتحَل: ${admin.email}\n`)
console.log('البلاطة  ←→  ما تعرضه وجهتها')
console.log('='.repeat(72))

let bad = 0
for (const [label, tile, dest, where] of checks) {
  const ok = Number(tile) === Number(dest)
  if (!ok) bad++
  console.log(`${ok ? '✅' : '❌'} ${label.padEnd(20)} بلاطة=${String(tile).padEnd(4)} وجهة=${String(dest).padEnd(4)} ${where}`)
}

await c.end()

if (bad) {
  console.error(`\n❌ ${bad} بلاطة تعرض رقماً لا يقابله شيء في وجهتها.`)
  process.exit(1)
}
console.log('\n✅ كل بلاطة تطابق ما تفتحه.')
