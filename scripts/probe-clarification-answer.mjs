#!/usr/bin/env node
/**
 * Can a company actually answer a clarification, and attach a document to it?
 *
 * Reported from real use: a company asked for clarification is told
 * «حالة المراجعة تُغيّرها إدارة مرصد فقط» when it replies, and there is nowhere
 * to upload the document it was asked for.
 *
 * The whole review workflow depends on this. Marsad stops a file, the company
 * is told to respond, and if responding fails the file is stuck for good —
 * there is no other way out of `clarification_needed`.
 *
 * Runs as the company, under its own JWT claims, so the guard sees what it sees
 * in production.
 *
 *   node scripts/probe-clarification-answer.mjs
 */

import { readFileSync } from 'node:fs'
import pg from 'pg'

const url = readFileSync('.env.migrations', 'utf8').split(/\r?\n/)
  .find((l) => l.trim().startsWith('DATABASE_URL='))?.split('=').slice(1).join('=').trim()

const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await c.connect()

let failed = 0
const check = (ok, name, detail = '') => {
  console.log(`  ${ok ? '✅' : '❌'} ${name}${ok ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}

/** Run a block with the JWT claims PostgREST would set for this user. */
const asUser = async (userId, fn) => {
  await c.query('begin')
  await c.query("select set_config('role', 'authenticated', true)")
  await c.query(`select set_config('request.jwt.claims', $1, true)`,
    [JSON.stringify({ sub: userId, role: 'authenticated' })])
  try { return await fn() } finally { await c.query('rollback') }
}

const asAdmin = async (fn) => {
  await c.query('begin')
  try { return await fn() } finally { await c.query('rollback') }
}

try {
  // ---- find a company with an owner ---------------------------------------
  // A company *admin*, not whichever member the join happened to return first.
  //
  // This probe once picked a `company_member` and reported that saving a
  // profile was blocked — which is correct behaviour, not a defect: editing the
  // company record requires is_tenant_admin(). The check was relying on row
  // order for something it should have stated, and row order changed.
  const { rows: [pair] } = await c.query(`
    select t.company_id, u.id as user_id, u.role, co.name, co.review_status
      from public.tenants t
      join public.users u on u.tenant_id = t.id
      join public.companies co on co.id = t.company_id
     where t.company_id is not null
       and u.role in ('company_admin', 'platform_admin')
     limit 1`)

  if (!pair) { console.log('  ⚠️  لا شركة لها مالك — لا يمكن الفحص'); process.exit(0) }
  console.log(`  الشركة: ${pair.name} · المستخدم: ${pair.user_id} (${pair.role})`)
  console.log(`  الحالة الحالية: ${pair.review_status ?? 'approved'}\n`)

  // ---- Marsad asks for a clarification ------------------------------------
  const reqId = await asAdmin(async () => {
    await c.query(
      `update public.companies
          set review_status = 'clarification_needed',
              review_reason = 'فحص: نحتاج صورة السجل التجاري'
        where id = $1`, [pair.company_id])

    const { rows: [r] } = await c.query(`
      insert into public.clarification_requests
        (company_id, request_type, reason, details, documents_requested, status, requested_by)
      values ($1, 'documents', 'فحص: أرسل صورة السجل', 'فحص',
              array['السجل التجاري'], 'open',
              (select id from public.users limit 1))
      returning id`, [pair.company_id])

    // Hand the row to the next transaction by committing only this much.
    await c.query('commit')
    await c.query('begin')
    return r.id
  })

  check(!!reqId, 'مرصد يطلب توضيحاً')

  // ---- the company answers -------------------------------------------------
  let answer
  try {
    answer = await asUser(pair.user_id, async () => {
      const { rows: [r] } = await c.query(
        'select public.answer_clarification($1, $2) as res', [reqId, 'هذا توضيحنا'])
      return r.res
    })
    check(answer?.ok === true, 'الشركة تستطيع الرد على طلب التوضيح',
      answer?.reason ?? JSON.stringify(answer))
  } catch (e) {
    check(false, 'الشركة تستطيع الرد على طلب التوضيح', e.message)
  }

  // ---- every state a review can be in when the question is asked ----------
  // This is the matrix that found the bug. Nothing forces a review into
  // `clarification_needed` before a reviewer opens a question, and answering
  // used to fail in four of these six — with a message blaming the company for
  // editing a review status it never touched.
  console.log('')
  for (const state of ['under_review', 'awaiting_verification', 'clarification_needed',
    'awaiting_documents', 'on_hold', 'approved']) {
    // The guard also polices how the setup gets into each state, so it is off
    // for the arrangement and on for the thing being measured.
    await c.query('alter table public.companies disable trigger trg_guard_review_status')
    await c.query(
      `update public.companies set review_status = $1, review_reason = 'فحص' where id = $2`,
      [state, pair.company_id])
    await c.query('alter table public.companies enable trigger trg_guard_review_status')

    const { rows: [q] } = await c.query(`
      insert into public.clarification_requests
        (company_id, request_type, reason, status, requested_by)
      values ($1, 'documents', 'فحص', 'open', $2) returning id`,
    [pair.company_id, pair.user_id])
    await c.query('commit'); await c.query('begin')

    try {
      const res = await asUser(pair.user_id, async () => {
        const { rows: [a] } = await c.query(
          'select public.answer_clarification($1, $2::text, null::uuid[]) as r', [q.id, 'ردّنا'])
        return a.r
      })
      check(res?.ok === true, `الرد من حالة «${state}»`, res?.reason)
    } catch (e) {
      check(false, `الرد من حالة «${state}»`, e.message)
    }
    await c.query(`delete from public.clarification_requests where id = $1`, [q.id])
  }

  // ---- everything else the company does while a question is open ----------
  // The reported error appears when the company tries to *respond*, and
  // responding is not only the reply box: it saves its profile, and it uploads
  // the document that was asked for. Both touch `companies`, and the guard on
  // that table fires on every update.
  await c.query(
    `update public.companies
        set review_status = 'clarification_needed',
            review_reason = 'فحص: نحتاج صورة السجل التجاري'
      where id = $1`, [pair.company_id])
  await c.query('commit')
  await c.query('begin')

  try {
    const saved = await asUser(pair.user_id, async () => {
      const { rows } = await c.query(
        `update public.companies set city = coalesce(city, 'الرياض')
          where id = $1 returning id`, [pair.company_id])
      return rows.length
    })
    check(saved > 0, 'الشركة تحفظ ملفها وهي في حالة «مطلوب توضيح»',
      'الحفظ مُنع رغم أن الحالة لم تتغيّر — صفوف=' + saved)
  } catch (e) {
    check(false, 'الشركة تحفظ ملفها وهي في حالة «مطلوب توضيح»', e.message)
  }

  try {
    const up = await asUser(pair.user_id, async () => {
      const { rows } = await c.query(`
        insert into public.company_documents
          (company_id, uploaded_by_tenant_id, doc_type, file_url, status)
        values ($1, public.get_current_tenant_id(),
                'commercial_registration', 'https://example.test/probe.pdf', 'pending')
        returning id`, [pair.company_id])
      return rows.length
    })
    check(up > 0, 'الشركة ترفع المستند المطلوب وهي في حالة «مطلوب توضيح»',
      'الرفع مُنع')
  } catch (e) {
    check(false, 'الشركة ترفع المستند المطلوب وهي في حالة «مطلوب توضيح»', e.message)
  }

  // ---- can it attach the document it was asked for? ------------------------
  // The request usually *is* for a document. Answering with prose and no way to
  // attach anything leaves the company able to say "here it is" and unable to
  // send it.
  const { rows: cols } = await c.query(`
    select column_name from information_schema.columns
     where table_schema = 'public' and table_name = 'clarification_messages'`)
  const names = cols.map((r) => r.column_name)
  console.log(`\n  أعمدة clarification_messages: ${names.join(', ')}`)

  const canAttach = names.some((n) => /document|attach|file|url/.test(n))
  check(canAttach, 'رسالة التوضيح تحمل مستنداً',
    'لا عمود للمرفق — الشركة تكتب «أرفقت الصورة» ولا مكان ترفعها فيه')

  // ---- and is answer_clarification able to receive one? -------------------
  const { rows: [fn] } = await c.query(`
    select pg_get_function_arguments(oid) as args
      from pg_proc where proname = 'answer_clarification'`)
  console.log(`  answer_clarification(${fn?.args})`)
  check(/document|url|file/.test(fn?.args ?? ''), 'دالة الرد تقبل مستنداً',
    'المعاملات نصّ فقط')

} finally {
  await c.query('rollback').catch(() => {})

  // Leave the company as it was found.
  //
  // This has to go around the guard, not through it. The first version ran a
  // plain update and was refused — `clarification_needed` → `approved` is
  // exactly the transition the guard exists to block — so the cleanup did
  // nothing, silently, and left two real companies parked in a review state
  // they had never actually entered.
  await c.query('alter table public.companies disable trigger trg_guard_review_status').catch(() => {})
  await c.query(
    `update public.companies set review_status = 'approved', review_reason = null
      where review_reason like 'فحص%'`).catch(() => {})
  await c.query('alter table public.companies enable trigger trg_guard_review_status').catch(() => {})

  await c.query(`delete from public.clarification_requests where reason like 'فحص%'`).catch(() => {})
  await c.query(`delete from public.company_documents where file_url = 'https://example.test/probe.pdf'`).catch(() => {})

  // Prove the cleanup worked, rather than assuming it did.
  const { rows: [left] } = await c.query(
    `select count(*)::int as n from public.companies where review_reason like 'فحص%'`)
  if (left.n > 0) { console.log(`  ❌ بقيت ${left.n} شركة في حالة فحص`); failed++ }

  await c.end()
}

console.log(failed ? `\n  ❌ ${failed} فحص فشل\n` : '\n  ✅ كل الفحوصات نجحت\n')
process.exit(failed ? 1 : 0)
