#!/usr/bin/env node
/**
 * يفصل بذور التطبيق عن بيانات المستخدمين في نسخة القاعدة.
 *
 * ============================================================================
 * الفرق الذي يقوم عليه هذا
 * ============================================================================
 * نسخة `data.sql` تحوي كل شيء: قواعد نموذج الثقة **و** بريد المستخدمين معاً.
 * والبيئة الجديدة تحتاج الأولى ولا تريد الثانية.
 *
 *   بذور التطبيق  إعدادات وقوائم مرجعية — جزءٌ من المنتج لا من المستخدمين
 *   بيانات الناس  شركات وتقارير ومستندات وسجلّات — تبقى في القديم
 *
 * ============================================================================
 * ولماذا قائمة سماح لا قائمة منع
 * ============================================================================
 * جدولٌ جديد يُضاف بعد شهر: قائمة المنع تُمرّره صامتاً إلى البيئة الجديدة —
 * وقد يحمل بيانات مستخدمين. وقائمة السماح تُسقطه صامتاً — وقد يحمل بذوراً
 * لازمة.
 *
 * فكلاهما يخطئ بصمت. ولذلك الجدول غير المصنَّف هنا **يُوقف العملية**: تصنيفه
 * قرارٌ يُتَّخذ مرّة، لا يُخمَّن كل مرّة.
 *
 *   node scripts/filter-seed-data.mjs backups/<المجلّد>
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const dir = process.argv[2] || (() => {
  const b = 'backups'
  if (!existsSync(b)) return null
  const all = readdirSync(b).sort()
  return all.length ? join(b, all[all.length - 1]) : null
})()

if (!dir || !existsSync(join(dir, 'data.sql'))) {
  console.error('\n❌ لم يُعثر على data.sql')
  console.error('   الاستخدام: node scripts/filter-seed-data.mjs backups/<المجلّد>\n')
  process.exit(2)
}

/** بذور التطبيق — تُنقل إلى البيئة الجديدة. */
const SEED = new Map([
  ['public.system_settings', 'قواعد نموذج الثقة وإعدادات المنصّة'],
  ['public.role_permissions', 'مصفوفة صلاحيات الأدوار'],
  ['public.permissions', 'تعريفات الصلاحيات'],
  ['public.plans', 'خطط الاشتراك'],
  ['public.reference_activities', 'دليل الأنشطة الاقتصادية'],
  ['public.export_templates', 'قوالب التصدير'],
  ['storage.buckets', 'تعريفات الدلاء — بدونها كل رفع يفشل'],
  // السجلّ يُنقل عمداً: المخطّط في البيئة الجديدة مأخوذ من هذه النسخة، فهو
  // عند المهاجرة نفسها. وسجلٌّ فارغ يجعل المهاجرة التالية تُطبَّق على قاعدة
  // تظنّ نفسها بكراً.
  ['public.schema_migrations', 'سجلّ المهاجرات — يوثّق حالة المخطّط'],
])

/** بيانات الناس — تبقى في البيئة القديمة. */
const USER_DATA = new Set([
  'public.users', 'public.tenants', 'public.companies', 'public.company_profiles',
  'public.reports', 'public.report_documents', 'public.report_audit_log',
  'public.company_documents', 'public.company_audit_log', 'public.company_requests',
  'public.company_request_events', 'public.company_data_requests',
  'public.claim_requests', 'public.registration_requests', 'public.join_requests',
  'public.clarification_requests', 'public.clarification_messages',
  'public.disputes', 'public.review_actions',
  'public.trust_scores', 'public.trust_score_history',
  'public.audit_logs', 'public.notifications', 'public.watchlist_items',
  'public.subscriptions', 'public.invoices', 'public.credits_ledger',
  'public.plan_change_requests', 'public.view_quota_usage',
  'public.support_tickets', 'public.support_ticket_attachments',
  'public.pending_invites', 'public.partner_applications',
  'public.file_scans', 'public.document_reads', 'public.upload_handoffs',
  'public.api_rate_limits', 'public.export_jobs', 'public.extraction_corrections',
  'public.import_jobs', 'public.import_diffs', 'public.import_job_errors',
  'public.government_company_registry',   // سجلّ رسمي مُستورَد — يُعاد استيراده لا يُنقل
  'storage.objects',                      // بيانات وصفية لملفّات لن تُنقل بايتاتها
  'storage.buckets_analytics', 'storage.buckets_vectors', 'storage.vector_indexes',
  'storage.prefixes', 'storage.migrations',
  // حالة رفع مُجزّأ عابرة يُديرها Supabase — لا بذور ولا بيانات تُنقل.
  'storage.s3_multipart_uploads', 'storage.s3_multipart_uploads_parts',
])

const src = readFileSync(join(dir, 'data.sql'), 'utf8')

// ---------------------------------------------------------------------------
// القراءة: كتلة COPY تمتدّ حتى سطر فيه `\.` وحده
// ---------------------------------------------------------------------------
const lines = src.split('\n')
const blocks = []
let head = []
let i = 0
while (i < lines.length) {
  const m = /^COPY\s+("?[\w]+"?\.\s*"?[\w]+"?)/.exec(lines[i])
  if (!m) { head.push(lines[i]); i += 1; continue }
  const table = m[1].replace(/"/g, '').replace(/\s+/g, '')
  const start = i
  i += 1
  while (i < lines.length && lines[i] !== '\\.') i += 1
  i += 1                                   // يبتلع سطر `\.`
  blocks.push({ table, rows: i - start - 2, body: lines.slice(start, i).join('\n') })
}

// ---------------------------------------------------------------------------
// التصنيف — والمجهول يُوقف
// ---------------------------------------------------------------------------
const unknown = blocks.filter((b) => !SEED.has(b.table) && !USER_DATA.has(b.table))
if (unknown.length) {
  console.error(`\n❌ ${unknown.length} جدولاً غير مصنَّف — لن يُخمَّن مصيره:\n`)
  for (const b of unknown) console.error(`   ${b.table}  (${b.rows} صفّاً)`)
  console.error(`
   صنّفه في scripts/filter-seed-data.mjs:
     SEED       إن كان إعداداً أو قائمة مرجعية — جزءاً من المنتج
     USER_DATA  إن كان يحمل بيانات أشخاص أو شركات
`)
  process.exit(1)
}

const kept = blocks.filter((b) => SEED.has(b.table))
const dropped = blocks.filter((b) => USER_DATA.has(b.table))

const out = [
  `-- بذور مرصد — مأخوذة من نسخة ${dir}`,
  '--',
  '-- بيانات التطبيق وحدها: إعدادات وقوائم مرجعية.',
  '-- ولا صفَّ واحد من بيانات المستخدمين — راجع filter-seed-data.mjs.',
  '--',
  ...kept.map((b) => `--   ${b.table}  ${b.rows} صفّاً`),
  '',
  'begin;',
  '',
  ...kept.map((b) => b.body),
  '',
  'commit;',
  '',
].join('\n')

const file = join(dir, 'seed.sql')
writeFileSync(file, out)

// ---------------------------------------------------------------------------
// تحقّق: ألا يكون تسرّب شيء
// ---------------------------------------------------------------------------
const LEAK = [
  [/@[\w.-]+\.(com|net|org|sa|io)\b/i, 'بريد إلكتروني'],
  [/\buser_[A-Za-z0-9]{20,}/, 'معرّف Clerk'],
]
const leaks = []
for (const [re, what] of LEAK) {
  const hit = re.exec(out)
  if (hit) leaks.push(`${what} — «${hit[0].slice(0, 40)}»`)
}

console.log(`\n${'═'.repeat(60)}`)
console.log(`بذور  → ${kept.length} جدولاً`)
for (const b of kept) {
  console.log(`   ${b.table.padEnd(30)} ${String(b.rows).padStart(5)} صفّاً   ${SEED.get(b.table)}`)
}
console.log(`\nمُستبعَد → ${dropped.length} جدولاً · ${dropped.reduce((a, b) => a + b.rows, 0)} صفّاً من بيانات المستخدمين`)

if (leaks.length) {
  console.log(`\n⚠️  فحص التسرّب وجد:`)
  leaks.forEach((l) => console.log(`   · ${l}`))
  console.log('   راجع التصنيف — قد يكون جدولٌ صُنّف بذرةً وهو يحمل بيانات أشخاص.')
} else {
  console.log('\n✅ فحص التسرّب: لا بريد ولا معرّف Clerk في الناتج')
}

console.log(`\n📄 ${file}  (${(Buffer.byteLength(out) / 1024).toFixed(0)} ك.ب)`)
console.log(`
الاستعمال على المشروع الجديد، بالترتيب:
   1) schema.sql   البنية كاملة
   2) seed.sql     هذا الملفّ
   3) ثم امنح أوّل مسؤول منصّة
`)
