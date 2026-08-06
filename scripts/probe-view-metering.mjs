#!/usr/bin/env node
/**
 * Is the trust report actually behind the plan — on the server, not the page?
 *
 * Three things were wrong at once, and all three are checked here because each
 * of them alone gives the whole report away:
 *
 *   1. `v_company_knowledge_base` bypasses RLS and was granted to `anon`.
 *      PostgREST publishes a view at a URL like any table, and the anon key
 *      ships in the browser bundle, so the entire registry was one GET away
 *      from anybody at all.
 *
 *   2. The monthly allowance was counted correctly and enforced only in
 *      JavaScript. The report functions never asked what plan the caller was
 *      on.
 *
 *   3. The meter and the gate were written in different languages in different
 *      places, so nothing made them agree about who pays.
 *
 * Everything runs as a real company user under its own JWT claims, inside a
 * transaction that is rolled back.
 *
 *   node scripts/probe-view-metering.mjs
 */

import { readFileSync } from 'node:fs'
import pg from 'pg'

const url = readFileSync('.env.migrations', 'utf8').split(/\r?\n/)
  .find((l) => l.trim().startsWith('DATABASE_URL='))?.split('=').slice(1).join('=').trim()

const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await c.connect()

let failed = 0
const ok = (good, name, detail = '') => {
  console.log(`  ${good ? '✅' : '❌'} ${name}${detail ? ` · ${detail}` : ''}`)
  if (!good) failed++
}
const q = async (sql, p = []) => (await c.query(sql, p)).rows
const one = async (sql, p = []) => (await q(sql, p))[0]
const claims = (o) => c.query('select set_config($1,$2,true)',
  ['request.jwt.claims', JSON.stringify(o)])

/** Run something that is expected to be refused, and return the refusal. */
const refused = async (sql, p = []) => {
  await c.query('savepoint s')
  try { await c.query(sql, p); await c.query('release savepoint s'); return null }
  catch (e) { await c.query('rollback to savepoint s'); return e.message.split('\n')[0] }
}

const [user] = await q(`select u.id, u.tenant_id from public.users u
                         where u.role in ('company_admin','company_member')
                           and u.tenant_id is not null limit 1`)
const [admin] = await q("select id from public.users where role = 'platform_admin' limit 1")
// A company that somebody else owns *and that has reports*.
//
// The first version took whichever company came first, and it had none — so the
// check that the report count survives the move to SECURITY DEFINER compared
// zero against zero and passed without testing anything. That check exists
// precisely to catch the security_invoker version of this fix, where the number
// stays present and silently becomes "the reports you filed"; against a company
// with no reports the two are identical and it would have shipped.
const [co] = await q(`select c.id, c.name,
                             (select count(*) from public.reports r
                               where r.target_company_id = c.id) as reports
                        from public.companies c
                       where c.id not in (select company_id from public.tenants
                                           where company_id is not null)
                       order by (select count(*) from public.reports r
                                  where r.target_company_id = c.id) desc
                       limit 1`)

// Taken here, as the migration role, with no RLS in the way: this is the number
// the report is supposed to show every reader.
const truth = co
  ? await one('select count(*)::int n from public.reports where target_company_id = $1', [co.id])
  : { n: 0 }

if (!user || !co) { console.log('  ⚠️  لا مستخدم شركة أو لا شركة — لا يمكن الفحص'); process.exit(0) }
console.log(`\n  المستخدم: ${user.id} · الكيان: ${user.tenant_id}`)
console.log(`  شركة أخرى: ${co.name}\n`)

await c.query('begin')
try {
  // ---- 1. the views are shut --------------------------------------------
  for (const role of ['anon', 'authenticated']) {
    await c.query('savepoint v')
    await c.query(`set local role ${role}`)
    await c.query("select set_config('request.jwt.claims','',true)")
    const msg = await refused('select count(*) from public.v_company_knowledge_base')
    await c.query('rollback to savepoint v')
    ok(!!msg, `${role} لا يقرأ v_company_knowledge_base مباشرة`,
      msg ? 'مرفوض' : '⛔ قرأ السجل كاملاً')
  }
  await c.query('reset role')

  const { rows: [leak] } = await c.query(`
    select count(*)::int as n from pg_class cl
     where cl.relnamespace = 'public'::regnamespace and cl.relkind in ('v','m')
       and coalesce(array_to_string(cl.reloptions, ',') , '') !~ 'security_invoker=(true|on)'
       and exists (select 1 from information_schema.role_table_grants g
                    where g.table_schema = 'public' and g.table_name = cl.relname
                      and g.grantee in ('anon','authenticated'))`)
  ok(leak.n === 0, 'لا عرض آخر يتجاوز RLS وهو ممنوح للمتصفّح',
    leak.n ? `${leak.n} عرض` : '')

  // ---- 2. the report is shut until it is paid for -------------------------
  await c.query('set local role authenticated')
  await claims({ sub: user.id, role: 'authenticated' })

  const before = await q('select id from public.get_company_knowledge_base($1)', [co.id])
  ok(before.length === 0, 'التقرير لا يُقرأ قبل احتسابه',
    before.length ? '⛔ قُرئ مجاناً' : '')

  const tl = await q('select id from public.get_company_reports_timeline($1, 5)', [co.id])
  ok(tl.length === 0, 'وسجلّ التقارير كذلك', tl.length ? `⛔ ${tl.length} صف` : '')

  const sm = await q('select category from public.get_company_reports_summary($1)', [co.id])
  ok(sm.length === 0, 'وملخّص الفئات كذلك', sm.length ? `⛔ ${sm.length} صف` : '')

  // ---- 3. opening it charges once, and opens it ---------------------------
  const opened = await one('select public.open_company_report($1) as r', [co.id])
  ok(opened.r?.ok === true, 'الفتح ينجح', opened.r?.reason || '')

  const after = await q('select total_reports_count from public.get_company_knowledge_base($1)', [co.id])
  ok(after.length === 1, 'والتقرير صار مقروءاً')

  // The number must be the real one. security_invoker would have left this
  // non-null and quietly wrong — every company showing only the reports this
  // reader happened to file — so it is compared against the truth, not just
  // checked for being present.
  // `truth` was measured before this block put on the authenticated role. The
  // first version measured it here, under RLS — so it read 2 where the answer is
  // 6 and declared the correct number wrong. The whole point of this check is
  // that the two differ; taking the baseline from inside the restriction made it
  // impossible to pass.
  const visible = await one(
    'select count(*)::int n from public.reports where target_company_id = $1', [co.id])
  if (truth.n === 0) {
    console.log('  ⏭  لا شركة عليها تقارير — مقارنة العدد لا تُثبت شيئاً')
  } else {
    ok(Number(after[0]?.total_reports_count) === truth.n,
      'وعدد التقارير هو الحقيقي لا ما تسمح به RLS للقارئ',
      `${after[0]?.total_reports_count} مقابل الحقيقة ${truth.n}`)
    if (visible.n === truth.n) {
      console.log('  ⏭  هذا القارئ يرى كل تقارير الشركة أصلاً — المقارنة لا تميّز')
    } else {
      ok(true, `  والفرق حقيقي: RLS تُظهر له ${visible.n} فقط من ${truth.n}`)
    }
  }

  // ---- 4. the same company again is charged again -------------------------
  // This was the opposite assertion until migration 109. A revisit was free —
  // "do not pay twice for the same fact" — and the owner replaced the rule:
  // each opening is a lookup. The two halves of the meter have to move
  // together, so what is checked is not just that the second call succeeds but
  // that the number the plan reports goes up by exactly one.
  const entBefore = await one('select public.my_entitlements() as e')
  const again = await one('select public.open_company_report($1) as r', [co.id])
  ok(again.r?.ok === true && again.r?.metered === true,
    'إعادة فتح الشركة نفسها تُحتسب من جديد', JSON.stringify(again.r))

  const entAfter = await one('select public.my_entitlements() as e')
  ok(Number(entAfter.e?.usage?.searches_per_month)
     === Number(entBefore.e?.usage?.searches_per_month) + 1,
  'والعدّاد ارتفع بواحد بالضبط',
  `${entBefore.e?.usage?.searches_per_month} → ${entAfter.e?.usage?.searches_per_month}`)

  const opens = await one(`select count(*)::int n from public.audit_logs
                            where tenant_id = $1 and action = 'company_report_viewed'
                              and created_at >= date_trunc('month', now())`, [user.tenant_id])
  ok(Number(entAfter.e?.usage?.searches_per_month) === opens.n,
    'والرقم الذي تراه الباقة هو عدد الفتحات المسجَّلة',
    `الباقة=${entAfter.e?.usage?.searches_per_month} · المسجَّل=${opens.n}`)

  // Still readable after the second charge — otherwise the charge is a toll on
  // nothing.
  const reread = await q('select id from public.get_company_knowledge_base($1)', [co.id])
  ok(reread.length === 1, 'والتقرير ما زال مقروءاً بعد الاحتساب الثاني')

  // ---- 5. what happens past the allowance ---------------------------------
  // Two outcomes, not one, and the probe used to assert only the second.
  //
  // Past the plan's own allowance a lookup is paid out of the credit balance
  // when the plan earns credits, and refused when it does not. The check simply
  // asserted «blocked», which held while the first company user it found was on
  // the free plan with no credits — and stopped holding the moment row order put
  // a partner tenant first: 43 points, so the lookup was correctly paid for and
  // the probe called correct behaviour a defect.
  //
  // The ceiling is forced by lowering the plan rather than by opening a hundred
  // reports; it is read from the plan on every call, so this is the same path a
  // customer reaches on their last lookup.
  await c.query('reset role')
  const plan = await one(`select p.id, p.give_to_get_enabled from public.plans p
                            join public.subscriptions s on s.plan_id = p.id
                           where s.tenant_id = $1 limit 1`, [user.tenant_id])
  const [other] = await q(`select id from public.companies
                            where id <> $1
                              and id not in (select company_id from public.tenants
                                              where company_id is not null) limit 1`, [co.id])
  if (plan && other) {
    await c.query(`update public.plans set limits = jsonb_set(limits, '{searches_per_month}', '1')
                    where id = $1`, [plan.id])

    // (a) the plan earns credits and there is a balance: the lookup is paid for,
    //     and the balance goes down by the price of one.
    await c.query('update public.plans set give_to_get_enabled = true where id = $1', [plan.id])
    await c.query('set local role authenticated')
    await claims({ sub: user.id, role: 'authenticated' })

    const before = Number((await one('select public.my_entitlements() as e')).e?.credits ?? 0)
    const cost = Number((await one(`select (value -> 'spend' -> 'search_unlock' ->> 'points')::int p
                                      from public.system_settings where key = 'give_to_get_rules'`))?.p ?? 1)
    if (before >= cost) {
      const paid = await one('select public.open_company_report($1) as r', [other.id])
      const after = Number((await one('select public.my_entitlements() as e')).e?.credits ?? 0)
      ok(paid.r?.ok === true && after === before - cost,
        'فوق الحصة والرصيد يكفي: تُخصم نقاط ويُفتح',
        `${before} → ${after} (سعر ${cost})`)
    } else {
      console.log(`  ⏭  الرصيد ${before} لا يكفي ${cost} — مسار النقاط لم يُختبر`)
    }

    // (b) the plan does not earn credits: nothing pays for it, so it stops.
    await c.query('reset role')
    await c.query('update public.plans set give_to_get_enabled = false where id = $1', [plan.id])
    await c.query('set local role authenticated')
    await claims({ sub: user.id, role: 'authenticated' })

    const [third] = await q(`select id from public.companies
                              where id <> $1 and id <> $2
                                and id not in (select company_id from public.tenants
                                                where company_id is not null) limit 1`, [co.id, other.id])
    if (third) {
      const blocked = await one('select public.open_company_report($1) as r', [third.id])
      ok(blocked.r?.ok === false, 'وفوق الحصة بلا نقاط: يُمنع',
        blocked.r?.ok === false ? blocked.r?.reason : '⛔ مرّت رغم انتهاء الحصة')

      const still = await q('select id from public.get_company_knowledge_base($1)', [third.id])
      ok(still.length === 0, 'والتقرير الممنوع لا يُقرأ بالاستدعاء المباشر',
        still.length ? '⛔ قُرئ رغم المنع' : '')
    } else {
      console.log('  ⏭  لا شركة ثالثة — المنع لم يُختبر')
    }
    await c.query('reset role')
  }

  // ---- 6. Marsad's own staff are never metered ----------------------------
  if (admin) {
    await c.query('set local role authenticated')
    await claims({ sub: admin.id, role: 'authenticated' })
    const staff = await one('select public.open_company_report($1) as r', [co.id])
    ok(staff.r?.ok === true && staff.r?.metered === false,
      'إدارة مرصد تقرأ بلا احتساب', JSON.stringify(staff.r))
    const rows = await q('select id from public.get_company_knowledge_base($1)', [co.id])
    ok(rows.length === 1, 'وتقرأ التقرير كاملاً')
    await c.query('reset role')
  }

  // ---- 6b. a company reading its own file is never charged ----------------
  // The report about you is not a lookup of somebody else, and a company forced
  // to spend allowance to see what is being said about it would be the one
  // reader guaranteed to run out.
  const [own] = await q('select company_id from public.tenants where id = $1', [user.tenant_id])
  if (own?.company_id) {
    await c.query('set local role authenticated')
    await claims({ sub: user.id, role: 'authenticated' })
    const mine = await one('select public.open_company_report($1) as r', [own.company_id])
    ok(mine.r?.ok === true && mine.r?.metered === false,
      'الشركة تقرأ ملفها بلا احتساب', JSON.stringify(mine.r))
    const rows = await q('select id from public.get_company_knowledge_base($1)', [own.company_id])
    ok(rows.length === 1, 'وتقرأه كاملاً')
    await c.query('reset role')
  } else {
    console.log('  ⏭  هذا الكيان بلا شركة مرتبطة — إعفاء «ملف شركتك» لم يُختبر')
  }

  // ---- 7. search is not metered ------------------------------------------
  await c.query('set local role authenticated')
  await claims({ sub: user.id, role: 'authenticated' })
  const found = await q('select id from public.search_company_knowledge_base(null,null,null,50,0)')
  ok(found.length > 0, 'البحث ما زال يعمل ولا يُحتسب', `${found.length} شركة`)

  await c.query("select set_config('request.jwt.claims','',true)")
  const anonSearch = await q('select id from public.search_company_knowledge_base(null,null,null,50,0)')
  ok(anonSearch.length === 0, 'والبحث بلا جلسة لا يُرجع شيئاً',
    anonSearch.length ? `⛔ ${anonSearch.length} صف` : '')
} finally {
  await c.query('rollback').catch(() => {})
  await c.end()
}

console.log(failed ? `\n  ❌ ${failed} فحص فشل\n` : '\n  ✅ كل الفحوصات نجحت\n')
process.exit(failed ? 1 : 0)
