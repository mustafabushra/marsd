#!/usr/bin/env node
/**
 * استيراد دليل الأنشطة: القارئ والتحقّق والذرّية.
 *
 * ============================================================================
 * طبقتان تُختبران هنا
 * ============================================================================
 * قارئ الملف في المتصفّح — يُبنى الملف بايتاً بايتاً ويُمرَّر عليه.
 * ودالة الاستيراد على الخادم — تُنادى بصفوف مصنوعة، كما ينادي بها من يتجاوز
 * الواجهة.
 *
 * والثانية هي الضمان. الأولى راحةٌ للمسؤول: أن يرى ما سيحدث قبل أن يحدث.
 *
 *   npm run check:activities
 */
import pg from 'pg'
import { deflateRawSync, crc32 } from 'node:zlib'
import { readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const A = await import(pathToFileURL(join(root, 'src', 'lib', 'activityImport.js')).href)
const Z = await import(pathToFileURL(join(root, 'src', 'lib', 'zipEntries.js')).href)

let pass = 0
let fail = 0
const ok = (n, c, d = '') => {
  if (c) { pass += 1 } else { fail += 1; console.log(`  ❌ ${n}${d ? ` — ${d}` : ''}`) }
}
const section = (t) => console.log(`\n─── ${t} ───`)
const done = (t) => console.log(`  ✅ ${t}`)

/** ملفٌ وهمي بواجهة File التي يستعملها القارئ. */
const asFile = (name, bytes) => ({
  name,
  size: bytes.length,
  arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length),
})
const csv = (s) => asFile('d.csv', new TextEncoder().encode(s))

// ---------------------------------------------------------------------------
section('الأعمدة المطلوبة')
// ---------------------------------------------------------------------------
{
  let r = await A.parseActivityFile(csv('foo,bar\n1,2'))
  ok('يرفض ملفاً بلا العمودين', !r.ok && /عمود مطلوب مفقود/.test(r.problems[0]), r.problems[0])
  ok('ويسمّي العمودين الناقصين',
    /activity_code/.test(r.problems[0]) && /activity_description/.test(r.problems[0]), r.problems[0])
  ok('ويعرض الأعمدة الموجودة ليُقارَن', /foo/.test(r.problems[1]), r.problems[1])

  r = await A.parseActivityFile(csv('activity_code,foo\n561010,مطاعم'))
  ok('يسمّي العمود الناقص وحده',
    /activity_description/.test(r.problems[0]) && !/activity_code/.test(r.problems[0]), r.problems[0])

  r = await A.parseActivityFile(csv('activity_code,activity_description\n561010,المطاعم مع الخدمة'))
  ok('ويقبل العمودين المطلوبين', r.ok && r.rows.length === 1, JSON.stringify(r.problems))

  // مرادفات: ملفٌ رسمي عربي لا يُسمّي أعمدته بالإنجليزية.
  for (const head of ['code,name_ar', 'الكود,الوصف', 'رمز النشاط,اسم النشاط', 'ISIC,description']) {
    r = await A.parseActivityFile(csv(`${head}\n561010,المطاعم`))
    ok(`يقبل الترويسة «${head}»`, r.ok && r.rows.length === 1, JSON.stringify(r.problems))
  }

  r = await A.parseActivityFile(csv('activity_code,activity_description,name_en\n561010,مطاعم,Restaurants'))
  ok('ويقرأ الإنجليزية حين توجد', r.rows[0]?.name_en === 'Restaurants', r.rows[0]?.name_en)
  ok('ويذكر الأعمدة التي قرأها', r.headerMap?.code === 'activity_code', JSON.stringify(r.headerMap))
}
done('الأعمدة')

// ---------------------------------------------------------------------------
section('صحّة الأكواد')
// ---------------------------------------------------------------------------
{
  const head = 'activity_code,activity_description\n'
  for (const [code, why] of [
    ['1', 'رقم واحد'], ['123456789', 'تسعة أرقام'], ['abc', 'حروف'],
    ['56-1010', 'شرطة'], ['5610.10', 'نقطة'], ['٥٦١٠١٠x', 'أرقام عربية مع حرف'],
    ["561010'; DROP TABLE x--", 'حقن'],
  ]) {
    const r = await A.parseActivityFile(csv(`${head}${code},نشاط`))
    ok(`يرفض كوداً: ${why}`, !r.ok && r.counts.badCode > 0, JSON.stringify(r.problems))
  }

  let r = await A.parseActivityFile(csv(`${head}٥٦١٠١٠,مطاعم`))
  ok('ويقبل الأرقام العربية-الهندية ويحوّلها', r.ok && r.rows[0].code === '561010', r.rows[0]?.code)

  r = await A.parseActivityFile(csv(`${head}56,قسم\n5610,مجموعة\n561010,نشاط`))
  ok('ويقبل من رقمين إلى ثمانية', r.ok && r.rows.length === 3, JSON.stringify(r.problems))
  ok('ويشتقّ المستوى من الطول',
    r.rows.map((x) => x.level).join(',') === '2,4,6', r.rows.map((x) => x.level).join(','))
  ok('ويشتقّ الأب',
    r.rows[2].parent_code === '5610' && r.rows[0].parent_code === null, r.rows[2].parent_code)
}
done('الأكواد')

// ---------------------------------------------------------------------------
section('التكرار والفراغ')
// ---------------------------------------------------------------------------
{
  const head = 'activity_code,activity_description\n'
  let r = await A.parseActivityFile(csv(`${head}561010,أ\n561010,ب`))
  ok('يرفض الكود المكرّر', !r.ok && r.counts.duplicate === 1, JSON.stringify(r.problems))
  ok('ويقول أين ورد أولاً', /سطر 2/.test(r.problems[0]), r.problems[0])

  r = await A.parseActivityFile(csv(`${head},وصف بلا كود`))
  ok('ويرفض كوداً فارغاً', !r.ok && r.counts.blank === 1, JSON.stringify(r.problems))

  r = await A.parseActivityFile(csv(`${head}561010,`))
  ok('ويرفض وصفاً فارغاً', !r.ok && r.counts.blank === 1, JSON.stringify(r.problems))

  r = await A.parseActivityFile(csv(`${head}561010,مطاعم\n\n\n561020,مقاهي`))
  ok('ويتخطّى الأسطر الفارغة بلا شكوى', r.ok && r.rows.length === 2, JSON.stringify(r.problems))

  r = await A.parseActivityFile(csv(`${head}561010,${'ط'.repeat(301)}`))
  ok('ويرفض وصفاً أطول من ٣٠٠', !r.ok, JSON.stringify(r.problems))

  // كل المشكلات تُجمع، لا تُبلَّغ واحدةً واحدة.
  r = await A.parseActivityFile(csv(`${head}ab,أ\ncd,ب\n,ج\n561010,\n561010,د\n561010,هـ`))
  ok('ويجمع كل المشكلات في مرّة', r.problems.length >= 4, `${r.problems.length}`)
}
done('التكرار والفراغ')

// ---------------------------------------------------------------------------
section('الملفّات غير المسموحة والتالفة')
// ---------------------------------------------------------------------------
{
  const bin = (...a) => new Uint8Array(a)
  const check = async (label, name, bytes, expect) => {
    const r = await A.parseActivityFile(asFile(name, bytes))
    ok(label, !r.ok && (!expect || new RegExp(expect).test(r.problems[0])), r.problems[0])
  }
  await check('يرفض تنفيذي Windows مُسمّى csv', 'x.csv', bin(0x4D, 0x5A, 0x90, 0, 0, 0), 'تنفيذي')
  await check('يرفض تنفيذي Linux', 'x.csv', bin(0x7F, 0x45, 0x4C, 0x46, 0, 0), 'تنفيذي')
  await check('يرفض PDF', 'x.csv', bin(0x25, 0x50, 0x44, 0x46, 0x2D, 0x31), 'PDF')
  await check('يرفض xls القديم', 'x.xls', bin(0xD0, 0xCF, 0x11, 0xE0, 0, 0), 'xlsx')
  await check('يرفض ملفاً ثنائياً', 'x.csv', bin(1, 2, 0, 4, 5, 6), 'ثنائي')
  await check('يرفض الفارغ', 'x.csv', new Uint8Array(0), 'فارغ')

  const big = { name: 'x.csv', size: A.MAX_FILE_BYTES + 1, arrayBuffer: async () => new ArrayBuffer(0) }
  const r = await A.parseActivityFile(big)
  ok('ويرفض ما تجاوز الحدّ', !r.ok && /أكبر من/.test(r.problems[0]), r.problems[0])

  // النوع من البايتات لا من الامتداد.
  const t = A.detectImportKind(bin(0x4D, 0x5A, 0, 0))
  ok('والنوع يُقرأ من البايتات لا الامتداد', t.kind === null, JSON.stringify(t))
}
done('الملفّات المرفوضة')

// ---------------------------------------------------------------------------
section('مصنّف Excel — الفهرس والسياسة')
// ---------------------------------------------------------------------------
{
  /** أرشيف ZIP حقيقي بمدخلات مخزَّنة، مع إمكان تزوير الأحجام المُعلَنة. */
  const makeZip = (entries) => {
    const locals = []
    const centrals = []
    let offset = 0
    for (const e of entries) {
      const name = Buffer.from(e.name, 'utf8')
      const data = Buffer.from(e.data ?? '', 'latin1')
      const comp = e.compSize ?? data.length
      const raw = e.rawSize ?? data.length
      const lh = Buffer.alloc(30)
      lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4)
      lh.writeUInt32LE(comp, 18); lh.writeUInt32LE(raw, 22); lh.writeUInt16LE(name.length, 26)
      const local = Buffer.concat([lh, name, data])
      locals.push(local)
      const ch = Buffer.alloc(46)
      ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 6)
      ch.writeUInt32LE(comp, 20); ch.writeUInt32LE(raw, 24)
      ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(offset, 42)
      centrals.push(Buffer.concat([ch, name]))
      offset += local.length
    }
    const central = Buffer.concat(centrals)
    const eocd = Buffer.alloc(22)
    eocd.writeUInt32LE(0x06054b50, 0)
    eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10)
    eocd.writeUInt32LE(central.length, 12); eocd.writeUInt32LE(offset, 16)
    return new Uint8Array(Buffer.concat([...locals, central, eocd]))
  }

  const WB = { name: 'xl/workbook.xml', data: '<workbook/>' }

  ok('يقرأ فهرس أرشيف صالح',
    Z.readZipEntries(makeZip([WB])).ok)
  ok('ويردّ أرشيفاً بلا فهرس',
    !Z.readZipEntries(new Uint8Array(30)).ok)

  ok('ويقبل مصنّفاً سليماً', Z.inspectWorkbook(makeZip([WB])) === null)
  ok('ويرفض ما ليس مصنّفاً',
    /ليس مصنّف/.test(Z.inspectWorkbook(makeZip([{ name: 'a.txt', data: 'x' }])) || ''))
  ok('ويرفض الماكرو',
    /ماكرو/.test(Z.inspectWorkbook(makeZip([WB, { name: 'xl/vbaProject.bin', data: 'x' }])) || ''))
  ok('ويرفض التنفيذي داخله',
    /تنفيذي/.test(Z.inspectWorkbook(makeZip([WB, { name: 'setup.exe', data: 'x' }])) || ''))
  ok('ويرفض الأرشيف داخله',
    /أرشيفاً داخله/.test(Z.inspectWorkbook(makeZip([WB, { name: 'inner.zip', data: 'x' }])) || ''))
  ok('ويرفض الكائن المضمَّن',
    /مضمَّناً/.test(Z.inspectWorkbook(makeZip([WB, { name: 'xl/embeddings/o.bin', data: 'x' }])) || ''))
  ok('ويرفض المسار الصاعد',
    /صاعداً/.test(Z.inspectWorkbook(makeZip([WB, { name: '../../x', data: 'x' }])) || ''))
  ok('ويرفض قنبلة الضغط',
    /قنبلة|ضغط/.test(Z.inspectWorkbook(makeZip([WB, { name: 'a', data: 'x', compSize: 1, rawSize: 9_000_000 }])) || ''))

  void deflateRawSync
  void crc32
}
done('المصنّف')

// ---------------------------------------------------------------------------
section('الخادم: التحقّق والذرّية والأثر')
// ---------------------------------------------------------------------------
{
  const line = readFileSync(join(root, '.env.migrations'), 'utf8')
    .split(/\r?\n/).find((l) => l.trim().startsWith('DATABASE_URL='))
  const db = new pg.Client({
    connectionString: line.split('=').slice(1).join('=').trim(),
    ssl: { rejectUnauthorized: false },
  })
  await db.connect()

  const { rows: [admin] } = await db.query(
    "select id from public.users where role='platform_admin' order by id limit 1")
  if (!admin) {
    console.log('  ⏭️  لا مسؤول منصّة — تُتخطّى اختبارات الخادم')
  } else {
    await db.query('begin')
    const asAdmin = () => db.query("select set_config('request.jwt.claims',$1,true)",
      [JSON.stringify({ sub: admin.id })])

    const call = async (rows, mode = 'merge') => {
      await db.query('savepoint s')
      try {
        const { rows: [r] } = await db.query(
          'select public.import_reference_activities($1,$2,$3) o',
          [JSON.stringify(rows), mode, 'test.csv'])
        await db.query('release savepoint s')
        return { ok: true, out: r.o }
      } catch (e) {
        await db.query('rollback to savepoint s')
        return { ok: false, message: e.message }
      }
    }

    // غير المسؤول.
    await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: 'user_nobody' })])
    let r = await call([{ code: '9911', name_ar: 'x' }])
    ok('يردّ غير المسؤول', !r.ok && /مسؤولي المنصة/.test(r.message), r.message)

    await asAdmin()

    // كل صنف خطأ يُبطل الدفعة كلّها.
    for (const [label, rows, expect] of [
      ['كود غير صالح', [{ code: '9911', name_ar: 'ok' }, { code: 'ab', name_ar: 'bad' }], 'كود غير صالح'],
      ['كود مكرّر', [{ code: '9912', name_ar: 'أ' }, { code: '9912', name_ar: 'ب' }], 'مكرّر'],
      ['وصف فارغ', [{ code: '9913', name_ar: '' }], 'فارغ'],
      ['كود فارغ', [{ code: '', name_ar: 'x' }], 'فارغ'],
      ['وصف طويل', [{ code: '9914', name_ar: 'ط'.repeat(301) }], '٣٠٠'],
      ['وضع مجهول', [{ code: '9915', name_ar: 'x' }], 'وضع استيراد'],
    ]) {
      r = label === 'وضع مجهول' ? await call(rows, 'wipe') : await call(rows)
      ok(`يبطل الدفعة عند: ${label}`, !r.ok && new RegExp(expect).test(r.message), r.message)
    }

    // الذرّية: لا صفّ من دفعة فاشلة.
    const { rows: [{ n: before }] } = await db.query(
      "select count(*)::int n from public.reference_activities where code like '99%'")
    await call([{ code: '9921', name_ar: 'صالح' }, { code: 'zz', name_ar: 'فاسد' }])
    const { rows: [{ n: after }] } = await db.query(
      "select count(*)::int n from public.reference_activities where code like '99%'")
    ok('ولا يُكتب صفٌّ من دفعة فاشلة', before === after, `${before} → ${after}`)

    // والصحيح يمرّ.
    r = await call([
      { code: '9931', name_ar: 'نشاط أ', name_en: 'A' },
      { code: '993101', name_ar: 'نشاط أ فرعي' },
    ])
    ok('والصحيح يمرّ', r.ok, r.message)
    ok('ويعدّ المُدرَج', r.out?.inserted === 2, JSON.stringify(r.out))

    const { rows: [child] } = await db.query(
      "select level, parent_code, source, active from public.reference_activities where code='993101'")
    ok('ويشتقّ المستوى على الخادم', child?.level === 6, `${child?.level}`)
    ok('ويشتقّ الأب على الخادم', child?.parent_code === '9931', child?.parent_code)
    ok('ويسمّي المصدر', child?.source === 'admin_import', child?.source)

    // إعادة الاستيراد تُحدِّث ولا تُكرِّر.
    r = await call([{ code: '9931', name_ar: 'اسم جديد' }])
    ok('وإعادة الاستيراد تُحدِّث', r.ok && r.out?.updated === 1 && r.out?.inserted === 0, JSON.stringify(r.out))
    const { rows: [upd] } = await db.query(
      "select name_ar, name_en from public.reference_activities where code='9931'")
    ok('والاسم تغيّر', upd?.name_ar === 'اسم جديد', upd?.name_ar)
    ok('والإنجليزية تبقى إن لم تُرسَل', upd?.name_en === 'A', upd?.name_en)

    // replace يُعطّل ولا يحذف.
    const { rows: [{ n: liveBefore }] } = await db.query(
      'select count(*)::int n from public.reference_activities where active')
    r = await call([{ code: '9931', name_ar: 'وحده' }], 'replace')
    ok('و«استبدال» ينجح', r.ok, r.message)
    const { rows: [{ n: liveAfter }] } = await db.query(
      'select count(*)::int n from public.reference_activities where active')
    const { rows: [{ n: total }] } = await db.query(
      'select count(*)::int n from public.reference_activities')
    ok('ويُعطّل ما لم يرد', liveAfter === 1, `${liveBefore} → ${liveAfter}`)
    ok('ولا يحذف شيئاً', total >= liveBefore, `${total}`)

    // الأثر.
    const { rows: [{ n: logs }] } = await db.query(
      "select count(*)::int n from public.audit_logs where action='activity_directory_imported'")
    ok('وكل استيراد يترك قيد تدقيق', logs >= 3, `${logs}`)
    // يُنتقى بمحتواه لا بترتيبه: `now()` ثابتة طوال المعاملة، فكل قيود
    // التدقيق هنا تحمل نفس `created_at` و«الأحدث» بينها اعتباطيّ.
    const { rows: [log] } = await db.query(
      `select meta from public.audit_logs
        where action='activity_directory_imported' and meta->>'mode' = 'replace' limit 1`)
    ok('والقيد يحمل الوضع واسم الملف والأعداد',
      log?.meta?.mode === 'replace' && log?.meta?.file_name === 'test.csv'
      && typeof log?.meta?.deactivated === 'number', JSON.stringify(log?.meta))

    await db.query('rollback')
  }
  await db.end()
}
done('الخادم')

console.log(`\n${fail ? '❌' : '✅'} ${pass} ناجح · ${fail} فاشل`)
process.exit(fail ? 1 : 0)
