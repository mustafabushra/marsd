#!/usr/bin/env node
/**
 * هل يستطيع مستخدم أن يمسّ ما ليس له؟
 *
 * ============================================================================
 * لماذا بهذه الطريقة
 * ============================================================================
 * قراءة السياسات لا تثبت شيئاً: سياسة صحيحة على جدول بلا RLS مفعّل لا تعمل،
 * وسياسة تحت {public} تعتمد على أن دالة الجلسة تُرجع NULL — وهو صحيح اليوم
 * وقد يتغيّر بسطر واحد.
 *
 * فهذا ينتحل أدواراً حقيقية ويحاول: القراءة عبر المستأجرين، والكتابة على
 * صفوف الغير، وتصعيد الدور، واستدعاء دوال الإدارة. الرفض هو النجاح.
 *
 * وينتحلها بـ `set local role` لا بوضع مطالبات JWT وحدها: اتصال المهاجرات
 * يملك bypassrls، فبدون تبديل الدور تكون السياسات معطَّلة والفحص يقرأ كل شيء
 * ويبدو ناجحاً وهو لا يفحص شيئاً.
 *
 * كل شيء داخل معاملة تُلغى — لا يُكتب صفّ ولا يبقى دور.
 *
 *   npm run check:authz
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
const q = async (s, a = []) => (await c.query(s, a)).rows

let pass = 0
let fail = 0
const ok = (n, cond, d = '') => {
  if (cond) { pass += 1; console.log(`  ✅ ${n}`) }
  else { fail += 1; console.log(`  ❌ ${n}${d ? ` — ${d}` : ''}`) }
}

/** يُنفّذ استعلاماً بصفة مستخدم، ويُرجع {rows, error}. */
const asUser = async (userId, sql, args = []) => {
  await q('savepoint sp')
  try {
    await q("select set_config('request.jwt.claims', $1, true)",
      [JSON.stringify({ sub: userId, role: 'authenticated' })])
    await q('set local role authenticated')
    const rows = await q(sql, args)
    await q('reset role')
    await q('release savepoint sp')
    return { rows, error: null }
  } catch (e) {
    await q('rollback to savepoint sp')
    await q('reset role').catch(() => {})
    return { rows: [], error: e.message }
  }
}

await c.connect()
await q('BEGIN')

// ---- من نختبر بهم -----------------------------------------------------------
const [admin] = await q("select id, email from public.users where role='platform_admin' limit 1")
const tenants = await q(`
  select u.id, u.email, u.role, t.id tenant_id, t.company_id, co.name
    from public.users u
    join public.tenants t on t.id = u.tenant_id
    join public.companies co on co.id = t.company_id
   where u.role in ('company_admin','company_member')
   order by u.role
   limit 4`)

if (!admin || tenants.length === 0) {
  console.error('❌ لا يوجد مستخدمون كافون للاختبار')
  process.exit(2)
}
const A = tenants[0]
const B = tenants.find((t) => t.company_id !== A.company_id)

console.log(`مسؤول المنصّة : ${admin.email}`)
console.log(`شركة أ        : ${A.name} (${A.role})`)
console.log(B ? `شركة ب        : ${B.name} (${B.role})\n` : 'شركة ب        : لا توجد ثانية — تُخطّى فحوص العزل\n')

// ---- 1) عزل المستأجرين ------------------------------------------------------
console.log('─── عزل المستأجرين ───')
if (B) {
  const r1 = await asUser(A.id, 'select id from public.tenants where id = $1', [B.tenant_id])
  ok('لا يقرأ مستأجراً آخر', r1.rows.length === 0, `${r1.rows.length} صفّاً`)

  const r2 = await asUser(A.id,
    'select id from public.notifications where user_id = $1', [B.id])
  ok('لا يقرأ إشعارات غيره', r2.rows.length === 0, `${r2.rows.length} صفّاً`)

  const r3 = await asUser(A.id,
    "select id from public.reports where reporter_tenant_id = $1", [B.tenant_id])
  ok('لا يقرأ تقارير كتبها غيره', r3.rows.length === 0, `${r3.rows.length} صفّاً`)
}

// ---- 2) IDOR على الكتابة ----------------------------------------------------
console.log('\n─── الكتابة على صفوف الغير (IDOR) ───')
if (B) {
  const w1 = await asUser(A.id,
    "update public.companies set name = name || ' [اختراق]' where id = $1 returning id",
    [B.company_id])
  ok('لا يعدّل شركة غيره', w1.rows.length === 0, w1.error ? 'رُفض' : `${w1.rows.length} صفّاً`)

  const w2 = await asUser(A.id,
    'update public.tenants set status = $2 where id = $1 returning id',
    [B.tenant_id, 'suspended'])
  ok('لا يوقف مستأجراً آخر', w2.rows.length === 0)
}

const w3 = await asUser(A.id,
  'delete from public.audit_logs where id = (select id from public.audit_logs limit 1) returning id')
ok('لا يحذف من سجلّ التدقيق', w3.rows.length === 0, w3.error ? 'رُفض' : `${w3.rows.length} صفّاً`)

// ---- 3) تصعيد الصلاحيات -----------------------------------------------------
console.log('\n─── تصعيد الصلاحيات ───')
const e1 = await asUser(A.id,
  "update public.users set role = 'platform_admin' where id = $1 returning role", [A.id])
ok('لا يرقّي نفسه مسؤول منصّة', e1.rows.length === 0, e1.error ? 'رُفض' : JSON.stringify(e1.rows))

const e2 = await asUser(A.id,
  "update public.companies set approved = true where id = $1 and approved = false returning id",
  [A.company_id])
ok('لا يعتمد شركته بنفسه', e2.rows.length === 0, e2.error ? 'رُفض' : `${e2.rows.length} صفّاً`)

const e3 = await asUser(A.id,
  "update public.trust_scores set score = 98 where company_id = $1 returning score",
  [A.company_id])
ok('لا يرفع درجة ثقته', e3.rows.length === 0, e3.error ? 'رُفض' : JSON.stringify(e3.rows))

// تُسجَّل حالة حقيقية أولاً ثم تُحاوَل إزالتها.
//
// الصيغة الأولى لهذا الفحص ضبطتها إلى 'none' وهي أصلاً كذلك، فمرّ التحديث
// بلا تغيير فعلي ولم يوقظ الحارس — وأبلغ الفحص عن ثغرة لا وجود لها. تحديثٌ
// لا يغيّر قيمة لا يختبر منعاً.
// التسجيل نفسه محروس بمشغّل يشترط صفة الإدارة، فتُوضع مطالبات المسؤول له ثم
// تُمسح — وإلا رفض الحارس تهيئتنا وسقط الفحص قبل أن يبدأ.
await q("select set_config('request.jwt.claims', $1, true)",
  [JSON.stringify({ sub: admin.id, role: 'authenticated' })])
await q("update public.companies set official_status = 'bankruptcy' where id = $1", [A.company_id])
await q("select set_config('request.jwt.claims', '', true)")
const e4 = await asUser(A.id,
  "update public.companies set official_status = 'none' where id = $1 returning official_status",
  [A.company_id])
ok('لا يمحو حالته الرسمية', e4.error !== null || e4.rows.length === 0,
  e4.error ? 'رُفض' : `صارت ${JSON.stringify(e4.rows[0]?.official_status)}`)

const e5 = await asUser(A.id,
  "update public.companies set official_status = 'none', name = name where id = $1 returning official_status",
  [A.company_id])
ok('  ولا يمحوها ضمن تعديل مشروع', e5.error !== null || e5.rows.length === 0,
  e5.error ? 'رُفض' : `صارت ${JSON.stringify(e5.rows[0]?.official_status)}`)

// ---- 4) دوال الإدارة --------------------------------------------------------
console.log('\n─── دوال الإدارة ───')
const adminFns = [
  ['admin_work_items', "select * from public.admin_work_items('all', null, 5)"],
  ['admin_work_counts', 'select public.admin_work_counts()'],
  ['admin_company_badges', 'select public.admin_company_badges()'],
  ['company_roster', 'select * from public.company_roster()'],
  ['documents_overview', "select public.documents_overview('pending')"],
  ['platform_health', 'select public.platform_health()'],
  ['admin_request_queue', "select * from public.admin_request_queue(null, 5)"],
]
for (const [name, sql] of adminFns) {
  const r = await asUser(A.id, sql)
  const empty = r.error !== null || r.rows.length === 0
    || (r.rows.length === 1 && (() => {
      const v = Object.values(r.rows[0])[0]
      return v === null || (v && typeof v === 'object' && Object.keys(v).length === 0)
    })())
  ok(`${name} مغلقة`, empty, r.error ? 'رُفض' : `${r.rows.length} صفّاً`)
}

// ---- 5) أفعال إدارية بأثر ---------------------------------------------------
console.log('\n─── أفعال إدارية ───')
const [anyReport] = await q("select id from public.reports where status='approved' limit 1")
if (anyReport) {
  const r = await asUser(A.id, 'select public.withdraw_report($1, $2)',
    [anyReport.id, 'محاولة غير مصرّح بها'])
  ok('withdraw_report مرفوضة', r.error !== null, 'نُفّذت!')
}
const [anyReq] = await q('select id from public.company_requests limit 1')
if (anyReq) {
  const r = await asUser(A.id, 'select public.decide_company_request($1, true, null)', [anyReq.id])
  ok('decide_company_request مرفوضة', r.error !== null, 'نُفّذت!')
}
const r5 = await asUser(A.id, 'select public.recompute_all_trust_scores()')
ok('recompute_all_trust_scores مرفوضة', r5.error !== null, 'نُفّذت!')

// ---- 6) الزائر غير المسجَّل --------------------------------------------------
console.log('\n─── زائر غير مسجَّل ───')
await q('savepoint anon_sp')
await q("select set_config('request.jwt.claims', '', true)")
await q('set local role anon')
for (const t of ['companies', 'reports', 'trust_scores', 'users', 'tenants',
  'company_documents', 'notifications', 'audit_logs']) {
  const n = (await q(`select count(*)::int n from public.${t}`))[0].n
  ok(`${t} لا يُقرأ بلا جلسة`, n === 0, `${n} صفّاً`)
}
await q('reset role')
await q('rollback to savepoint anon_sp')

await q('ROLLBACK')
await c.end()

console.log(`\n${fail ? '❌' : '✅'} ${pass} ناجح · ${fail} فاشل`)
process.exit(fail ? 1 : 0)
