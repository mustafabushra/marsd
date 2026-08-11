#!/usr/bin/env node
/**
 * The seven roles, checked where the answer actually matters.
 *
 * Hiding a button is a courtesy, not a control. The question this asks is not
 * «does the screen offer the action» but «does the database refuse it», because
 * the screen is not the only way to reach an RPC. Every sensitive call is made
 * directly, as each role in turn, with no interface involved.
 *
 * The role is impersonated the way PostgREST does it — request.jwt.claims with
 * a `sub` — so has_permission() resolves through get_current_user_id() exactly
 * as it does for a real request.
 *
 * Nothing here invents a role. The list is read out of role_permissions.
 *
 *   node scripts/probe-rbac.mjs
 */

import pg from 'pg'
import { readFileSync } from 'node:fs'

const url = readFileSync('.env.migrations', 'utf8').split(/\r?\n/)
  .find((l) => l.trim().startsWith('DATABASE_URL='))?.split('=').slice(1).join('=').trim()
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await db.connect()

let pass = 0
let fail = 0
const ok = (n, c, d = '') => {
  if (c) { pass += 1; console.log(`  ✅ ${n}`) }
  else { fail += 1; console.log(`  ❌ ${n}${d ? ` — ${d}` : ''}`) }
}

// Sensitive calls, paired with the permission each one requires. Chosen so that
// no role holds all of them and none holds none: every row is a refusal for
// somebody and an allowance for somebody else.
// The signatures are the real ones. A call whose arguments do not type-check
// fails in the parser, before the permission check it was meant to exercise —
// which reads as "not refused" and would score a missing control as a pass.
const NIL = '00000000-0000-0000-0000-000000000000'
const GUARDED = [
  ['import_job_publish',  'data.publish',      'select public.import_job_publish($1::uuid,$2::boolean)',              [NIL, false]],
  ['import_job_rollback', 'data.rollback',     'select public.import_job_rollback($1::uuid,$2::text)',                [NIL, 'probe']],
  ['resolve_dispute',     'disputes.resolve',  'select public.resolve_dispute($1::uuid,$2::boolean,$3::text)',        [NIL, true, 'probe']],
  ['review_document',     'documents.verify',  'select public.review_document($1::uuid,$2::boolean,$3::text)',        [NIL, true, 'probe']],
  ['admin_company_audit', 'audit.view',        'select public.admin_company_audit($1::uuid,$2::int,$3::int)',         [NIL, 5, 0]],
]

// admin_work_items is not all-or-nothing and must not be scored as if it were.
// It reads work.view_all and work.view_assigned separately and *scopes* to
// what the caller may see — a reviewer holding only view_assigned is supposed
// to get their own queue, not a refusal. What must hold is that a role with
// neither gets nothing back.
const SCOPED = ['work.view_all', 'work.view_assigned']

// The refusal is a raise in Arabic — «الفصل في الاعتراض لإدارة مرصد وحدها» and
// its siblings. Matching only the English words scored four real refusals as
// failures to refuse, which is the most dangerous direction for this to be
// wrong in.
const REFUSED = /permission|denied|not allowed|صلاحي|غير مصرّح|غير مصرح|وحده|وحدها|لإدارة مرصد/i

const TEST_ID = 'rbac_probe_user'

try {
  const { rows: roles } = await db.query(
    'select role, count(*)::int n from public.role_permissions group by role order by role')
  console.log(`\n─── ${roles.length} أدوار، كما هي في role_permissions ───`)
  ok('سبعة أدوار ولا واحد مخترع', roles.length === 7, roles.map((r) => r.role).join(', '))

  // A user row to impersonate. Removed at the end.
  await db.query(
    `insert into public.users (id, email, role)
     values ($1, 'rbac-probe@marsad.test', 'support')
     on conflict (id) do update set role = excluded.role`, [TEST_ID])

  for (const { role, n } of roles) {
    console.log(`\n─── ${role} ───`)
    await db.query('update public.users set role = $1 where id = $2', [role, TEST_ID])

    const { rows: held } = await db.query(
      'select permission_key k from public.role_permissions where role = $1', [role])
    const keys = new Set(held.map((r) => r.k))

    // Everything below runs inside one transaction carrying the claim.
    await db.query('begin')
    await db.query(`select set_config('request.jwt.claims', $1, true)`,
      [JSON.stringify({ sub: TEST_ID })])

    const { rows: mine } = await db.query('select key from public.my_permissions()')
    ok(`my_permissions() يعيد ${n}`, mine.length === n, `أعاد ${mine.length}`)
    ok('ويطابق role_permissions بالضبط',
      mine.length === keys.size && mine.every((r) => keys.has(r.key)))

    for (const [name, perm, sql, args] of GUARDED) {
      const allowed = keys.has(perm)
      let refused = false
      let msg = ''
      let code = ''
      try {
        await db.query('savepoint s')
        await db.query(sql, args)
        await db.query('rollback to savepoint s')
      } catch (e) {
        await db.query('rollback to savepoint s')
        msg = e.message
        code = e.code || ''
        // A permission refusal, not a "no such row" from the fake id above.
        refused = REFUSED.test(msg)
      }

      // 42883 undefined_function, 42804/22P02 wrong type: the call never
      // reached the guard, so it proves nothing. Say so instead of scoring it.
      if (['42883', '42804', '22P02', '42601'].includes(code)) {
        fail += 1
        console.log(`  ❌ ${name} — توقيع الفحص خاطئ، لم يبلغ الحارس: ${msg.slice(0, 80)}`)
        continue
      }

      ok(`${name} ${allowed ? 'مسموح' : 'مرفوض'} (${perm})`,
        allowed ? !refused : refused,
        allowed ? `رُفض رغم الصلاحية: ${msg.slice(0, 70)}` : `لم يُرفض — ${msg.slice(0, 70) || 'نفّذ بلا صلاحية'}`)
    }

    // The scoped call: a role holding neither key must come back empty.
    const maySeeWork = SCOPED.some((k) => keys.has(k))
    try {
      await db.query('savepoint w')
      const { rows: items } = await db.query(
        'select * from public.admin_work_items($1::text,$2::text,$3::int)', ['all', null, 50])
      await db.query('rollback to savepoint w')
      ok(maySeeWork ? 'مركز العمل يعرض ما يخصّه' : 'مركز العمل لا يعرض شيئاً بلا صلاحية',
        maySeeWork ? true : items.length === 0,
        `${items.length} عنصراً`)
    } catch (e) {
      await db.query('rollback to savepoint w')
      ok('مركز العمل لا يعرض شيئاً بلا صلاحية', !maySeeWork && REFUSED.test(e.message),
        e.message.slice(0, 70))
    }
    await db.query('rollback')
  }
} catch (e) {
  fail += 1
  console.log(`  ❌ توقّف: ${e.message.slice(0, 220)}`)
  try { await db.query('rollback') } catch { /* already out */ }
} finally {
  try { await db.query('delete from public.users where id = $1', [TEST_ID]) } catch { /* fine */ }
  await db.end()
}

console.log(fail ? `\n  ❌ ${fail} من ${pass + fail}\n` : `\n  ✅ ${pass} فحصاً — القاعدة ترفض، لا الواجهة وحدها\n`)
process.exit(fail ? 1 : 0)
