#!/usr/bin/env node
/**
 * Demo companies and reports, for seeing how search behaves against variety.
 *
 * Search cannot be judged against three rows. Filters by sector and city sort
 * nothing when every company shares one of each; a trust score means nothing
 * until scores differ; risk bands are invisible until some company is actually
 * risky. This creates spread deliberately — sectors, cities, sizes, and a range
 * of payment behaviour from spotless to defaulted, including companies with too
 * few reports to score, which is its own case the UI has to handle.
 *
 * Every row is marked DEMO_MARKER in cr_number, so removal is exact:
 *   node scripts/seed-demo-data.mjs --clean
 *
 * Runs over the direct connection. RLS restricts inserts to the caller's own
 * tenant, and these belong to several.
 */

import { readFileSync } from 'node:fs'
import pg from 'pg'

const MARKER = 'DEMO'
const url = readFileSync('.env.migrations', 'utf8').split('\n')
  .find((l) => l.trim().startsWith('DATABASE_URL=')).split('=').slice(1).join('=').trim()
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await db.connect()

// ---------------------------------------------------------------- clean ----
if (process.argv.includes('--clean')) {
  const { rows } = await db.query(`select id from public.companies where cr_number like $1`, [`${MARKER}%`])
  const ids = rows.map((r) => r.id)
  if (ids.length) {
    await db.query('delete from public.trust_scores where company_id = any($1)', [ids])
    await db.query('delete from public.reports where target_company_id = any($1)', [ids])
    await db.query('delete from public.watchlist_items where company_id = any($1)', [ids])
    await db.query('delete from public.companies where id = any($1)', [ids])
  }
  console.log(`\n  حُذفت ${ids.length} شركة تجريبية وكل ما يتبعها\n`)
  await db.end()
  process.exit(0)
}

// --------------------------------------------------------------- fixture ----
// Spread across sectors, cities and sizes. `profile` decides the reports each
// one gets, and through them its score — nothing is assigned a score directly.
const COMPANIES = [
  { name: 'شركة الرياض للمقاولات العامة',      sector: 'المقاولات والإنشاءات', city: 'الرياض',      size: 'كبيرة',        profile: 'excellent' },
  { name: 'مؤسسة الخليج للتجارة',              sector: 'التجارة',              city: 'جدة',         size: 'متوسطة',       profile: 'excellent' },
  { name: 'شركة نجد للنقل واللوجستيات',        sector: 'النقل واللوجستيات',    city: 'الدمام',      size: 'كبيرة',        profile: 'good' },
  { name: 'شركة الشرق الأوسط لتقنية المعلومات', sector: 'تقنية المعلومات',      city: 'الرياض',      size: 'متوسطة',       profile: 'good' },
  { name: 'مصنع الوطنية للبلاستيك',            sector: 'الصناعة',              city: 'الجبيل',      size: 'كبيرة',        profile: 'mixed' },
  { name: 'شركة البحر الأحمر للسياحة',         sector: 'السياحة والضيافة',     city: 'جدة',         size: 'صغيرة',        profile: 'mixed' },
  { name: 'مؤسسة القصيم للأغذية',              sector: 'الأغذية والمشروبات',   city: 'بريدة',       size: 'صغيرة',        profile: 'poor' },
  { name: 'شركة الأفق للمقاولات',              sector: 'المقاولات والإنشاءات', city: 'مكة المكرمة', size: 'متوسطة',       profile: 'poor' },
  { name: 'شركة تبوك للخدمات الطبية',          sector: 'الرعاية الصحية',       city: 'تبوك',        size: 'متوسطة',       profile: 'thin' },
  { name: 'مؤسسة عسير للتعليم',                sector: 'التعليم',              city: 'أبها',        size: 'صغيرة',        profile: 'thin' },
  { name: 'شركة الساحل العقارية',              sector: 'العقارات',             city: 'الخبر',       size: 'متوسطة',       profile: 'none' },
  { name: 'شركة المدينة للطاقة',               sector: 'الطاقة',               city: 'المدينة المنورة', size: 'كبيرة',   profile: 'none' },
]

// Payment behaviour per profile.
//
// `mix` is the spread of payment_commitment across a company's reports, which is
// what actually separates one profile from another. A single value per profile
// produced no middle: everything that paid on time scored in the nineties and
// everything else in the thirties, leaving the medium risk band — a third of the
// interface — with nothing in it to look at. Real companies are mixtures, and
// the seed has to be one too.
const PROFILES = {
  excellent: { n: 6, mix: ['full', 'full', 'full', 'full', 'full', 'full'],     delay: [0, 3],    defaultRate: 0 },
  good:      { n: 5, mix: ['full', 'full', 'full', 'late', 'full'],             delay: [3, 14],   defaultRate: 0 },
  mixed:     { n: 5, mix: ['full', 'late', 'full', 'partial', 'late'],          delay: [10, 30],  defaultRate: 0.1 },
  poor:      { n: 6, mix: ['late', 'default', 'partial', 'default', 'late', 'default'], delay: [60, 120], defaultRate: 0.5 },
  thin:      { n: 2, mix: ['full', 'late'],                                     delay: [0, 12],   defaultRate: 0 },  // under the 5-report threshold
  none:      { n: 0 },
}

const CATEGORIES = ['late_payment', 'no_payment', 'contract_breach', 'quality', 'execution_delay', 'dispute']
const AMOUNTS = ['أقل من 50 ألف', '50–200 ألف', '200 ألف – مليون', 'أكثر من مليون']
const pick = (a) => a[Math.floor(Math.random() * a.length)]
const between = ([lo, hi]) => lo + Math.floor(Math.random() * (hi - lo + 1))

const { rows: tenants } = await db.query('select id from public.tenants order by created_at limit 3')
if (!tenants.length) { console.error('  لا توجد كيانات — أنشئ شركة أولاً'); await db.end(); process.exit(1) }

console.log('\n  إنشاء بيانات تجريبية:\n')
let madeCompanies = 0
let madeReports = 0

for (const [i, c] of COMPANIES.entries()) {
  const cr = `${MARKER}${String(1000000 + i)}`

  const { rows: [company] } = await db.query(
    `insert into public.companies (name, cr_number, sector, city, enterprise_size, status, approved, source, verified, created_at)
     values ($1, $2, $3, $4, $5, 'active', true, 'community', $6, now() - ($7 || ' days')::interval)
     on conflict (cr_number) do update set name = excluded.name, sector = excluded.sector, city = excluded.city
     returning id`,
    [c.name, cr, c.sector, c.city, c.size, c.profile === 'excellent' || c.profile === 'good', 30 + i * 5],
  )
  madeCompanies++

  const p = PROFILES[c.profile]
  await db.query('delete from public.reports where target_company_id = $1', [company.id])

  for (let r = 0; r < p.n; r++) {
    const defaulted = Math.random() < (p.defaultRate || 0)
    // BR-05 is enforced by a trigger, not only by the form, and it compares
    // against now rather than against the new report's date: once a tenant has
    // a report on a company inside the last 90 days, it can add no other until
    // that one ages out. So each tenant gets at most one recent report per
    // company. Reports cycle through the tenants; the first pass is dated well
    // beyond the window and the second is recent, and the older ones are written
    // first so the rule is satisfied rather than circumvented.
    const round = Math.floor(r / tenants.length)
    const daysAgo = round === 0
      ? 260 + r * 15                       // outside the window
      : 15 + (r % tenants.length) * 8      // inside it, one per tenant
    await db.query(
      `insert into public.reports
        (reporter_tenant_id, target_company_id, status, category, report_type, payment_commitment,
         delay_days, defaulted, deal_amount_range, dealt_at, submitted_at, approved_at, created_at, title, description)
       values ($1,$2,'approved',$3,'transaction',$4,$5,$6,$7,
               now() - ($8 || ' days')::interval, now() - ($8 || ' days')::interval,
               now() - ($9 || ' days')::interval, now() - ($8 || ' days')::interval, $10, $11)`,
      [
        tenants[r % tenants.length].id,
        company.id,
        defaulted ? 'no_payment' : pick(CATEGORIES),
        defaulted ? 'default' : p.mix[r % p.mix.length],
        between(p.delay),
        defaulted,
        pick(AMOUNTS),
        daysAgo,
        daysAgo - 5,
        `تعامل تجاري مع ${c.name}`,
        'تقرير تجريبي لاختبار البحث والمؤشرات.',
      ],
    )
    madeReports++
  }

  // The score follows from the reports rather than being asserted: a company
  // whose reports say it pays late must not be able to show a clean score.
  const { rows: [agg] } = await db.query(
    `select count(*)::int as n,
            count(*) filter (where payment_commitment = 'full')::int as ontime,
            count(*) filter (where defaulted)::int as defaults,
            coalesce(avg(delay_days), 0)::int as avg_delay
     from public.reports where target_company_id = $1 and status = 'approved'`,
    [company.id],
  )

  await db.query('delete from public.trust_scores where company_id = $1', [company.id])
  if (agg.n > 0) {
    const score = Math.max(5, Math.min(98, Math.round(
      50 + (agg.ontime / agg.n) * 45 - (agg.defaults / agg.n) * 40 - Math.min(20, agg.avg_delay / 5),
    )))
    const band = score >= 70 ? 'low' : score >= 40 ? 'medium' : 'high'
    // Five approved reports is the threshold the report page treats as a full
    // score; below it the product says the data is preliminary, and the seed
    // has to be able to produce that state too.
    const tier = agg.n >= 5 ? 'full' : 'preliminary'

    await db.query(
      `insert into public.trust_scores (company_id, score, risk_band, tier, approved_reports, breakdown, computed_at)
       values ($1,$2,$3,$4,$5,$6, now())`,
      [company.id, score, band, tier, agg.n,
       JSON.stringify({ official: 30, community: 50, platform: 20, on_time_pct: Math.round((agg.ontime / agg.n) * 100), avg_delay: agg.avg_delay, defaults: agg.defaults })],
    )
    console.log(`  ${c.name}  ·  ${agg.n} تقرير  ·  ${score} (${band})  ·  ${tier}`)
  } else {
    console.log(`  ${c.name}  ·  بلا تقارير — لاختبار حالة "بيانات غير كافية"`)
  }
}

console.log(`\n  ${madeCompanies} شركة · ${madeReports} تقرير معتمد`)
console.log(`  للحذف: node scripts/seed-demo-data.mjs --clean\n`)

await db.end()
