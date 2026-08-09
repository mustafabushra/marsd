#!/usr/bin/env node
/**
 * Clear the demo data, keep the real accounts and the register.
 *
 * Marsad has been carrying seed companies and test reports since it was built.
 * They were useful while nothing else existed; now that the Ministry's register
 * is the source of companies, they are noise that a reviewer has to tell apart
 * from real submissions.
 *
 * ============================================================================
 * What survives
 * ============================================================================
 *   the two platform administrators
 *   «يلا تاسك» and «مرصد» — the accounts that are actually used
 *   «مرصد — المنصّة» — the tenant Marsad files its own reports under, which is
 *     not optional: `admin_create_report` resolves the reporter to it by a
 *     reserved registration number, and without it the admin report screen
 *     stops working
 *   every company that came from the government register
 *   the register itself, untouched
 *
 * Everything else goes, and everything attached to it: reports, documents,
 * scores, watchlists, notifications, subscriptions.
 *
 * ============================================================================
 * One transaction
 * ============================================================================
 * Deleting across a dozen tables with foreign keys between them either
 * completes or does not. Half a deletion leaves rows pointing at things that no
 * longer exist, which is worse than either outcome.
 *
 *   node scripts/reset-demo-data.mjs            # يعرض ما سيُحذف، بلا حذف
 *   node scripts/reset-demo-data.mjs --confirm  # ينفّذ
 */

import pg from 'pg'
import { readFileSync } from 'node:fs'

const CONFIRM = process.argv.includes('--confirm')

// Identified by e-mail rather than by name. A name is edited from the admin
// panel; the day somebody renames «يلا تاسك», a match on the name would delete
// the account this script exists to protect.
const KEEP_TENANT_EMAILS = [
  'mustafa.bushra1779@gmail.com',   // مرصد
  'mustafabushra.1779@gmail.com',   // يلا تاسك
  'platform@marsad.sa',             // مرصد — المنصّة
]

const url = readFileSync('.env.migrations', 'utf8').split(/\r?\n/)
  .find((l) => l.trim().startsWith('DATABASE_URL='))?.split('=').slice(1).join('=').trim()

const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await c.connect()
await c.query('set statement_timeout = 0')

try {
  await c.query('begin')

  // --- What stays -------------------------------------------------------------
  const { rows: keptTenants } = await c.query(
    'select id, name, company_id from public.tenants where email = any($1)', [KEEP_TENANT_EMAILS])

  if (keptTenants.length !== KEEP_TENANT_EMAILS.length) {
    // Refused rather than guessed at. Deleting on the strength of a list that
    // did not fully resolve is how the wrong account goes.
    throw new Error(
      `توقّعت ${KEEP_TENANT_EMAILS.length} حسابات محفوظة ووجدت ${keptTenants.length} — لم أحذف شيئاً`)
  }

  const keepTenantIds = keptTenants.map((t) => t.id)
  const keepCompanyIds = keptTenants.map((t) => t.company_id).filter(Boolean)

  const { rows: [before] } = await c.query(`
    select (select count(*) from public.companies)::int co,
           (select count(*) from public.tenants)::int tn,
           (select count(*) from public.users)::int us,
           (select count(*) from public.reports)::int rp,
           (select count(*) from public.government_company_registry)::int gv`)

  // Companies that stay: the kept accounts', and anything the register produced.
  const { rows: keptCompanies } = await c.query(`
    select id, name from public.companies
     where id = any($1::uuid[]) or government_company_id is not null`, [keepCompanyIds])

  const keepCoIds = keptCompanies.map((x) => x.id)

  console.log('\n  يبقى:')
  keptTenants.forEach((t) => console.log(`    حساب   ${t.name}`))
  keptCompanies.forEach((x) => console.log(`    شركة   ${x.name}`))

  // --- What goes ---------------------------------------------------------------
  // Order matters only where a foreign key would refuse; the rest is grouped so
  // the counts read as one operation rather than a list of table names.
  const gone = {}
  const wipe = async (label, sql, params = []) => {
    const r = await c.query(sql, params)
    gone[label] = (gone[label] || 0) + r.rowCount
  }

  // Everything hanging off the companies that are going.
  await wipe('تقارير', `delete from public.reports where target_company_id <> all($1::uuid[])`, [keepCoIds])
  await wipe('تقارير', `delete from public.reports where reporter_tenant_id <> all($1::uuid[])`, [keepTenantIds])
  await wipe('مستندات', `delete from public.company_documents where company_id <> all($1::uuid[])`, [keepCoIds])
  await wipe('درجات ثقة', `delete from public.trust_scores where company_id <> all($1::uuid[])`, [keepCoIds])
  await wipe('قوائم مراقبة', `delete from public.watchlist_items where tenant_id <> all($1::uuid[])`, [keepTenantIds])

  for (const t of ['registration_requests', 'claim_requests', 'company_data_requests']) {
    await wipe('طلبات', `delete from public.${t} where company_id is null or company_id <> all($1::uuid[])`, [keepCoIds])
  }

  await wipe('سجلّ تدقيق الشركات', `delete from public.company_audit_log where company_id <> all($1::uuid[])`, [keepCoIds])
  await wipe('اشتراكات', `delete from public.subscriptions where tenant_id <> all($1::uuid[])`, [keepTenantIds])
  await wipe('رصيد', `delete from public.credits_ledger where tenant_id <> all($1::uuid[])`, [keepTenantIds])
  await wipe('دعوات', `delete from public.pending_invites where tenant_id <> all($1::uuid[])`, [keepTenantIds])

  // Users of the accounts that are going. Platform staff are kept whatever
  // tenant they happen to sit under — they are Marsad, not a customer.
  await wipe('مستخدمون', `
    delete from public.users
     where role <> 'platform_admin'
       and (tenant_id is null or tenant_id <> all($1::uuid[]))`, [keepTenantIds])

  await wipe('إشعارات', `delete from public.notifications where tenant_id is not null and tenant_id <> all($1::uuid[])`, [keepTenantIds])
  await wipe('حسابات', `delete from public.tenants where id <> all($1::uuid[])`, [keepTenantIds])
  await wipe('شركات', `delete from public.companies where id <> all($1::uuid[])`, [keepCoIds])

  const { rows: [after] } = await c.query(`
    select (select count(*) from public.companies)::int co,
           (select count(*) from public.tenants)::int tn,
           (select count(*) from public.users)::int us,
           (select count(*) from public.reports)::int rp,
           (select count(*) from public.government_company_registry)::int gv`)

  console.log('\n  يُحذف:')
  Object.entries(gone).forEach(([k, v]) => v && console.log(`    ${k.padEnd(22)} ${v}`))

  console.log('\n  ' + '─'.repeat(46))
  console.log(`    شركات        ${before.co} → ${after.co}`)
  console.log(`    حسابات       ${before.tn} → ${after.tn}`)
  console.log(`    مستخدمون     ${before.us} → ${after.us}`)
  console.log(`    تقارير       ${before.rp} → ${after.rp}`)
  console.log(`    السجل الحكومي ${before.gv} → ${after.gv}  (لم يُمسّ)`)

  if (after.gv !== before.gv) {
    throw new Error('السجل الحكومي تغيّر — أُلغي كل شيء')
  }

  if (CONFIRM) {
    await c.query('commit')
    console.log('\n  ✅ نُفّذ\n')
  } else {
    await c.query('rollback')
    console.log('\n  ⓘ تجربة — لم يُحذف شيء. أضف --confirm للتنفيذ.\n')
  }
} catch (e) {
  await c.query('rollback').catch(() => {})
  console.log(`\n  ❌ ${e.message}\n     لم يتغيّر شيء — العملية كلها في معاملة واحدة.\n`)
  process.exitCode = 1
} finally {
  await c.end()
}
