#!/usr/bin/env node
/**
 * جرد كل حقل إدخال في مرصد، وما يحرسه.
 *
 * ============================================================================
 * لماذا سكربت لا جدول في وثيقة
 * ============================================================================
 * جدولٌ يُكتب مرة يتعفّن مع أول حقل يُضاف. هذا يُقرأ من المصدر ومن القاعدة في
 * كل تشغيل، فيقول الحقيقة اليوم لا حقيقة يوم كُتب.
 *
 * ============================================================================
 * ما يستخرجه
 * ============================================================================
 * لكل حقل: نوعه، وحدّه الأقصى، وأمطلوبٌ هو، وأيّ نمط عليه — من الترميز. ثم
 * يقابله بقيود CHECK في القاعدة إن أمكن ربط الاسم بعمود.
 *
 * ولا يُصنّف الخطر تلقائياً: يُبلّغ عمّا ينقصه حارس ظاهر، والتصنيف النهائي
 * يبقى قراءةَ إنسان — حقلٌ بلا maxLength في نموذج بحث ليس كحقل بلا maxLength
 * يُخزَّن في سجلّ علني.
 *
 *   npm run audit:forms
 *   npm run audit:forms -- --gaps      الثغرات فقط
 */
import pg from 'pg'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const gapsOnly = process.argv.includes('--gaps')

// ---------------------------------------------------------------------------
// ١) الحقول من المصدر
// ---------------------------------------------------------------------------
const files = []
const walk = (d) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name)
    if (e.isDirectory()) walk(p)
    else if (e.name.endsWith('.jsx')) files.push(p)
  }
}
for (const d of ['src/pages', 'src/components']) walk(join(root, d))

const attr = (tag, name) => {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|\\{([^}]*)\\})`))
  return m ? (m[1] ?? m[2] ?? m[3]).trim() : null
}

/**
 * الوسم كاملاً من اسمه حتى إغلاقه الحقيقي.
 *
 * التعبير النمطي البسيط يقف عند أول \u200E>\u200E، و\u200EonChange={(e) => …}\u200E فيها \u200E>\u200E داخل
 * دالة سهمية. فكان الوسم يُقصّ قبل بقيّة خصائصه: حقلٌ فيه \u200Emin\u200E و\u200Emax\u200E بعد
 * \u200EonChange\u200E يُبلَّغ عنه «بلا min/max» وهما مكتوبان.
 *
 * فيُمسح المحتوى محرفاً محرفاً مع تتبّع عمق الأقواس والنصوص، ويُغلق الوسم عند
 * \u200E>\u200E خارجها فقط.
 */
const scanTag = (src, from) => {
  let depth = 0
  let quote = null
  for (let i = from; i < src.length; i += 1) {
    const ch = src[i]
    if (quote) {
      if (ch === '\\') { i += 1; continue }
      if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue }
    if (ch === '{') { depth += 1; continue }
    if (ch === '}') { depth -= 1; continue }
    if (ch === '>' && depth === 0) return src.slice(from, i + 1)
  }
  return src.slice(from)
}

const fields = []
/** ملفّات تضبط accept أمراً على الـref بدل أن تكتبه خاصيةً في الوسم. */
const dynamicAccept = new Set()
for (const f of files) {
  const src = readFileSync(f, 'utf8')
  const rel = relative(root, f).replace(/\\/g, '/')
  if (/\.accept\s*=/.test(src)) dynamicAccept.add(rel)
  for (const m of src.matchAll(/<(input|textarea|select)\b/g)) {
    const tag = m[1]
    const whole = scanTag(src, m.index)
    // الاسم: name ثم placeholder ثم value — أيّها وُجد يعرّف الحقل.
    const value = attr(whole, 'value') || ''
    const name = attr(whole, 'name')
      || (value.match(/\.(\w+)$/) || value.match(/(\w+)$/) || [])[1]
      || null
    fields.push({
      file: rel,
      tag,
      name,
      type: attr(whole, 'type') || (tag === 'select' ? 'select' : tag === 'textarea' ? 'text' : 'text'),
      maxLength: attr(whole, 'maxLength'),
      minLength: attr(whole, 'minLength'),
      required: /\brequired\b/.test(whole),
      pattern: attr(whole, 'pattern'),
      inputMode: attr(whole, 'inputMode'),
      min: attr(whole, 'min'),
      max: attr(whole, 'max'),
      accept: attr(whole, 'accept'),
      placeholder: (attr(whole, 'placeholder') || '').slice(0, 30),
    })
  }
}

// ---------------------------------------------------------------------------
// ٢) قيود القاعدة
// ---------------------------------------------------------------------------
const envPath = join(root, '.env.migrations')
let constraints = []
let columns = []
if (existsSync(envPath)) {
  const line = readFileSync(envPath, 'utf8').split(/\r?\n/)
    .find((l) => l.trim().startsWith('DATABASE_URL='))
  const c = new pg.Client({
    connectionString: line.split('=').slice(1).join('=').trim(),
    ssl: { rejectUnauthorized: false },
  })
  await c.connect()
  constraints = (await c.query(`
    select conrelid::regclass::text tbl, conname, pg_get_constraintdef(oid) def
      from pg_constraint where contype = 'c'
       and connamespace = 'public'::regnamespace`)).rows
  columns = (await c.query(`
    select table_name tbl, column_name col, data_type typ,
           is_nullable nullable, character_maximum_length maxlen
      from information_schema.columns
     where table_schema = 'public'`)).rows
  await c.end()
}

/**
 * القيد الذي يحرس عموداً بهذا الاسم، أياً كان جدوله.
 *
 * الأسماء في الترميز camelCase وفي القاعدة snake_case — والمطابقة الحرفية
 * كانت تُبلّغ أن «الرقم الموحّد بلا قيد» وقيدُه موجود. بلاغٌ كاذب يرسل أحداً
 * ليصلح ما ليس معطلاً، وهو أسوأ من صمت.
 *
 * ولا يكفي أن يرد الاسم في نصّ القيد: حقلٌ اسمه draft كان يُطابَق بـ
 * reports_status_check لأن 'draft' إحدى القيم المسموحة داخله — لا لأنه عمود.
 * فالمطابقة الآن مشروطة بوجود عمود بهذا الاسم في جدول القيد نفسه.
 */
const snake = (s) => String(s || '')
  .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
  .toLowerCase()

const hasCol = (tbl, col) =>
  columns.some((c) => c.tbl === String(tbl).replace(/^public\./, '') && c.col === col)

const findGuard = (n) => constraints.find((k) =>
  hasCol(k.tbl, n) && new RegExp(`\\b${n}\\b`).test(k.def))

const guardFor = (name) => {
  if (!name) return null
  const n = snake(name)
  // الاسم في الواجهة يوصف الغرض، وفي القاعدة يوصف العمود: inviteEmail يُكتب
  // في pending_invites.email لا في عمود اسمه invite_email. فإن لم يُطابَق
  // الاسم كاملاً، جُرّب مقطعه الأخير.
  const hit = findGuard(n) || (n.includes('_') ? findGuard(n.split('_').pop()) : null)
  return hit ? `${hit.tbl}.${hit.conname}` : null
}
const colFor = (name) => columns.find((c) => c.col === snake(name)) || null

// ---------------------------------------------------------------------------
// ٣) ما يُتوقّع لكل صنف حقل
// ---------------------------------------------------------------------------
const CLASS = [
  // البحث والعنوان يُعرفان بالاسم قبل كل شيء: نائب حقل البحث يذكر «البريد»
  // ونائب العنوان يذكر «الرمز البريدي»، وكلاهما ليس بريداً إلكترونياً.
  [/^(q|query|search|addSearch|companySearch|searchTerm|filter)$/i, 'بحث', 'حدّ أعلى فقط'],
  [/address|عنوان/i, 'عنوان', 'طول + بلا تحكّم'],
  [/^(cr_?number|crNumber|cr)$/i, 'رقم سجل', 'digits(10)'],
  [/unified/i, 'رقم موحّد', 'digits(10) يبدأ 70'],
  [/phone|jawwal|mobile/i, 'جوّال', '05XXXXXXXX'],
  [/email|بريد/i, 'بريد', 'RFC + طول'],
  [/capital|amount|value|price|fee|مبلغ|قيمة/i, 'مالي', 'numeric ≥ 0'],
  [/date|تاريخ|_at$/i, 'تاريخ', 'تقويم صالح'],
  [/url|website|link/i, 'رابط', 'https فقط'],
  [/name|اسم/i, 'اسم', 'طول + بلا تحكّم'],
  [/desc|note|reason|detail|comment|وصف|ملاحظ|سبب/i, 'نصّ طويل', 'حدّ أعلى'],
]
const classify = (f) => {
  // النوع المعلن أصدق من الاسم: input type="date" تاريخٌ وإن سُمّي dealtAt.
  if (f.tag === 'select') return { label: 'قائمة', expect: 'enum في القاعدة' }
  if (f.type === 'file') return { label: 'ملف', expect: 'نوع + حجم + توقيع' }
  if (/^(date|datetime-local|month|week)$/.test(f.type)) {
    return { label: 'تاريخ', expect: 'تقويم صالح + مدى' }
  }
  if (f.type === 'checkbox' || f.type === 'radio') {
    return { label: 'اختيار', expect: 'قيمة ضمن مجموعة' }
  }
  // الاسم أوّلاً ثم النائب. خلطهما في نصّ واحد كان يصنّف حقل بحث «بريداً»
  // لأن نائبه «ابحث بالاسم أو البريد»، ويصنّف nationalAddress بريداً لأن
  // نائبه يذكر «الرمز البريدي» — وهو بريد المراسلات لا البريد الإلكتروني.
  for (const [re, label, expect] of CLASS) if (re.test(f.name || '')) return { label, expect }
  for (const [re, label, expect] of CLASS) if (re.test(f.placeholder)) return { label, expect }
  if (f.type === 'number') return { label: 'رقم', expect: 'min/max' }
  return { label: 'نصّ', expect: 'حدّ أعلى' }
}

// ---------------------------------------------------------------------------
// ٤) التقرير
// ---------------------------------------------------------------------------
// أنواعٌ لا معنى لـ maxLength فيها: المتصفّح يتجاهله، والقيمة ليست نصّاً حرّاً.
const NO_TEXT = new Set(['checkbox', 'radio', 'date', 'datetime-local', 'time',
  'month', 'week', 'number', 'range', 'color', 'file', 'submit', 'button', 'hidden'])

const rows = fields.map((f) => {
  const { label, expect } = classify(f)
  const db = guardFor(f.name)
  const col = colFor(f.name)
  const gaps = []
  if (f.tag !== 'select' && !NO_TEXT.has(f.type) && !f.maxLength
      && label !== 'رقم' && label !== 'تاريخ') {
    gaps.push('بلا maxLength')
  }
  if (f.type === 'number' && (f.min === null || f.max === null)) gaps.push('بلا min/max')
  // accept قد يُضبط أمراً لا خاصيةً: CompanyImportSheet يكتبه على الـref حسب
  // المصدر المختار، فخاصيةٌ ثابتة في الوسم كانت ستُدهَس — ووضعُ قيمة خاطئة
  // فيها يكسر الاختيار.
  if (f.type === 'file' && !f.accept && !dynamicAccept.has(f.file)) gaps.push('بلا accept')
  // القيد في القاعدة يُطلب لِما يُخزَّن ويُطابَق عليه. حقل بحث لا يُخزَّن.
  if (['رقم سجل', 'رقم موحّد', 'جوّال', 'بريد'].includes(label) && !db) gaps.push('بلا قيد قاعدة')
  return { ...f, label, expect, db, col, gaps }
})

const shown = gapsOnly ? rows.filter((r) => r.gaps.length) : rows

// تجميع حسب الملف.
const byFile = {}
for (const r of shown) (byFile[r.file] = byFile[r.file] || []).push(r)

console.log(`حقول الإدخال: ${fields.length} في ${new Set(fields.map((f) => f.file)).size} ملفاً`)
console.log(`قيود CHECK في القاعدة: ${constraints.length}`)
console.log(gapsOnly ? '\n── الحقول التي ينقصها حارس ظاهر ──\n' : '\n')

for (const [file, list] of Object.entries(byFile).sort()) {
  console.log(`\n${file}`)
  for (const r of list) {
    const bits = [
      `${r.tag}/${r.type}`,
      r.maxLength ? `max ${r.maxLength}` : null,
      r.required ? 'مطلوب' : null,
      r.pattern ? 'pattern' : null,
      r.accept ? `accept` : null,
      r.db ? `db:${r.db.split('.').pop()}` : null,
    ].filter(Boolean)
    console.log(`   ${(r.name || '—').padEnd(22)} ${r.label.padEnd(10)} ${bits.join(' · ')}`)
    if (r.gaps.length) console.log(`   ${' '.repeat(22)} ⚠️  ${r.gaps.join(' · ')}`)
  }
}

const withGaps = rows.filter((r) => r.gaps.length)
const counts = {}
for (const r of rows) counts[r.label] = (counts[r.label] || 0) + 1

console.log('\n── حسب الصنف ──')
for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
  const g = rows.filter((r) => r.label === k && r.gaps.length).length
  console.log(`   ${k.padEnd(12)} ${String(v).padStart(3)}${g ? `   منها ${g} بثغرة` : ''}`)
}

console.log(`\nالمجموع: ${rows.length} حقلاً · ${withGaps.length} ينقصه حارس ظاهر`)
console.log('(الحارس الظاهر في الترميز ليس كل الحماية — القاعدة والخادم طبقتان أخريان)')
