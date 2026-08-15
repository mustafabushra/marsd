#!/usr/bin/env node
/**
 * يبني ملفّات تركيب تُلصق في SQL Editor — بلا Docker ولا رابط اتصال.
 *
 * ============================================================================
 * لماذا هذا موجود
 * ============================================================================
 * التركيب الطبيعي `npm run provision` يحتاج رابط اتصال ومنفذاً مفتوحاً. ومن
 * لا يملكهما — أو لا يريد وضع كلمة سرّ القاعدة على جهازه — يستطيع أن يلصق
 * SQL في لوحة Supabase.
 *
 * لكن ١٨٦ ملفّاً تُلصق واحداً واحداً هي ١٨٦ فرصة لتخطّي واحد أو عكس اثنين.
 * والخطأ لا يظهر عند اللصق — يظهر بعد أسبوع في شاشة لا تعمل.
 *
 * ============================================================================
 * الحارس بين الدفعات
 * ============================================================================
 * ١٫٤٥ م.ب أكبر من أن يُلصق مرّة، فتُقسَّم. وكل دفعة تبدأ بكتلة ترفض العمل
 * إن لم تكن سابقتها قد اكتملت — تقرأ `schema_migrations` وتعدّ.
 *
 * فلصق الدفعة الثالثة قبل الثانية يفشل **فوراً وبوضوح**، لا بعد أسبوع بشاشة
 * فارغة.
 *
 *   node scripts/build-install-sql.mjs
 *   node scripts/build-install-sql.mjs --chunk 200
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const chunkKb = Number(
  (argv.indexOf('--chunk') >= 0 ? argv[argv.indexOf('--chunk') + 1] : null) || 220)

const SRC = join(root, 'backend', 'migrations')
const OUT = join(root, 'install-sql')

const files = readdirSync(SRC)
  .filter((f) => f.endsWith('.sql'))
  .sort((a, b) => {
    // ترتيب رقمي لا أبجدي: أبجدياً يأتي 100 قبل 99، فينكسر التتابع.
    const na = parseInt(a, 10)
    const nb = parseInt(b, 10)
    if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb
    return a.localeCompare(b)
  })

if (!files.length) { console.error('❌ لا مهاجرات'); process.exit(2) }

if (existsSync(OUT)) rmSync(OUT, { recursive: true })
mkdirSync(OUT, { recursive: true })

const LEDGER = `
create table if not exists public.schema_migrations (
  filename    text primary key,
  applied_at  timestamptz not null default now(),
  checksum    text
);
`

/** يُسجّل المهاجرة في السجلّ — نفس ما يفعله run-migration.mjs بالضبط. */
const record = (name, len) => `
insert into public.schema_migrations (filename, checksum) values (${q(name)}, '${len}')
  on conflict (filename) do update set applied_at = now(), checksum = excluded.checksum;
`
const q = (s) => `'${String(s).replace(/'/g, "''")}'`

// ---------------------------------------------------------------------------
// التقسيم
// ---------------------------------------------------------------------------
const chunks = []
let cur = []
let size = 0
for (const f of files) {
  const body = readFileSync(join(SRC, f), 'utf8')
  const piece = { name: f, body, len: body.length }
  // ملفّ أكبر من الحدّ يذهب وحده: تقسيمه داخلياً يكسر كتل $$.
  if (size > 0 && size + piece.len > chunkKb * 1024) { chunks.push(cur); cur = []; size = 0 }
  cur.push(piece)
  size += piece.len
}
if (cur.length) chunks.push(cur)

// ---------------------------------------------------------------------------
// الكتابة
// ---------------------------------------------------------------------------
let done = 0
chunks.forEach((group, i) => {
  const n = i + 1
  const expected = done                     // ما يجب أن يكون مطبَّقاً قبل هذه
  const parts = []

  parts.push(`-- ═══════════════════════════════════════════════════════════════
-- مرصد — دفعة التركيب ${n} من ${chunks.length}
-- ═══════════════════════════════════════════════════════════════
--
-- ${group.length} مهاجرة · ${(group.reduce((a, p) => a + p.len, 0) / 1024).toFixed(0)} ك.ب
--
-- الصقها كاملةً في SQL Editor واضغط Run. ثم انتقل إلى الدفعة التالية.
-- الترتيب مُلزِم: هذه الدفعة ترفض العمل إن لم تكتمل ما قبلها.
-- ═══════════════════════════════════════════════════════════════
`)

  if (n === 1) {
    parts.push(LEDGER)
    parts.push(`
-- حارس: هذه الدفعة الأولى، فالقاعدة يجب أن تكون نظيفة.
do $guard$
declare v_n int;
begin
  select count(*) into v_n from public.schema_migrations;
  if v_n > 0 then
    raise exception 'القاعدة فيها % مهاجرة مطبَّقة — هذه الدفعة للقواعد النظيفة', v_n;
  end if;
  raise notice 'دفعة 1/${chunks.length} — القاعدة نظيفة، يبدأ التركيب';
end $guard$;
`)
  } else {
    parts.push(`
-- حارس: لا تعمل هذه الدفعة قبل أن تكتمل ما قبلها.
do $guard$
declare v_n int;
begin
  select count(*) into v_n from public.schema_migrations;
  if v_n < ${expected} then
    raise exception 'مطبَّق % مهاجرة، والمطلوب % قبل هذه الدفعة — الصق الدفعة ${n - 1} أوّلاً', v_n, ${expected};
  end if;
  raise notice 'دفعة ${n}/${chunks.length} — % مهاجرة مطبَّقة، يُكمَل', v_n;
end $guard$;
`)
  }

  for (const p of group) {
    parts.push(`
-- ───────────────────────────────────────────────────────────────
-- ${p.name}
-- ───────────────────────────────────────────────────────────────
`)
    parts.push(p.body.trimEnd())
    parts.push('\n')
    parts.push(record(p.name, p.len))
    done += 1
  }

  parts.push(`
do $done$
declare v_n int;
begin
  select count(*) into v_n from public.schema_migrations;
  raise notice '✅ اكتملت الدفعة ${n}/${chunks.length} — % من ${files.length} مهاجرة', v_n;
${n === chunks.length ? `  if v_n < ${files.length} then
    raise warning 'ناقص % مهاجرة', ${files.length} - v_n;
  else
    raise notice '🎉 التركيب اكتمل. التالي: امنح أوّل مسؤول منصّة.';
  end if;` : `  raise notice 'التالي: الصق الدفعة ${n + 1}';`}
end $done$;
`)

  const name = `${String(n).padStart(2, '0')}-of-${String(chunks.length).padStart(2, '0')}.sql`
  writeFileSync(join(OUT, name), parts.join('\n'))
})

// ---------------------------------------------------------------------------
// دليل
// ---------------------------------------------------------------------------
writeFileSync(join(OUT, 'README.md'), `# تركيب مرصد عبر SQL Editor

${chunks.length} دفعة · ${files.length} مهاجرة · ${(files.reduce((a, f) => a + readFileSync(join(SRC, f)).length, 0) / 1024).toFixed(0)} ك.ب

## الخطوات

افتح **Supabase → SQL Editor** على المشروع الجديد، والصق الملفّات **بالترتيب**:

${chunks.map((g, i) => `${i + 1}. \`${String(i + 1).padStart(2, '0')}-of-${String(chunks.length).padStart(2, '0')}.sql\` — ${g.length} مهاجرة`).join('\n')}

كل دفعة تطبع تقدّمها في لوحة النتائج. وإن لصقت واحدة في غير موضعها فستفشل
فوراً برسالة تقول أيّها ينقص — لا تُطبَّق نصفها.

## بعد آخر دفعة

القاعدة كاملة، **ولا مسؤول منصّة فيها**. كل تسجيل يُنتج \`company_member\`،
ولا مهاجرة تزرع مسؤولاً — وهذا مقصود: مهاجرةٌ تزرع مسؤولاً بمعرّف ثابت تزرع
باباً خلفياً في كل نسخة تُركَّب منها.

فبعد أن تسجّل دخولك في التطبيق بحساب Clerk الجديد:

\`\`\`sql
update public.users
   set role = 'platform_admin', status = 'active'
 where lower(email) = lower('you@company.com');
\`\`\`

وتحقّق:

\`\`\`sql
select id, email, role, status from public.users where role = 'platform_admin';
\`\`\`

## التحقّق من التركيب

\`\`\`sql
select count(*) from public.schema_migrations;              -- ${files.length}
select id from storage.buckets order by id;                 -- 4 دلاء
select count(*) from public.role_permissions;               -- صلاحيات الأدوار
select count(*) from public.system_settings;                -- ومنها trust_score_rules
\`\`\`

## هذا المجلّد مُولَّد

يُعاد بناؤه بـ\`npm run build:install-sql\` — ولا يُعدَّل بيد. المصدر هو
\`backend/migrations/\`.
`)

console.log(`\n✅ ${chunks.length} دفعة في install-sql/`)
chunks.forEach((g, i) => {
  const kb = (g.reduce((a, p) => a + p.len, 0) / 1024).toFixed(0)
  console.log(`   ${String(i + 1).padStart(2, '0')}-of-${String(chunks.length).padStart(2, '0')}.sql  ${String(g.length).padStart(3)} مهاجرة  ${kb.padStart(4)} ك.ب`)
})
console.log(`\n   المجموع: ${files.length} مهاجرة`)
console.log('   والترتيب مفروض: كل دفعة ترفض العمل قبل اكتمال سابقتها.\n')
