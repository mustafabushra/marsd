#!/usr/bin/env node
/**
 * هل يستطيع مستخدم شركة استخراج نموذج الثقة؟
 *
 * ============================================================================
 * ما يحرسه هذا الفحص
 * ============================================================================
 * trust_scores مقروء لكل authenticated — عمداً، لأن تقرير الثقة العلني يقرأ
 * الدرجة. وهذا صحيح ما دام المقروء يصف الشركة. أما حين كتبت compute_trust_score
 * نسخةً من القواعد في breakdown.rules_applied، صار الجدول المفتوح ينشر
 * الأوزان والمكافآت والعقوبات — بينما مصدرها system_settings.trust_score_rules
 * مقصور على مسؤولي المنصّة. القفل على الأول يفكّه النسخُ في الثاني.
 *
 * فالفحص لا يقرأ الكود بل ينتحل صفة company_admin ويحاول الاستخراج فعلاً،
 * من كل طريق يعرفه:
 *
 *   · المفتاح صراحةً في breakdown
 *   · أي اسم من أسماء معاملات النموذج في أي مكان من الصفّ
 *   · الجدول المصدر مباشرة
 *   · والدالة الضيّقة: تُرجع العتبتين ولا شيء غيرهما
 *
 * ويؤكّد في المقابل أن ما يجب أن يبقى بقي — layers هي المنتَج نفسه.
 *
 *   npm run check:model-privacy
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
if (!line) { console.error('❌ DATABASE_URL مفقود'); process.exit(2) }

const c = new pg.Client({
  connectionString: line.split('=').slice(1).join('=').trim(),
  ssl: { rejectUnauthorized: false },
})
const q = async (sql, args = []) => (await c.query(sql, args)).rows

let pass = 0
let fail = 0
const ok = (n, cond, d = '') => {
  if (cond) { pass += 1; console.log(`  ✅ ${n}`) }
  else { fail += 1; console.log(`  ❌ ${n}${d ? ` — ${d}` : ''}`) }
}

// أسماء معاملات النموذج. وجود أيٍّ منها في صفّ يقرؤه مستخدم شركة تسريب.
const MODEL_TERMS = [
  'rules_applied', 'bankruptcy_penalty', 'struck_off_penalty', 'verified_bonus',
  'document_bonus', 'insolvency_penalty', 'liquidation_penalty', 'suspended_penalty',
  'recency_bonus', 'reporter_diversity_bonus', 'profile_completeness_bonus',
  'delay_days_per_point', 'delay_penalty_cap', 'ceiling', 'floor',
  'low_min', 'medium_min', 'weights',
]

await c.connect()

const [u] = await q(
  "select u.id, u.email from public.users u where u.role = 'company_admin' limit 1")
if (!u) { console.error('❌ لا يوجد company_admin للاختبار'); process.exit(2) }

// انتحال الهوية وحده لا يكفي.
//
// اتصال المهاجرات يملك bypassrls، فوضعُ مطالبات JWT دون تبديل الدور يترك
// السياسات معطَّلة ويقرأ كل شيء — ويبدو الفحص ناجحاً وهو لا يفحص شيئاً.
// كتبتُ هذا الفحص أول مرة كذلك، وأعلن أن system_settings مكشوف وهو محجوب.
//
// `set local role authenticated` هو ما يجعل RLS تسري فعلاً، والمعاملة تُلغى
// في النهاية فلا يبقى أثر للدور ولا للمطالبات.
await q('BEGIN')
await q("select set_config('request.jwt.claims', $1, true)",
  [JSON.stringify({ sub: u.id, role: 'authenticated' })])
await q('set local role authenticated')

const asRole = (await q('select current_user cu'))[0].cu
console.log(`المنتحَل: ${u.email} (company_admin) — الدور: ${asRole}\n`)
if (asRole !== 'authenticated') {
  console.error('❌ لم يُبدَّل الدور — الفحص لا يُطبّق RLS')
  process.exit(2)
}
console.log('─── ما يجب ألّا يُقرأ ───')

const rows = await q('select company_id, breakdown from public.trust_scores')
ok('يقرأ درجات (وهذا مقصود — التقرير العلني يحتاجها)', rows.length > 0)

const withKey = rows.filter((r) => r.breakdown && 'rules_applied' in r.breakdown)
ok('لا صفّ يحمل rules_applied', withKey.length === 0,
  `${withKey.length} من ${rows.length}`)

const blob = JSON.stringify(rows)
const leaked = MODEL_TERMS.filter((t) => blob.includes(t))
ok('لا اسم من معاملات النموذج في أي صفّ', leaked.length === 0, leaked.join(', '))

const settings = await q("select value from public.system_settings where key = 'trust_score_rules'")
ok('system_settings.trust_score_rules محجوب', settings.length === 0,
  `أُرجع ${settings.length} صفّاً`)

console.log('\n─── ما يجب أن يبقى ───')
const anyLayers = rows.filter((r) => r.breakdown && 'layers' in r.breakdown)
ok('layers باقية — وهي المنتَج الذي يعرضه تقرير الثقة',
  rows.length === 0 || anyLayers.length > 0)

// غير موجودة قبل migration 170 — يُبلَّغ عنها فحصاً راسباً لا انهياراً، وإلا
// لم تُقرأ بقية النتائج.
const t = await q('select public.trust_rating_thresholds() t')
  .then((r) => r[0]?.t || {}, (e) => ({ __err: e.message.slice(0, 60) }))
if (t.__err) console.log(`     (${t.__err})`)
ok('trust_rating_thresholds تعمل للشركة', !!t.preliminary_min_reports)
ok('  وتُرجع العتبتين لا غير',
  Object.keys(t).sort().join(',') === 'full_min_reports,preliminary_min_reports',
  Object.keys(t).join(','))

await q('ROLLBACK')
await c.end()

console.log(`\n${fail ? '❌' : '✅'} ${pass} ناجح · ${fail} فاشل`)
process.exit(fail ? 1 : 0)
