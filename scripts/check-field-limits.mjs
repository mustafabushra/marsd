#!/usr/bin/env node
/**
 * هل تحرس القاعدة حدود الحقول فعلاً؟
 *
 * ============================================================================
 * لماذا لا يكفي عدّ القيود
 * ============================================================================
 * قيدٌ موجود في pg_constraint ليس قيداً يعمل: قد يكون تعبيره خاطئاً، أو على
 * عمود غير الذي يُكتب فيه، أو NOT VALID على جدول لا يُكتب فيه أصلاً. فهذا لا
 * يعدّ القيود — يحاول كتابة القيمة السيّئة ويتوقّع الرفض.
 *
 * ويحاول كذلك كتابة القيمة **الصحيحة** ويتوقّع القبول. قيدٌ يرفض الجميع حارسٌ
 * كاذب: يبدو ناجحاً في اختبار الرفض ويكسر المنتج.
 *
 * يعمل داخل معاملة واحدة تُلغى في النهاية — لا يترك أثراً في البيانات.
 *
 *   npm run check:limits
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
await c.connect()

let pass = 0
let fail = 0
const ok = (n, cond, d = '') => {
  if (cond) { pass += 1; console.log(`  ✅ ${n}`) }
  else { fail += 1; console.log(`  ❌ ${n}${d ? ` — ${d}` : ''}`) }
}

/** يكتب القيمة في العمود ويعيد true إن قُبلت. يتراجع دائماً. */
async function accepts(table, col, value, keyCol, keyVal) {
  await c.query('savepoint s')
  try {
    await c.query(
      `update public.${JSON.stringify(table)} set ${JSON.stringify(col)} = $1 where ${JSON.stringify(keyCol)} = $2`,
      [value, keyVal])
    await c.query('rollback to savepoint s')
    return true
  } catch (e) {
    await c.query('rollback to savepoint s')
    if (e.code === '23514') return false          // check_violation
    throw e
  }
}

/**
 * كسابقتها، لكن القيمة تُبنى داخل الخادم.
 *
 * اختبار سقف الـ21 م.ب بإرسال ثلاثة وعشرين ميغابايت عبر الشبكة كان يستغرق
 * دقائق ثم يصطدم بـ statement_timeout. و repeat() تبني الطول نفسه في الخادم
 * بلا نقل — القيد هو المُختبَر لا عرض الحزمة.
 */
async function acceptsExpr(table, col, expr, keyCol, keyVal) {
  await c.query('savepoint s')
  try {
    await c.query(
      `update public.${JSON.stringify(table)} set ${JSON.stringify(col)} = ${expr} where ${JSON.stringify(keyCol)} = $1`,
      [keyVal])
    await c.query('rollback to savepoint s')
    return true
  } catch (e) {
    await c.query('rollback to savepoint s')
    if (e.code === '23514') return false
    throw e
  }
}

await c.query('begin')
try {
  // على companies مشغّلات تحرس الهويّة والحالة وترفع P0001. الغرض هنا فحص
  // قيود CHECK، فتُعلَن الهويّة صراحةً كي لا يعترض مشغّلٌ فيُقرأ اعتراضه
  // نتيجةً للقيد.
  const { rows: [admin] } = await c.query(
    "select id from public.users where role = 'platform_admin' order by id limit 1")
  if (!admin) { console.error('❌ لا مسؤول منصّة'); process.exit(2) }
  await c.query('select set_config($1, $2, true)',
    ['request.jwt.claims', JSON.stringify({ sub: admin.id })])

  // صفٌّ يخالف قيداً قائماً يجعل **كل** تعديل عليه يفشل بـ 23514، لأن
  // Postgres يتحقّق من قيود الصفّ كلّها عند أي كتابة. فاختيارُ صفٍّ عشوائي
  // كان يقلب النتيجة بين تشغيل وآخر: \u200Elimit 1\u200E بلا \u200Eorder by\u200E يعيد ما يشاء،
  // وما يشاؤه يتغيّر كلّما أُعيدت كتابة صفّ.
  const { rows: [co] } = await c.query(`
    select id from public.companies
     where cr_number is null or cr_number ~ '^[0-9]{10}$'
     order by created_at limit 1`)
  if (!co) { console.error('❌ لا شركة صالحة للاختبار'); process.exit(2) }
  const id = co.id

  // -------------------------------------------------------------------------
  console.log('─── حدود الطول ترفض الفائض ───')
  const TOO_LONG = [
    ['companies', 'review_reason', 1000],
    ['companies', 'status_reason', 1000],
    ['companies', 'official_status_note', 1000],
    ['companies', 'previous_names', 2000],
    ['companies', 'cr_type', 100],
  ]
  for (const [t, col, lim] of TOO_LONG) {
    ok(`${t}.${col} يرفض ${lim + 1} حرفاً`,
      !(await accepts(t, col, 'أ'.repeat(lim + 1), 'id', id)))
  }

  console.log('\n─── والحدّ نفسه يمرّ (ليس حارساً كاذباً) ───')
  for (const [t, col, lim] of TOO_LONG) {
    ok(`${t}.${col} يقبل ${lim} حرفاً`,
      await accepts(t, col, 'أ'.repeat(lim), 'id', id))
  }

  // -------------------------------------------------------------------------
  console.log('\n─── بروتوكولات تُنفَّذ عند الفتح ───')
  const EXEC_SCHEMES = [
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    '  javascript:alert(1)',
    '\tjavascript:alert(1)',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    'data:text/html,<script>alert(1)</script>',
    'data:image/svg+xml,<svg onload=alert(1)>',
    'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
  ]
  for (const v of EXEC_SCHEMES) {
    ok(`companies.website يرفض ${v.slice(0, 42).replace(/\t/g, '\\t')}`,
      !(await accepts('companies', 'website', v, 'id', id)))
  }

  console.log('\n─── وما يستعمله المنتج فعلاً يمرّ ───')
  const LEGIT = [
    ['website', 'https://example.com'],
    ['website', 'http://example.com/path?a=1'],
    ['cr_file_url', 'data:image/png;base64,iVBORw0KGgo='],
    ['cr_file_url', 'data:image/jpeg;base64,/9j/4AAQ'],
    ['cr_file_url', 'data:application/pdf;base64,JVBERi0='],
    ['cr_file_url', 'f3d25f33-53c1-43a2-b6f0-43cca367916f/1786-cr-document.jpg'],
  ]
  for (const [col, v] of LEGIT) {
    ok(`companies.${col} يقبل ${v.slice(0, 40)}`,
      await accepts('companies', col, v, 'id', id))
  }

  // -------------------------------------------------------------------------
  console.log('\n─── بريد الشركة الرسمي ───')
  for (const bad of ['not-an-email', 'a@b', 'a b@c.com', '@example.com', 'a@.com', 'a@b.']) {
    ok(`يرفض «${bad}»`, !(await accepts('companies', 'official_email', bad, 'id', id)))
  }
  for (const good of ['info@example.com', 'a.b+c@sub.example.co.uk', 'مرصد@example.com']) {
    ok(`يقبل «${good}»`, await accepts('companies', 'official_email', good, 'id', id))
  }

  // -------------------------------------------------------------------------
  console.log('\n─── المسار الحيّ لم يُكسر: حجم الاحتياط base64 ───')
  // src/lib/api.ts يسمح بـ 21 م.ب. القاعدة يجب أن تسند ذلك لا تناقضه.
  ok('يقبل data: بحجم 2 م.ب (الاحتياط القائم 1.5 م.ب)',
    await acceptsExpr('companies', 'cr_file_url',
      `'data:image/png;base64,' || repeat('A', 2000000)`, 'id', id))
  ok('يرفض ما يتجاوز 21 م.ب',
    !(await acceptsExpr('companies', 'cr_file_url',
      `'data:image/png;base64,' || repeat('A', 23000000)`, 'id', id)))

  // -------------------------------------------------------------------------
  console.log('\n─── تغطية: كم عموداً نصّياً ما زال بلا سقف ───')
  const { rows: [{ n: unbounded }] } = await c.query(`
    select count(*)::int n
      from information_schema.columns c
     where c.table_schema = 'public'
       and c.data_type in ('text', 'character varying')
       and c.character_maximum_length is null
       and c.table_name in (
         'companies', 'reports', 'disputes', 'company_requests', 'tenants',
         'claim_requests', 'support_tickets', 'partner_applications',
         'clarification_requests', 'company_data_requests')
       and c.column_name <> 'id'
       and not exists (
         select 1 from pg_constraint k
          where k.conrelid = format('public.%I', c.table_name)::regclass
            and k.contype = 'c'
            and k.conname = format('%s_%s_maxlen', c.table_name, c.column_name))`)
  ok('لا عمود نصّي بلا سقف في الجداول الحسّاسة', unbounded === 0, `${unbounded} عموداً`)

  const { rows: [{ n: nScheme }] } = await c.query(`
    select count(*)::int n from pg_constraint
     where contype='c' and connamespace='public'::regnamespace and conname ~ '_scheme$'`)
  ok('قيود البروتوكول موجودة', nScheme >= 6, `${nScheme}`)

  // كل عمود يحمل عنوان بريد يفحص شكله. الأعمدة المنطقية (email_verified،
  // email_sent) ليست عناوين ولا تُحسب.
  const { rows: mail } = await c.query(`
    select c.table_name t, c.column_name col
      from information_schema.columns c
     where c.table_schema = 'public'
       and c.column_name ~ 'email'
       and c.data_type in ('text', 'character varying')
       and c.table_name not like 'v_%'
       and not exists (
         select 1 from pg_constraint k
          where k.conrelid = format('public.%I', c.table_name)::regclass
            and k.contype = 'c'
            and k.conname = format('%s_%s_format', c.table_name, c.column_name))`)
  ok('كل عمود عنوان بريد محروس بقيد صيغة', mail.length === 0,
    mail.map((m) => `${m.t}.${m.col}`).join(', '))

  // -------------------------------------------------------------------------
  console.log('\n─── صفوف قائمة تخالف قيداً ───')
  // NOT VALID لا يفحص القديم عند التركيب، لكن Postgres يتحقّق من قيود الصفّ
  // **كلّها** عند أي كتابة عليه. فصفٌّ مخالف ليس مخالفاً فحسب — هو صفٌّ لا
  // يمكن تعديله إطلاقاً، وأي محاولة تُعيد خطأً لا يشرح سببه.
  //
  // ولهذا يُحصى هنا: القيد الذي لا يُفحص قديمه يتحوّل إلى عطلٍ صامت.
  const { rows: ks } = await c.query(`
    select conrelid::regclass::text tbl, conname, pg_get_constraintdef(oid) def
      from pg_constraint
     where contype = 'c' and connamespace = 'public'::regnamespace
       and not convalidated
     order by 1, 2`)
  const broken = []
  for (const k of ks) {
    const expr = /^CHECK \((.*?)\)(?: NOT VALID)?$/s.exec(k.def)?.[1]
    if (!expr) continue
    try {
      const { rows: [r] } = await c.query(
        `select count(*)::int n from ${k.tbl} where not (${expr})`)
      if (r.n > 0) broken.push(`${k.conname} (${r.n})`)
    } catch { /* قيد يشير إلى عمود مُسقَط أو تعبير لا يُقيَّم — يُتجاوز */ }
  }
  ok(`لا صفّ قائم يخالف أياً من ${ks.length} قيداً غير مُتحقَّق منه`,
    broken.length === 0, broken.join(' · '))
} finally {
  await c.query('rollback')
  await c.end()
}

console.log(`\n${fail ? '❌' : '✅'} ${pass} ناجح · ${fail} فاشل`)
process.exit(fail ? 1 : 0)
