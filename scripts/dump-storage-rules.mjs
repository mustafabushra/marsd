#!/usr/bin/env node
/**
 * قواعد التخزين وحدها: السياسات والمشغّلات على `storage.objects`.
 *
 * ============================================================================
 * لماذا لا تُؤخذ من pg_dump
 * ============================================================================
 * `pg_dump --schema storage` يُخرج المخطّط كلّه: إنشاءه، وثمانية جداول،
 * وسبع عشرة دالّة، ومنحاً وملكيات. وكلّها يُنشئها Supabase مع المشروع ويملكها
 * `supabase_storage_admin`.
 *
 * فلصقها في محرّر SQL يفشل بـ:
 *
 *   ERROR: 42501: permission denied for schema storage
 *
 * وهو رفضٌ صحيح: أنت لا تملك ذلك المخطّط ولا تحتاج إنشاءه.
 *
 * ============================================================================
 * وما تحتاجه فعلاً
 * ============================================================================
 * ما أضافه مرصد فوق ما يُنشئه Supabase: سياسات الرفع والقراءة، ومُشغّل
 * استهلاك التصريح. وهذه يستطيع دورك إنشاءها.
 *
 * وتُبنى هنا من فهرس القاعدة لا من نصّ النسخة: `pg_get_triggerdef` يُعيد
 * التعريف الذي تراه القاعدة نفسها، و`pg_policies` يحمل أجزاء السياسة كاملة.
 * فما يُكتب هنا هو ما هو قائم، لا ما يُظنّ أنه قائم.
 *
 *   node scripts/dump-storage-rules.mjs [backups/<المجلّد>]
 */
import pg from 'pg'
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const BOM = String.fromCharCode(0xFEFF)
const readVar = (file, name) => {
  if (!existsSync(join(root, file))) return null
  const line = readFileSync(join(root, file), 'utf8').split(/\r?\n/)
    .find((l) => l.split(BOM).join('').trim().startsWith(`${name}=`))
  return line ? line.split('=').slice(1).join('=').split(BOM).join('').trim().replace(/^["']|["']$/g, '') : null
}

const url = readVar('.env.migrations', 'DATABASE_URL')
if (!url) { console.error('\n❌ لا DATABASE_URL\n'); process.exit(2) }

let out = process.argv[2]
if (!out) {
  const b = join(root, 'backups')
  const all = existsSync(b) ? readdirSync(b).sort() : []
  out = all.length ? join('backups', all[all.length - 1]) : 'backups/storage-rules'
}
mkdirSync(join(root, out), { recursive: true })

const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await c.connect()

// ---------------------------------------------------------------------------
// السياسات — تُعاد صياغتها من أجزائها
// ---------------------------------------------------------------------------
const { rows: policies } = await c.query(`
  select policyname, tablename, cmd, permissive, roles::text[] as roles, qual, with_check
    from pg_policies
   where schemaname = 'storage'
   order by tablename, policyname`)

// ---------------------------------------------------------------------------
// المشغّلات — تعريفها كما تراه القاعدة
// ---------------------------------------------------------------------------
// تُستبعَد مشغّلات Supabase الداخلية: ما نُنشئه مرصد له دوالّ في `public`.
const { rows: triggers } = await c.query(`
  select tg.tgname,
         cl.relname as tbl,
         pg_get_triggerdef(tg.oid) as def,
         pn.nspname as fn_schema,
         p.proname as fn_name
    from pg_trigger tg
    join pg_class cl on cl.oid = tg.tgrelid
    join pg_namespace ns on ns.oid = cl.relnamespace
    join pg_proc p on p.oid = tg.tgfoid
    join pg_namespace pn on pn.oid = p.pronamespace
   where ns.nspname = 'storage'
     and not tg.tgisinternal
   order by cl.relname, tg.tgname`)

const ours = triggers.filter((t) => t.fn_schema === 'public')
const theirs = triggers.filter((t) => t.fn_schema !== 'public')

// ---------------------------------------------------------------------------
// الكتابة
// ---------------------------------------------------------------------------
const lines = []
lines.push(`-- قواعد التخزين في مرصد — السياسات والمشغّلات وحدها
--
-- لا يُنشئ هذا الملفّ مخطّط storage ولا جداوله: Supabase يُنشئها مع المشروع.
-- وما هنا هو ما أضافه مرصد فوقها.
--
-- يُلصق **بعد** schema-public.sql و seed.sql — لأن سياساته تستدعي دوالّ في
-- public (get_current_user_id، file_scan_permits) ومُشغّله يقرأ file_scans.
--
--   ${policies.length} سياسة · ${ours.length} مُشغّل
`)

lines.push(`
-- ═══════════════════════════════════════════════════════════════
-- السياسات
-- ═══════════════════════════════════════════════════════════════
`)
for (const p of policies) {
  const roles = (p.roles || []).filter((r) => r !== '-').join(', ') || 'public'
  const parts = [`create policy ${JSON.stringify(p.policyname)}`]
  parts.push(`  on storage.${p.tablename}`)
  if (p.permissive === 'RESTRICTIVE') parts.push('  as restrictive')
  parts.push(`  for ${p.cmd.toLowerCase()}`)
  parts.push(`  to ${roles}`)
  if (p.qual) parts.push(`  using (${p.qual})`)
  if (p.with_check) parts.push(`  with check (${p.with_check})`)
  lines.push(`drop policy if exists ${JSON.stringify(p.policyname)} on storage.${p.tablename};`)
  lines.push(`${parts.join('\n')};\n`)
}

lines.push(`
-- ═══════════════════════════════════════════════════════════════
-- المشغّلات
-- ═══════════════════════════════════════════════════════════════
`)
if (!ours.length) lines.push('-- (لا مشغّلات من مرصد على storage)\n')
for (const t of ours) {
  lines.push(`drop trigger if exists ${JSON.stringify(t.tgname)} on storage.${t.tbl};`)
  lines.push(`${t.def};\n`)
}

lines.push(`
-- ═══════════════════════════════════════════════════════════════
-- تحقّق
-- ═══════════════════════════════════════════════════════════════
do $verify$
declare v_p int; v_t int;
begin
  select count(*) into v_p from pg_policies where schemaname = 'storage';
  select count(*) into v_t from pg_trigger tg
    join pg_class cl on cl.oid = tg.tgrelid
    join pg_namespace ns on ns.oid = cl.relnamespace
    join pg_proc p on p.oid = tg.tgfoid
    join pg_namespace pn on pn.oid = p.pronamespace
   where ns.nspname = 'storage' and not tg.tgisinternal and pn.nspname = 'public';

  raise notice 'سياسات التخزين: % (المتوقَّع ${policies.length})', v_p;
  raise notice 'مشغّلات مرصد  : % (المتوقَّع ${ours.length})', v_t;

  if v_p < ${policies.length} then
    raise warning 'نقصت سياسات — راجع الأخطاء أعلاه';
  end if;
  if v_t < ${ours.length} then
    raise warning 'نقصت مشغّلات — بوّابة الملفّات قد لا تكون مفروضة';
  end if;
end $verify$;
`)

const file = join(root, out, 'schema-storage.sql')
writeFileSync(file, lines.join('\n'))

console.log(`\n📄 ${out}/schema-storage.sql`)
console.log(`   ${policies.length} سياسة على: ${[...new Set(policies.map((p) => p.tablename))].join(' · ')}`)
console.log(`   ${ours.length} مُشغّل من مرصد: ${ours.map((t) => t.tgname).join(' · ') || 'لا شيء'}`)
if (theirs.length) {
  console.log(`   ${theirs.length} مُشغّل من Supabase — مُستبعَد (يُنشئه المزوّد)`)
}
console.log('')
await c.end()
