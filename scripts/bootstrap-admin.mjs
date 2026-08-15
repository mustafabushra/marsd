#!/usr/bin/env node
/**
 * منح أوّل مسؤول منصّة على قاعدة نظيفة.
 *
 * ============================================================================
 * لماذا يحتاج هذا خطوة منفصلة
 * ============================================================================
 * كل تسجيل في مرصد يُنتج دور `company_member`. ولا مهاجرة تُنشئ مسؤول منصّة —
 * وهذا صحيح: مهاجرةٌ تزرع مسؤولاً بمعرّف ثابت تزرع باباً خلفياً في كل نسخة
 * تُركَّب منها.
 *
 * فالنتيجة أن القاعدة النظيفة بلا مسؤول: لا اعتماد شركة، ولا تدقيق مستند، ولا
 * لوحة إدارة. وهي حالةٌ تُكتشف بعد النشر عادةً، حين يُسأل «لماذا لا أرى شيئاً».
 *
 * ============================================================================
 * ولماذا بالبريد لا بالمعرّف
 * ============================================================================
 * معرّف Clerk سلسلةٌ لا تُحفظ ولا تُملى في الهاتف. والبريد هو ما يعرفه صاحبه.
 * والسكربت يبحث به، ويعرض ما وجد **قبل** أن يمنح، ويرفض إن وجد أكثر من واحد.
 *
 *   node scripts/bootstrap-admin.mjs --env .env.company --email you@company.com
 */
import pg from 'pg'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const arg = (n, d = null) => {
  const i = argv.indexOf(n)
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d
}

const ENV_FILE = arg('--env', '.env.migrations')
const EMAIL = arg('--email')

if (!EMAIL) {
  console.error('\n  الاستخدام: node scripts/bootstrap-admin.mjs --env .env.company --email you@company.com\n')
  process.exit(2)
}

const BOM = String.fromCharCode(0xFEFF)
const readVar = (file, name) => {
  if (!existsSync(join(root, file))) return null
  const line = readFileSync(join(root, file), 'utf8').split(/\r?\n/)
    .find((l) => l.split(BOM).join('').trim().startsWith(`${name}=`))
  return line ? line.split('=').slice(1).join('=').split(BOM).join('').trim().replace(/^["']|["']$/g, '') : null
}

const url = readVar(ENV_FILE, 'DATABASE_URL')
if (!url) { console.error(`\n❌ لا DATABASE_URL في ${ENV_FILE}\n`); process.exit(2) }

const host = /@([^:/]+)/.exec(url)?.[1] || 'مجهول'
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await c.connect()

console.log(`\nالوجهة: ${host}`)

const { rows } = await c.query(
  'select id, email, role, status, tenant_id from public.users where lower(email) = lower($1)',
  [EMAIL])

if (rows.length === 0) {
  console.error(`\n❌ لا مستخدم بالبريد ${EMAIL}`)
  console.error('   سجّل دخولك في التطبيق أوّلاً — يُنشَأ صفّك عند أوّل دخول.\n')
  const { rows: any } = await c.query('select email, role from public.users order by created_at limit 5')
  if (any.length) {
    console.error('   الموجودون حالياً:')
    for (const u of any) console.error(`     ${u.email} — ${u.role}`)
    console.error('')
  }
  await c.end()
  process.exit(1)
}

if (rows.length > 1) {
  console.error(`\n❌ ${rows.length} مستخدمين بهذا البريد — لن يُمنح شيء بالتخمين.\n`)
  await c.end()
  process.exit(1)
}

const u = rows[0]
console.log(`\nالمستخدم: ${u.email}`)
console.log(`المعرّف  : ${u.id}`)
console.log(`الدور    : ${u.role} → platform_admin`)
console.log(`الحالة   : ${u.status}`)

if (u.role === 'platform_admin') {
  console.log('\n✅ هو مسؤول منصّة أصلاً — لا تغيير.\n')
  await c.end()
  process.exit(0)
}

await c.query('begin')
try {
  // الحالة تُضبط كذلك: مسؤولٌ حسابه معلَّق لا يستطيع الدخول، وهي حالةٌ
  // تُربك لأن الدور يبدو صحيحاً.
  await c.query(
    "update public.users set role = 'platform_admin', status = 'active' where id = $1", [u.id])

  // أثرٌ لأخطر منحة في النظام. actor_id هو الممنوح نفسه لأن هذا يجري خارج
  // أي جلسة — ولا يُدَّعى أن شخصاً آخر فعلها.
  await c.query(
    `insert into public.audit_logs (actor_id, action, entity, entity_id, meta)
     values ($1, 'platform_role_granted', 'user', $1, $2)`,
    [u.id, JSON.stringify({ role: 'platform_admin', via: 'bootstrap-admin', email: u.email })])

  await c.query('commit')
} catch (e) {
  await c.query('rollback')
  console.error(`\n❌ ${e.message}\n`)
  await c.end()
  process.exit(1)
}

const { rows: [after] } = await c.query('select role, status from public.users where id = $1', [u.id])
const { rows: [{ n }] } = await c.query(
  "select count(*) n from public.users where role = 'platform_admin'")

console.log(`\n✅ ${after.role} · ${after.status} — ومسؤولو المنصّة الآن: ${n}`)
console.log('   وسُجّل قيد تدقيق بالمنحة.\n')
await c.end()
