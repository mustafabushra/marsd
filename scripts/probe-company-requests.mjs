#!/usr/bin/env node
/**
 * A request has a state, and only the allowed moves change it.
 *
 * «Where did this request get to» had no answer, because a request was not
 * anything: four status columns on the company row and four unrelated tables
 * beside it, none of which knew about the others. The data showed the cost —
 * every company read `review_status = approved` while three registrations sat
 * `pending`, two columns describing the same companies and disagreeing.
 *
 * What this proves is the workflow, not the table: the moves that are allowed
 * happen, the moves that are not are refused, the decision reaches the company,
 * and every step lands on one timeline.
 *
 * The refusals matter more than the happy path. A status column that accepts
 * anything is a text field with opinions, and a workflow nobody can go around
 * backwards is the only kind worth having.
 *
 *   node scripts/probe-company-requests.mjs
 */

import pg from 'pg'
import { readFileSync } from 'node:fs'
import { pad10 } from './lib/test-ids.mjs'

const url = readFileSync('.env.migrations', 'utf8').split(/\r?\n/)
  .find((l) => l.trim().startsWith('DATABASE_URL='))?.split('=').slice(1).join('=').trim()

const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await c.connect()

let pass = 0
let fail = 0
let mark = 0

const ok = (n, cond, d = '') => {
  if (cond) { pass += 1; console.log(`  ✅ ${n}`) }
  else { fail += 1; console.log(`  ❌ ${n}${d ? ` — ${d}` : ''}`) }
}

const refuses = async (n, fn, expect) => {
  const sp = `r${(mark += 1)}`
  await c.query(`savepoint ${sp}`)
  try {
    await fn()
    await c.query(`release savepoint ${sp}`)
    fail += 1
    console.log(`  ❌ ${n} — لم يُرفض`)
  } catch (e) {
    await c.query(`rollback to savepoint ${sp}`)
    const m = !expect || e.message.includes(expect)
    if (m) { pass += 1; console.log(`  ✅ ${n}`) }
    else { fail += 1; console.log(`  ❌ ${n} — ${e.message.slice(0, 70)}`) }
  }
}

const asUser = (id) => c.query(`select set_config('request.jwt.claims', $1, true)`,
  [JSON.stringify({ sub: id, role: 'authenticated' })])

const statusOf = async (id) =>
  (await c.query('select status from public.company_requests where id = $1', [id])).rows[0]?.status

try {
  await c.query('begin')

  // --- Fixtures --------------------------------------------------------------
  const stamp = Date.now().toString().slice(-7)
  const { rows: [admin] } = await c.query(
    `select id from public.users where role = 'platform_admin' limit 1`)
  if (!admin) throw new Error('لا مدير منصة — تعذّر الإثبات')

  const { rows: [co] } = await c.query(
    `insert into public.companies (name, cr_number, source, status, approved)
     values ('شركة فحص الطلبات', $1, 'community', 'pending', false) returning id`,
    [pad10(`77${stamp}`)])

  const { rows: [tn] } = await c.query(
    `insert into public.tenants (name, cr_number, email, company_id, status)
     values ('مقدّم الطلب', $1, $2, $3, 'active') returning id`,
    [`T${stamp}`, `req.${stamp}@example.com`, co.id])

  const uid = `user_probe_req_${stamp}`
  await c.query(
    `insert into public.users (id, email, role, tenant_id, status)
     values ($1, $2, 'company_admin', $3, 'active')`,
    [uid, `req.${stamp}@example.com`, tn.id])

  // --- Opening ---------------------------------------------------------------
  await c.query(`select set_config('request.jwt.claims', '{}', true)`)
  await refuses('فتح طلب يلزمه تسجيل دخول',
    () => c.query('select public.open_company_request($1, $2)', [co.id, 'registration']),
    'تسجيل الدخول')

  await asUser(uid)
  const { rows: [{ open_company_request: reqId }] } = await c.query(
    'select public.open_company_request($1, $2)', [co.id, 'registration'])
  ok('يُفتح الطلب بحالة «مسودّة»', await statusOf(reqId) === 'draft')

  const { rows: [{ open_company_request: again }] } = await c.query(
    'select public.open_company_request($1, $2)', [co.id, 'registration'])
  ok('وفتحه مرة ثانية يُرجع نفسه', again === reqId, 'أنشأ طلباً ثانياً')

  // --- Submitting without documents --------------------------------------------
  //
  // The rule, not the courtesy. A browser check tells somebody early; this is
  // what a reviewer relies on.
  await refuses('لا يُرسَل بلا المستندات المطلوبة',
    () => c.query('select public.submit_company_request($1)', [reqId]), 'مستندات ناقصة')

  const { rows: types } = await c.query(
    'select doc_type, label from public.company_document_types() where required')
  for (const t of types) {
    await c.query(
      `insert into public.company_documents
         (company_id, uploaded_by_tenant_id, uploaded_by_user_id, doc_type, file_url, file_name, status, request_id)
       values ($1, $2, $3, $4, $5, $6, 'pending', $7)`,
      [co.id, tn.id, uid, t.doc_type, `${co.id}/${t.doc_type}.pdf`, `${t.label}.pdf`, reqId])
  }

  const { rows: [{ submit_company_request: s1 }] } = await c.query(
    'select public.submit_company_request($1)', [reqId])
  ok('وبعد إرفاقها يُرسَل', s1 === 'submitted')

  // --- Who may decide -----------------------------------------------------------
  await refuses('حساب شركة لا يقرّر على طلبه',
    () => c.query('select public.decide_company_request($1, true)', [reqId]), 'لإدارة مرصد فقط')

  await refuses('ولا يطلب توضيحاً من نفسه',
    () => c.query('select public.request_company_clarification($1, $2)', [reqId, 'أي شيء']),
    'لإدارة مرصد فقط')

  // --- Clarification --------------------------------------------------------------
  await asUser(admin.id)
  await refuses('طلب توضيح بلا سبب مرفوض',
    () => c.query('select public.request_company_clarification($1, $2)', [reqId, '   ']),
    'اكتب ما المطلوب')

  await c.query('select public.request_company_clarification($1, $2)',
    [reqId, 'شهادة الزكاة غير واضحة'])
  ok('طلب التوضيح يغيّر الحالة', await statusOf(reqId) === 'clarification_needed')

  // --- Resubmitting -----------------------------------------------------------------
  await asUser(uid)
  const { rows: [{ submit_company_request: s2 }] } = await c.query(
    'select public.submit_company_request($1)', [reqId])
  ok('وإعادة الإرسال حالة مستقلّة', s2 === 'resubmitted',
    `جاءت «${s2}» — المراجع لن يعرف أنه ردّ على طلبه`)

  // --- Deciding -----------------------------------------------------------------------
  await asUser(admin.id)
  await refuses('الرفض بلا سبب مرفوض',
    () => c.query('select public.decide_company_request($1, false, null)', [reqId]),
    'سبب الرفض مطلوب')

  // Approval now has five conditions. Documents arriving is not documents being
  // read, so the reviewer verifies each one and the company file is completed
  // before «قبول» is even offered — which is the point of the change.
  await refuses('والقبول بلا تدقيق مرفوض',
    () => c.query('select public.decide_company_request($1, true, null)', [reqId]),
    'دُقّقت')

  const { rows: docRows } = await c.query(
    `select id from public.company_documents where company_id = $1 and superseded_at is null`, [co.id])
  for (const d of docRows) {
    await c.query('select public.review_document($1, true, null)', [d.id])
  }
  await c.query(
    `update public.companies set city = 'الرياض', sector = 'مقاولات', official_email = $2 where id = $1`,
    [co.id, `req.${stamp}@example.com`])

  const { rows: [{ company_request_readiness: ready }] } = await c.query(
    'select public.company_request_readiness($1)', [reqId])
  ok('والـchecklist يقول جاهز قبل الزرّ', ready.ready === true,
    JSON.stringify(ready.checks?.filter?.((x) => !x.ok)))

  await c.query('select public.decide_company_request($1, true, $2)', [reqId, 'مطابقة'])
  ok('القبول يُغلق الطلب', await statusOf(reqId) === 'approved')

  // The join that was missing: a decision that does not reach the company is a
  // record of an opinion rather than an outcome.
  const { rows: [after] } = await c.query(
    'select status, approved from public.companies where id = $1', [co.id])
  ok('ويصل إلى الشركة نفسها', after.approved === true && after.status === 'active',
    `الشركة ما زالت ${after.status}/${after.approved}`)

  await refuses('وطلب مُغلق لا يُقرّر ثانية',
    () => c.query('select public.decide_company_request($1, false, $2)', [reqId, 'تراجع']),
    'مُغلق بالفعل')

  // --- The timeline --------------------------------------------------------------------
  const { rows: events } = await c.query(
    'select event, from_status, to_status from public.company_request_events where request_id = $1 order by created_at',
    [reqId])
  const seq = events.map((e) => e.event)
  // «submitted» twice said nothing about which arrival was which. The event
  // vocabulary now separates them, so the timeline reads as the story it is.
  //
  // Document verifications land here too: a registration that took three days
  // because a file came back twice cannot be explained by the decision alone.
  // The lifecycle is checked as its own sequence so the two do not mask each
  // other.
  const life = seq.filter((e) => !e.startsWith('document_'))
  ok('كل خطوة على خطّ زمني واحد',
    life.join(' → ') === 'created → submitted → clarification_requested → resubmitted → approved',
    seq.join(' → '))

  ok('وتدقيق كل مستند مسجَّل فيه',
    seq.filter((e) => e === 'document_verified').length === docRows.length,
    `${seq.filter((e) => e === 'document_verified').length} من ${docRows.length}`)

  const { rows: unknown } = await c.query(
    `select e.event from public.company_request_events e
      where e.request_id = $1
        and e.event not in (select t.event from public.request_event_types() t)`, [reqId])
  ok('ولا حدث خارج القاموس', unknown.length === 0, unknown.map((u) => u.event).join('، '))

  ok('والملاحظة محفوظة مع طلب التوضيح',
    (await c.query(
      `select note from public.company_request_events
        where request_id = $1 and event = 'clarification_requested'`, [reqId])).rows[0]?.note
      === 'شهادة الزكاة غير واضحة')

  // --- One open request per kind -----------------------------------------------------------
  //
  // A company may be registered, rejected, and registered again — but two in
  // flight is how a reviewer approves one and rejects the other.
  const { rows: [{ open_company_request: fresh }] } = await c.query(
    'select public.open_company_request($1, $2)', [co.id, 'registration'])
  ok('طلب جديد يُفتح بعد إغلاق السابق', fresh !== reqId)
  await refuses('لكن لا طلبان مفتوحان لنفس النوع', () => c.query(
    `insert into public.company_requests (company_id, tenant_id, requested_by, kind, status)
     values ($1, $2, $3, 'registration', 'submitted')`, [co.id, tn.id, uid]), 'duplicate')

  // --- Who sees it -------------------------------------------------------------------------
  const { rows: grants } = await c.query(`
    select privilege_type from information_schema.role_table_grants
     where table_name = 'company_requests' and grantee = 'authenticated'`)
  ok('المتصفّح يقرأ ولا يكتب',
    grants.every((g) => g.privilege_type === 'SELECT'),
    grants.map((g) => g.privilege_type).join(', '))

} finally {
  await c.query('rollback').catch(() => {})
  await c.end()
}

console.log(fail
  ? `\n  ❌ ${fail} من ${pass + fail}\n`
  : `\n  ✅ ${pass} فحصاً — للطلب حالة، وللحالة طريق واحد\n`)
process.exit(fail ? 1 : 0)
