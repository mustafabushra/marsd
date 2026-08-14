#!/usr/bin/env node
/**
 * البوّابة على قاعدة وتخزين حقيقيين.
 *
 * مجموعة الهجوم (`check:gateway`) تفحص النواة في الذاكرة. وهذه تفحص ما لا
 * تراه: أن دلو الحجر لا يُقرأ، وأن سجلّ الفحص محميّ، وأن الرفض يترك أثراً،
 * وأن ذاكرة التجزئة تعمل.
 *
 * ============================================================================
 * ما يجري وما يُتخطّى — ولماذا يُقال
 * ============================================================================
 * الجولة الكاملة تحتاج `SUPABASE_SERVICE_ROLE_KEY`، وهو لا يوجد محلياً بل في
 * بيئة Vercel وحدها. فبلا المفتاح تجري فحوص القاعدة وتُتخطّى دورة البايتات
 * (رفع → تنزيل → فحص → ترقية)، **ويُعلَن ذلك** في المخرَج.
 *
 * فحصٌ يتخطّى بصمت أسوأ من فحص غائب: يُقرأ نجاحه تغطيةً وهي ليست تغطية.
 *
 * تُشغَّل بمفتاح الهجرات (يتجاوز RLS)، ولذلك يُنتحل دور `authenticated`
 * صراحةً حين يكون السؤال عن RLS — وإلا فالنتيجة بلا معنى.
 *
 *   node scripts/probe-document-gateway.mjs
 */
import pg from 'pg'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const S = await import(pathToFileURL(join(root, 'api', '_lib', 'fileScan.js')).href)

/**
 * يقرأ متغيّراً من ملفّات البيئة، منزوعَ ما لا يُرى.
 *
 * بادئة ترتيب البايتات U+FEFF تلتصق بأول اسم في الملف — فيصير
 * \u200EDATABASE_URL\u200E ولا يطابق شيئاً، والملف يبدو صحيحاً في كل محرّر.
 * وقد عطّل هذا Clerk في مرصد بالكامل مرّة، ولذلك كُتبت `clean` في
 * api/_lib/secrets.js — وهذه نظيرتها لجانب السكربتات.
 */
const readVar = (name) => {
  for (const f of ['.env.migrations', '.env.local', '.env', '.env.production']) {
    let txt = ''
    try { txt = readFileSync(join(root, f), 'utf8') } catch { continue }
    txt = txt.replace(/^\uFEFF/, '')
    const line = txt.split(/\r?\n/).find((l) => l.replace(/^\uFEFF/, '').trim().startsWith(`${name}=`))
    if (line) {
      const v = line.split('=').slice(1).join('=')
        .replace(/\uFEFF/g, '').trim().replace(/^["']|["']$/g, '').trim()
      if (v) return v
    }
  }
  const env = process.env[name]
  return env ? env.replace(/\uFEFF/g, '').trim() : null
}

const DB_URL = readVar('DATABASE_URL')
const SB_URL = readVar('SUPABASE_URL') || readVar('VITE_SUPABASE_URL')
const SERVICE = readVar('SUPABASE_SERVICE_ROLE_KEY')

if (!DB_URL) { console.error('❌ DATABASE_URL مفقود'); process.exit(2) }

// مفتاح الخدمة رمز JWT يبدأ بـ eyJ. وفحص شكله هنا يُحوّل «تُخطّى الفحوص»
// الغامضة إلى سبب مُسمّى: مفتاحٌ نُسخ ناقصاً أو أُخذ من الحقل الخطأ
// (anon بدل service_role) يبدو موجوداً ولا يعمل.
if (SERVICE && !/^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\./.test(SERVICE)) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY موجود لكنه ليس رمز JWT — أعد نسخه كاملاً')
  process.exit(2)
}

const db = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } })
await db.connect()
const sb = (SB_URL && SERVICE) ? createClient(SB_URL, SERVICE, { auth: { persistSession: false } }) : null

let pass = 0
let fail = 0
let skipped = 0
const ok = (n, c, d = '') => {
  if (c) { pass += 1; console.log(`  ✅ ${n}`) }
  else { fail += 1; console.log(`  ❌ ${n}${d ? ` — ${d}` : ''}`) }
}
const skip = (n) => { skipped += 1; console.log(`  ⏭️  ${n}`) }

const stamp = Date.now().toString(36)
const ACTOR = `user_gw_probe_${stamp}`

// ---------------------------------------------------------------------------
console.log('─── دلو الحجر ───')
// ---------------------------------------------------------------------------
{
  const { rows: [b] } = await db.query(
    "select public, file_size_limit, allowed_mime_types from storage.buckets where id='quarantine'")
  ok('موجود', !!b)
  ok('وخاصّ', b?.public === false)
  ok('وبحدّ حجم', Number(b?.file_size_limit) === 22020096, String(b?.file_size_limit))
  ok('وبقائمة أنواع', (b?.allowed_mime_types || []).length === 4)

  const { rows: pol } = await db.query(`
    select cmd from pg_policies where schemaname='storage' and tablename='objects'
       and (coalesce(qual,'')||coalesce(with_check,'')) like '%quarantine%'`)
  const cmds = pol.map((p) => p.cmd)
  ok('سياسة رفع واحدة لا غير', cmds.length === 1 && cmds[0] === 'INSERT', cmds.join(',') || 'لا شيء')
  ok('لا سياسة قراءة — الحجر لا يُقرأ إلا بمفتاح خدمة', !cmds.includes('SELECT'))
  ok('لا سياسة حذف — لا يُمحى أثر محاولة', !cmds.includes('DELETE'))

  await db.query('begin')
  await db.query("select set_config('request.jwt.claims', $1, true)",
    [JSON.stringify({ sub: ACTOR, role: 'authenticated' })])
  await db.query('set local role authenticated')
  const { rows: [{ me }] } = await db.query('select current_user::text me')
  const { rows: [{ n }] } = await db.query(
    "select count(*)::int n from storage.objects where bucket_id='quarantine'")
  await db.query('rollback')
  ok('الاختبار يجري فعلاً بدور authenticated', me === 'authenticated', me)
  ok('ومستخدم مسجَّل لا يقرأ من الحجر شيئاً', n === 0, `${n} صفّاً`)
}

// ---------------------------------------------------------------------------
console.log('\n─── سجلّ الفحص ───')
// ---------------------------------------------------------------------------
{
  await db.query('begin')
  await db.query("select set_config('request.jwt.claims', $1, true)",
    [JSON.stringify({ sub: ACTOR, role: 'authenticated' })])
  await db.query('set local role authenticated')
  const { rows: [{ me }] } = await db.query('select current_user::text me')
  const { rows: [{ n }] } = await db.query('select count(*)::int n from public.file_scans')
  let wrote = false
  try {
    await db.query(`insert into public.file_scans
      (sha256, quarantine_path, target_bucket, size_bytes, scanner_version)
      values ($1,'x/y','company-documents',10,'v')`, ['c'.repeat(64)])
    wrote = true
  } catch { /* متوقَّع */ }
  await db.query('rollback')
  ok('الاختبار بدور authenticated', me === 'authenticated', me)
  ok('غير المسؤول لا يقرأ سجلّ الفحص', n === 0, `${n} صفّاً`)
  ok('ولا يكتب فيه', !wrote)
}

// ---------------------------------------------------------------------------
console.log('\n─── الحكم يترك أثراً، والتجزئة تُذكَر ───')
// ---------------------------------------------------------------------------
{
  const evil = Buffer.from(
    '%PDF-1.4\n1 0 obj\n<< /OpenAction << /S /J#61vaScript /JS (evil) >> >>\nendobj\ntrailer\n<< >>\n%%EOF',
    'latin1')
  const v = S.scanFile(evil, { allow: ['pdf', 'png', 'jpeg'] })
  ok('الفحص يرفض PDF بمحتوى نشط مموَّه', v.verdict === 'rejected', v.reasons.join(','))
  ok('ويسمّيه', v.reasons.includes('pdf_active_content'), v.reasons.join(','))

  await db.query('begin')
  const { rows: [row] } = await db.query(
    `insert into public.file_scans
       (sha256, quarantine_path, target_bucket, size_bytes, scanner_version, actor, verdict, reasons, detected_type)
     values ($1,$2,'company-documents',$3,$4,$5,'rejected',$6,'pdf') returning id`,
    [v.sha256, `${ACTOR}/e.pdf`, evil.length, S.SCANNER_VERSION, ACTOR, JSON.stringify(v.reasons)])

  const { rows: [aud] } = await db.query(
    "select count(*)::int n from public.audit_logs where action='file_rejected' and actor_id=$1", [ACTOR])
  ok('والرفض كتب قيد تدقيق تلقائياً', aud.n === 1, `${aud.n}`)

  const { rows: [hv] } = await db.query('select * from public.file_hash_verdict($1)', [v.sha256])
  ok('وصار الملف معروفاً بتجزئته', hv?.verdict === 'rejected')

  // حكم error يكتب أثراً مختلفاً.
  await db.query(
    `insert into public.file_scans
       (sha256, quarantine_path, target_bucket, size_bytes, scanner_version, actor, verdict, reasons)
     values ($1,$2,'company-documents',$3,$4,$5,'error','["scan_exception"]')`,
    ['d'.repeat(64), `${ACTOR}/stuck.pdf`, 10, S.SCANNER_VERSION, ACTOR])
  const { rows: [aud2] } = await db.query(
    "select count(*)::int n from public.audit_logs where action='file_scan_error' and actor_id=$1", [ACTOR])
  ok('وفشل الفحص يترك أثراً مستقلاً', aud2.n === 1, `${aud2.n}`)

  const { rows: [cleanCount] } = await db.query(
    "select count(*)::int n from public.file_scans where actor=$1 and verdict='clean'", [ACTOR])
  ok('ولا شيء رُقّي', cleanCount.n === 0, `${cleanCount.n}`)

  void row
  await db.query('rollback')
}

// ---------------------------------------------------------------------------
console.log('\n─── السجل التجاري ما زال مطلوباً ───')
// ---------------------------------------------------------------------------
// حُذف حقله المستقل من نموذج إضافة الشركة لأنه كان مكرّراً. والمطلوبيّة لم
// تُحذف معه: مصدرها `company_document_types()` وحده — وهو ما تقرؤه الشاشة
// وتحسب عليه «ناقص N مستند». فإن سقطت مطلوبيّته من القاعدة يومَاً سقط
// الشرط من الشاشة بلا أن يلاحظه أحد.
{
  const { rows: types } = await db.query(
    'select doc_type, required from public.company_document_types()')
  const cr = types.find((t) => t.doc_type === 'commercial_registration')
  ok('السجل التجاري ضمن أنواع المستندات', !!cr)
  ok('وهو مطلوب', cr?.required === true, JSON.stringify(cr))
  const required = types.filter((t) => t.required)
  ok('والمطلوبة أربعة', required.length === 4,
    required.map((t) => t.doc_type).join(', '))
}

// ---------------------------------------------------------------------------
console.log('\n─── الحكم النظيف هو تصريح الرفع ───')
// ---------------------------------------------------------------------------
{
  const { rows: [u] } = await db.query("select id from public.users where status='active' order by id limit 1")
  if (!u) {
    skip('اختبارات التصريح — لا مستخدمين')
  } else {
    await db.query('begin')
    await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: u.id })])

    const permits = async (bucket, path) =>
      (await db.query('select public.file_scan_permits($1,$2) p', [bucket, path])).rows[0].p

    ok('لا تصريح بلا فحص', (await permits('company-documents', 'a/b.pdf')) === false)

    const { rows: [sc] } = await db.query(
      `insert into public.file_scans
         (sha256, quarantine_path, target_bucket, target_path, size_bytes,
          scanner_version, actor, verdict, scanned_at)
       values ($1,'q/a','company-documents','a/b.pdf',10,'probe',$2,'clean',now())
       returning id`, ['e'.repeat(64), u.id])

    ok('والحكم النظيف يُصرّح', (await permits('company-documents', 'a/b.pdf')) === true)
    ok('والتصريح مقصور على مساره', (await permits('company-documents', 'a/other.pdf')) === false)
    ok('ومقصور على دلوه', (await permits('report-documents', 'a/b.pdf')) === false)

    await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: 'user_other' })])
    ok('ومقصور على فاعله', (await permits('company-documents', 'a/b.pdf')) === false)

    await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: u.id })])
    await db.query("update public.file_scans set scanned_at = now() - interval '11 minutes' where id=$1", [sc.id])
    ok('وينتهي بعد عشر دقائق', (await permits('company-documents', 'a/b.pdf')) === false)

    // وحكمٌ غير نظيف لا يُصرّح مهما طابق.
    await db.query("update public.file_scans set scanned_at = now(), verdict='rejected' where id=$1", [sc.id])
    ok('والحكم بالرفض لا يُصرّح', (await permits('company-documents', 'a/b.pdf')) === false)

    await db.query('rollback')
  }

  const { rows: pol } = await db.query(`
    select policyname, with_check from pg_policies
     where schemaname='storage' and tablename='objects' and cmd='INSERT'
       and coalesce(with_check,'') not like '%quarantine%'`)
  ok('كل سياسات الرفع الدائمة مشروطة بالفحص',
    pol.length === 3 && pol.every((p) => (p.with_check || '').includes('file_scan_permits')),
    pol.map((p) => p.policyname).join(', '))
}

// ---------------------------------------------------------------------------
console.log('\n─── دورة البايتات على تخزين حقيقي ───')
// ---------------------------------------------------------------------------
if (!sb) {
  skip('رفع → تنزيل → فحص → ترقية — يحتاج SUPABASE_SERVICE_ROLE_KEY')
  skip('المخزَّن هو المُعقَّم لا الأصل — يحتاج SUPABASE_SERVICE_ROLE_KEY')
  console.log('     المفتاح في بيئة Vercel لا محلياً. شغّل هذا حيث يوجد.')
} else {
  const CRC = (() => {
    const t = new Int32Array(256)
    for (let n = 0; n < 256; n += 1) {
      let c = n
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
      t[n] = c
    }
    return (b) => {
      let c = 0xFFFFFFFF
      for (let i = 0; i < b.length; i += 1) c = t[(c ^ b[i]) & 0xFF] ^ (c >>> 8)
      return (c ^ 0xFFFFFFFF) >>> 0
    }
  })()
  const chunk = (type, data) => {
    const h = Buffer.alloc(8)
    h.writeUInt32BE(data.length, 0); h.write(type, 4, 'latin1')
    const t = Buffer.alloc(4); t.writeUInt32BE(CRC(Buffer.concat([h.subarray(4), data])), 0)
    return Buffer.concat([h, data, t])
  }
  const PAYLOAD = `MARSAD_PROBE_${stamp}`
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(2, 0); ihdr.writeUInt32BE(2, 4); ihdr[8] = 8; ihdr[9] = 2
  const rawRows = Buffer.alloc(7 * 2)
  for (let y = 0; y < 2; y += 1) for (let i = 1; i < 7; i += 1) rawRows[y * 7 + i] = (y * 30 + i * 10) & 0xFF
  const original = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('tEXt', Buffer.from(`Comment\0${PAYLOAD}`, 'latin1')),
    chunk('IDAT', deflateSync(rawRows)),
    chunk('IEND', Buffer.alloc(0)),
  ])

  const qPath = `${ACTOR}/probe-${stamp}.png`
  const tPath = `${ACTOR}/promoted-${stamp}.png`
  try {
    const { error: e1 } = await sb.storage.from('quarantine')
      .upload(qPath, original, { contentType: 'image/png' })
    ok('رُفع إلى الحجر', !e1, e1?.message)

    const { data: blob } = await sb.storage.from('quarantine').download(qPath)
    const bytes = Buffer.from(await blob.arrayBuffer())
    ok('ونُزّل بمفتاح الخدمة كما تفعل البوّابة', bytes.equals(original))
    ok('والأصل يحمل الحمولة', bytes.includes(PAYLOAD, 0, 'latin1'))

    const v = S.scanFile(bytes, { allow: ['pdf', 'png', 'jpeg'] })
    ok('والفحص قبله', v.verdict === 'clean', v.reasons.join(','))
    ok('وأنتج مُعقَّماً', !!v.sanitized?.bytes)

    const { error: e2 } = await sb.storage.from('company-documents')
      .upload(tPath, v.sanitized.bytes, { contentType: 'image/png' })
    ok('ورُقّي إلى الدلو الدائم', !e2, e2?.message)

    const { data: stored } = await sb.storage.from('company-documents').download(tPath)
    const storedBytes = Buffer.from(await stored.arrayBuffer())
    ok('والمخزَّن لا يحمل الحمولة', !storedBytes.includes(PAYLOAD, 0, 'latin1'))
    ok('والمخزَّن ليس الأصل', !storedBytes.equals(bytes))

    await sb.storage.from('quarantine').remove([qPath])
    const { data: left } = await sb.storage.from('quarantine').list(ACTOR)
    ok('والحجر خلا بعد الترقية', !(left || []).some((f) => f.name.includes(stamp)))
  } finally {
    await sb.storage.from('quarantine').remove([qPath]).catch(() => {})
    await sb.storage.from('company-documents').remove([tPath]).catch(() => {})
  }
}

await db.end()
console.log(`\n${fail ? '❌' : '✅'} ${pass} ناجح · ${fail} فاشل${skipped ? ` · ${skipped} مُتخطّى` : ''}`)
if (skipped) console.log('⚠️  التغطية ناقصة — ما تُخطّي لم يُتحقَّق منه')
process.exit(fail ? 1 : 0)
