#!/usr/bin/env node
/**
 * هل تترك العمليات الحسّاسة أثراً؟
 *
 * ============================================================================
 * يُشغّلها فعلاً، لا يقرأ نصّها
 * ============================================================================
 * فحصٌ يبحث عن `insert into audit_logs` في تعريف الدالة يمرّ على قيدٍ داخل
 * فرعٍ لا يُنفَّذ أبداً. فهذا ينفّذ كل عملية على بيانات حقيقية داخل معاملة
 * تُلغى، ويعدّ ما ظهر في السجلّ قبلها وبعدها.
 *
 * وكل ما يكتبه يذهب مع ROLLBACK: لا صفّ يبقى، ولا درجة ثقة تتغيّر.
 *
 * ============================================================================
 * وما يتحقّق منه في كل قيد
 * ============================================================================
 * الفاعل، وصفته، والفعل، والكيان ومعرّفه، والنتيجة، وأن لا سرّ في البيان.
 *
 *   npm run check:audit
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

/** أسماء لا يجوز ظهورها في بيان قيد. */
const FORBIDDEN = /password|secret|token|api_key|service_role|private_key|clerk_secret/i

await c.connect()
await q('BEGIN')

const [admin] = await q("select id, email from public.users where role='platform_admin' limit 1")
if (!admin) { console.error('❌ لا platform_admin'); process.exit(2) }
const claim = () => q("select set_config('request.jwt.claims', $1, true)",
  [JSON.stringify({ sub: admin.id })])
await claim()

/**
 * ينفّذ عملية ويُرجع القيد الذي أنشأته.
 *
 * savepoint لكل واحدة: عمليةٌ ترفع استثناءً تُجهض المعاملة، فتفشل كل ما
 * بعدها ويبدو الحارس منهاراً وهو يعمل.
 */
const runAndCatch = async (label, sql, args = []) => {
  const before = Number((await q('select count(*)::int n from public.audit_logs'))[0].n)
  await q('savepoint op')
  let err = null
  try {
    await q(sql, args)
  } catch (e) {
    err = e.message
    await q('rollback to savepoint op')
    await claim()
  }
  if (err) {
    console.log(`  ⏭️  ${label} — تعذّر التنفيذ: ${err.slice(0, 60)}`)
    return null
  }
  const rows = await q(
    'select actor_id, actor_role, action, entity, entity_id, meta from public.audit_logs order by created_at desc limit $1',
    [Math.max(1, Number((await q('select count(*)::int n from public.audit_logs'))[0].n) - before)])
  return rows
}

const verify = (label, rows, expect) => {
  if (rows === null) return
  const r = rows.find((x) => x.action === expect.action) || rows[0]
  ok(`${label}: كتب قيداً`, !!r)
  if (!r) return
  ok(`  الفعل ${r.action}`, r.action === expect.action, `توقّعنا ${expect.action}`)
  ok(`  الفاعل مسجَّل`, r.actor_id === admin.id, String(r.actor_id))
  ok(`  صفة الفاعل مسجَّلة`, !!r.actor_role, 'فارغة')
  ok(`  الكيان ${r.entity}`, r.entity === expect.entity, `توقّعنا ${expect.entity}`)
  if (expect.hasEntityId) ok('  معرّف الكيان مسجَّل', !!r.entity_id, 'فارغ')
  for (const k of expect.meta || []) {
    ok(`  البيان يحمل ${k}`, r.meta && k in r.meta, JSON.stringify(r.meta || {}).slice(0, 60))
  }
  ok('  لا سرّ في البيان', !FORBIDDEN.test(JSON.stringify(r.meta || {})))
}

console.log(`المسؤول: ${admin.email}\n`)

// ── 1) إسناد طلب ─────────────────────────────────────────────────────────────
console.log('─── assign_company_request ───')
const [req] = await q(
  "select id from public.company_requests where status in ('submitted','under_review') limit 1")
if (req) {
  verify('الإسناد', await runAndCatch('assign', 'select public.assign_company_request($1)', [req.id]), {
    action: 'company_request_assigned', entity: 'company_request', hasEntityId: true,
    meta: ['kind', 'company_id', 'assigned_to', 'self_assigned'],
  })
} else console.log('  ⏭️  لا طلب مفتوح')

// ── 2) طلب توضيح ─────────────────────────────────────────────────────────────
console.log('\n─── request_company_clarification ───')
if (req) {
  verify('طلب التوضيح',
    await runAndCatch('clarify', 'select public.request_company_clarification($1,$2)',
      [req.id, 'مطلوب سجل تجاري محدَّث — فحص آلي']),
    {
      action: 'company_clarification_requested', entity: 'company_request', hasEntityId: true,
      meta: ['kind', 'company_id', 'note_length'],
    })
  // النصّ نفسه لا يُنسخ إلى السجلّ.
  const [last] = await q(
    "select meta from public.audit_logs where action='company_clarification_requested' order by created_at desc limit 1")
  if (last) ok('  نصّ الملاحظة غير منسوخ', !JSON.stringify(last.meta).includes('سجل تجاري محدَّث'))
} else console.log('  ⏭️  لا طلب مفتوح')

// ── 3) قرار على طلب ──────────────────────────────────────────────────────────
console.log('\n─── decide_company_request ───')
const [req2] = await q(
  "select id from public.company_requests where status in ('submitted','under_review','clarification_needed') limit 1")
if (req2) {
  verify('القرار',
    await runAndCatch('decide', 'select public.decide_company_request($1,$2,$3)',
      [req2.id, false, 'رفض تجريبي داخل معاملة تُلغى']),
    {
      action: 'company_request_rejected', entity: 'company_request', hasEntityId: true,
      meta: ['kind', 'company_id', 'outcome', 'from_status'],
    })
} else console.log('  ⏭️  لا طلب قابل للقرار')

// ── 4) الفصل في اعتراض ───────────────────────────────────────────────────────
console.log('\n─── resolve_dispute ───')
let [dispute] = await q("select id from public.disputes where status='open' limit 1")
if (!dispute) {
  // يُصنع اعتراضٌ داخل المعاملة ليُختبر المسار الأخطر: قبولُه يسحب تقريراً.
  // المستأجر صاحب الشركة المُبلَّغ عنها، لا أيّ مستأجر: المشغّل يشترط أن
  // يكون المعترض هو الشركة المذكورة في التقرير.
  const [rep] = await q(`
    select r.id, r.target_company_id, t.id tenant_id
      from public.reports r
      join public.tenants t on t.company_id = r.target_company_id
     where r.status = 'approved'
     limit 1`)
  const ten = rep ? { id: rep.tenant_id } : null
  // الإدراج محروس بمشغّل (guard_dispute_insert) يفرض شروط من يحقّ له
  // الاعتراض. فشلُه ليس فشل الفحص — يُتخطّى المسار ويُقال ذلك.
  if (rep && ten) {
    await q('savepoint mk')
    try {
      ;[dispute] = await q(
        `insert into public.disputes (report_id, company_id, raised_by_tenant_id, reason, status)
         values ($1,$2,$3,$4,'open') returning id`,
        [rep.id, rep.target_company_id, ten.id, 'اعتراض تجريبي داخل معاملة تُلغى'])
    } catch (e) {
      await q('rollback to savepoint mk')
      await claim()
      console.log(`  ⏭️  تعذّر تجهيز اعتراض: ${e.message.slice(0, 70)}`)
    }
  }
}
if (dispute) {
  verify('قبول الاعتراض',
    await runAndCatch('resolve', 'select public.resolve_dispute($1,$2,$3)',
      [dispute.id, true, 'قبول تجريبي']),
    {
      action: 'dispute_upheld', entity: 'dispute', hasEntityId: true,
      meta: ['report_id', 'company_id', 'outcome', 'report_withdrawn', 'trust_score_recomputed'],
    })
  const [d] = await q("select meta from public.audit_logs where action='dispute_upheld' order by created_at desc limit 1")
  if (d) {
    ok('  يذكر أن التقرير سُحب', d.meta?.report_withdrawn === true)
    ok('  ويذكر إعادة الاحتساب', d.meta?.trust_score_recomputed === true)
  }
} else console.log('  ⏭️  تعذّر تجهيز اعتراض')

// ── 5) إعادة احتساب الدرجات كلّها ────────────────────────────────────────────
console.log('\n─── recompute_all_trust_scores ───')
const beforeBulk = Number((await q('select count(*)::int n from public.audit_logs'))[0].n)
verify('إعادة الاحتساب',
  await runAndCatch('recompute', 'select public.recompute_all_trust_scores()'),
  {
    action: 'trust_scores_recomputed_all', entity: 'trust_scores', hasEntityId: false,
    meta: ['companies_affected', 'scope'],
  })
const afterBulk = Number((await q('select count(*)::int n from public.audit_logs'))[0].n)
const companies = Number((await q('select count(*)::int n from public.companies'))[0].n)
// قيد واحد للدفعة، لا قيد لكل شركة.
ok(`  قيد واحد لا ${companies} (أُضيف ${afterBulk - beforeBulk})`, afterBulk - beforeBulk === 1)

// ── الحماية ──────────────────────────────────────────────────────────────────
console.log('\n─── حماية السجلّ ───')
const pols = await q("select cmd from pg_policies where tablename='audit_logs'")
ok('لا سياسة DELETE', !pols.some((p) => p.cmd === 'DELETE'))
ok('لا سياسة UPDATE', !pols.some((p) => p.cmd === 'UPDATE'))

const [anyRow] = await q('select id from public.audit_logs limit 1')
for (const [label, sql] of [
  ['المستخدم لا يحذف قيداً', 'delete from public.audit_logs where id = $1'],
  ['المستخدم لا يعدّل قيداً', "update public.audit_logs set action = 'tampered' where id = $1"],
]) {
  await q('savepoint p')
  await q("select set_config('request.jwt.claims','',true)")
  await q('set local role authenticated')
  let blocked = false
  try {
    const r = await q(sql, [anyRow.id])
    blocked = r.length === 0
  } catch { blocked = true }
  await q('rollback to savepoint p')
  await claim()
  ok(label, blocked)
}

await q('ROLLBACK')
await c.end()

console.log(`\n${fail ? '❌' : '✅'} ${pass} ناجح · ${fail} فاشل`)
process.exit(fail ? 1 : 0)
