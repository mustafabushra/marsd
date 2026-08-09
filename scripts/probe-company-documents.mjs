#!/usr/bin/env node
/**
 * A company added to the registry arrives with its papers, in one place.
 *
 * Adding a company asked for one file. The rest of the checklist was requested
 * afterwards from a company with no account and no reason to answer, so records
 * sat permanently incomplete and a reviewer had nothing to verify them against.
 *
 * What is proven here:
 *
 *   the required list comes from one place, and that place is the database
 *   a document row lands under the company it belongs to
 *   it records who sent it — tenant and user — not just that it arrived
 *   the storage path is the company's own folder, the same shape the phone
 *     handoff writes to, so a reviewer finds everything about a company in one
 *     place regardless of how it got there
 *   and the reviewer's join — company name, submitter, document — answers
 *     «who sent this and for which company» from the data
 *
 * Fixtures live inside a transaction that is rolled back. Storage is not
 * written: this checks the record and the path it points at, and the upload
 * itself is exercised by the browser, which is where it happens.
 *
 *   node scripts/probe-company-documents.mjs
 */

import pg from 'pg'
import { readFileSync } from 'node:fs'

const url = readFileSync('.env.migrations', 'utf8').split(/\r?\n/)
  .find((l) => l.trim().startsWith('DATABASE_URL='))?.split('=').slice(1).join('=').trim()

const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await c.connect()

let pass = 0
let fail = 0
const ok = (name, cond, detail = '') => {
  if (cond) { pass += 1; console.log(`  ✅ ${name}`) }
  else { fail += 1; console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`) }
}

try {
  await c.query('begin')

  // --- One list of required documents ----------------------------------------
  const { rows: types } = await c.query('select * from public.company_document_types()')
  const required = types.filter((t) => t.required)

  ok('قائمة الأنواع تأتي من القاعدة', types.length === 9, `جاءت ${types.length}`)
  ok('والمطلوبة أربعة', required.length === 4,
    required.map((t) => t.doc_type).join('، '))
  ok('السجل التجاري من بينها',
    required.some((t) => t.doc_type === 'commercial_registration'))
  ok('ولكل نوع اسم عربي', required.every((t) => t.label && !/^[a-z_]+$/.test(t.label)),
    required.map((t) => t.label).join('، '))

  // --- A submission -----------------------------------------------------------
  const stamp = Date.now()
  const { rows: [co] } = await c.query(`
    insert into public.companies (name, cr_number, source, status, approved)
    values ('شركة فحص المستندات', $1, 'community', 'pending', false)
    returning id`, [`D${stamp}`])

  const { rows: [tn] } = await c.query(`
    insert into public.tenants (name, cr_number, email, status, company_id)
    values ('المُرسِل', $1, 'probe.docs@example.com', 'active', $2) returning id`, [`S${stamp}`, co.id])

  const uid = `user_probe_docs_${stamp}`
  await c.query(`
    insert into public.users (id, email, role, tenant_id, status)
    values ($1, 'probe.docs@example.com', 'company_admin', $2, 'active')`, [uid, tn.id])

  // Exactly what uploadCompanyDocuments writes, for each required type.
  for (const t of required) {
    await c.query(`
      insert into public.company_documents
        (company_id, uploaded_by_tenant_id, uploaded_by_user_id, doc_type, file_url, file_name, status)
      values ($1, $2, $3, $4, $5, $6, 'pending')`,
    [co.id, tn.id, uid, t.doc_type, `${co.id}/${t.doc_type}-${stamp}.pdf`, `${t.label}.pdf`])
  }

  const { rows: docs } = await c.query(
    'select * from public.company_documents where company_id = $1', [co.id])

  ok('كل المستندات المطلوبة مسجَّلة', docs.length === required.length,
    `${docs.length} من ${required.length}`)
  ok('كلها «قيد المراجعة»', docs.every((d) => d.status === 'pending'))

  // --- One place, named by the company ----------------------------------------
  ok('كل ملف في مجلّد الشركة نفسها',
    docs.every((d) => d.file_url.startsWith(`${co.id}/`)),
    docs.map((d) => d.file_url.split('/')[0]).join(' | '))

  // The phone handoff writes `{company_id}/{doc_type}-…`. If these two ever
  // diverged a reviewer would have two places to look, which is the thing this
  // was meant to prevent.
  ok('بنفس شكل ما يكتبه التسليم من الجوال',
    docs.every((d) => new RegExp(`^${co.id}/[a-z_]+-\\d+\\.[a-z]+$`).test(d.file_url)),
    docs[0]?.file_url)

  // --- Who sent it -------------------------------------------------------------
  ok('كل مستند يحمل المُرسِل (مستأجر ومستخدم)',
    docs.every((d) => d.uploaded_by_tenant_id === tn.id && d.uploaded_by_user_id === uid))

  // The reviewer's question, answered by a join rather than by asking.
  const { rows: review } = await c.query(`
    select co.name as company, t.name as submitted_by, u.email as by_user,
           d.doc_type, d.file_name
      from public.company_documents d
      join public.companies co on co.id = d.company_id
      join public.tenants t on t.id = d.uploaded_by_tenant_id
      join public.users u on u.id = d.uploaded_by_user_id
     where d.company_id = $1
     order by d.doc_type`, [co.id])

  ok('الإدارة ترى: اسم الشركة، ومن سلّمها، وأي مستند',
    review.length === required.length
    && review.every((r) => r.company === 'شركة فحص المستندات' && r.submitted_by === 'المُرسِل' && r.by_user))

  if (review[0]) {
    console.log(`\n     مثال ما تراه الإدارة: «${review[0].company}» — سلّمها «${review[0].submitted_by}» (${review[0].by_user})`)
    review.forEach((r) => console.log(`        • ${r.doc_type} — ${r.file_name}`))
  }

  // --- And the checklist notices ------------------------------------------------
  // The company page reads company_document_checklist. If the documents landed
  // somewhere it does not look, they are filed and invisible.
  await c.query(`select set_config('request.jwt.claims', $1, true)`,
    [JSON.stringify({ sub: uid, role: 'authenticated' })])
  // The tenant already owns this company — set at insert, because
  // `guard_tenant_admin_columns` refuses to let a company account move its own
  // company_id afterwards, and it is right to.

  const { rows: [{ company_document_checklist: list }] } = await c.query(
    'select public.company_document_checklist($1)', [co.id])

  const filed = (list || []).filter((e) => e.state === 'pending')
  ok('قائمة المستندات ترى ما وصل', filed.length === required.length,
    `${filed.length} من ${required.length} — الباقي وصل لمكان لا تنظر إليه القائمة`)

} finally {
  await c.query('rollback').catch(() => {})
  await c.end()
}

console.log(fail ? `\n  ❌ ${fail} من ${pass + fail}\n` : `\n  ✅ ${pass} فحصاً — الشركة تصل بأوراقها، في مكان واحد باسمها\n`)
process.exit(fail ? 1 : 0)
