#!/usr/bin/env node
/**
 * يضع maxLength على كل حقل نصّي في مرصد، بحدٍّ يناسب وظيفته.
 *
 * ============================================================================
 * لماذا أداة لا تحرير يدوي
 * ============================================================================
 * مئةٌ وتسعة عشر حقلاً في أربعين ملفاً. اليد تُخطئ في هذا العدد، والخطأ صامت:
 * حقلٌ نُسي يبقى بلا حدّ، وحقلٌ أُعطي حدّ غيره يقصّ نصّاً مشروعاً. الأداة تُطبّق
 * التصنيف نفسه على الجميع، ويُعاد تشغيل الجرد بعدها فيقول كم بقي.
 *
 * ============================================================================
 * لماذا هذا آمن
 * ============================================================================
 * maxLength إضافةٌ محضة: يمنع الكتابة واللصق بعد الحدّ ولا يغيّر قيمةً قائمة
 * ولا يمنع إرسالاً. والمتصفّح يتجاهله على أنواع غير نصّية، فوضعه على حقل
 * \u200Etype={f.type}\u200E ديناميكي لا يضرّ حين يصير التاريخ تاريخاً.
 *
 * ولا يُلمس ما له maxLength أصلاً.
 *
 *   node scripts/add-field-limits.mjs --dry     يعرض ولا يكتب
 *   node scripts/add-field-limits.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative, sep } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dry = process.argv.includes('--dry')

const files = []
const walk = (d) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name)
    if (e.isDirectory()) walk(p)
    else if (e.name.endsWith('.jsx')) files.push(p)
  }
}
for (const d of ['src/pages', 'src/components']) walk(join(root, d))

/** أنواع لا معنى لـ maxLength عليها — المتصفّح يتجاهله والقيمة ليست نصّاً. */
const SKIP_TYPE = new Set(['checkbox', 'radio', 'file', 'submit', 'button',
  'hidden', 'range', 'color', 'number', 'date', 'datetime-local', 'time',
  'month', 'week'])

const attr = (tag, name) => {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|\\{([^}]*)\\})`))
  return m ? (m[1] ?? m[2] ?? m[3]).trim() : null
}

/**
 * الحدّ المناسب لهذا الحقل.
 *
 * الترتيب مقصود: النوع المعلن أوّلاً (بريد، هاتف، رابط)، ثم الاسم. وحقل البحث
 * يُعرف باسمه لا بنوعه — فكلّها type="text".
 */
function limitFor (tag, kind, name, placeholder) {
  const key = `${name || ''} ${placeholder || ''}`
  const type = (attr(tag, 'type') || '').replace(/['"]/g, '')

  if (type === 'email') return 'email'
  if (type === 'tel') return 'phone'
  if (type === 'url') return 'website'

  if (/^(q|query|search|addSearch|companySearch|searchTerm|shownLabel|draft)$/i.test(name || '')
      || /بحث|ابحث/.test(placeholder || '')) return 'search'

  if (/email|بريد/i.test(key)) return 'email'
  if (/phone|jawwal|mobile|جوّال|جوال/i.test(key)) return 'phone'
  if (/url|website|link|رابط/i.test(key)) return 'website'
  if (/^(cr_?number|crNumber|unifiedNumber|unified_number)$/i.test(name || '')) return 'identifier'
  if (/capital|amount|value|price|fee|مبلغ|قيمة/i.test(key)) return 'money'
  // أعمدة تصنيف بحدّ 100 في القاعدة — و200 هنا كان سيسمح بما ترفضه.
  if (/^(crType|cr_type|entityType|entity_type|kind|status|region|city|sector)$/i.test(name || '')) {
    return 'label'
  }

  // نصوص حرّة: الوصف والتفاصيل أطول من السبب والملاحظة.
  if (/desc|detail|message|وصف|تفاصيل|رسالة/i.test(key)) return 'description'
  if (/reason|note|comment|سبب|ملاحظ/i.test(key)) return 'reason'

  // كل textarea غير مصنَّف نصٌّ حرّ طويل — والقصّ عند 200 يُفسد محتوى مشروعاً.
  if (kind === 'textarea') return 'description'
  return 'name'
}

let changed = 0
const perFile = {}

for (const f of files) {
  let src = readFileSync(f, 'utf8')
  const rel = relative(root, f).split(sep).join('/')
  const hits = []

  // الوسم من اسمه حتى أول \u200E>\u200E يغلقه. الخصائص قد تمتدّ على أسطر.
  src = src.replace(/<(input|textarea)\b([\s\S]*?)(\/>|>)/g, (whole, kind, body, close) => {
    if (/\bmaxLength\b/.test(body)) return whole

    const type = (attr(whole, 'type') || '').replace(/['"]/g, '')
    if (SKIP_TYPE.has(type)) return whole

    const value = attr(whole, 'value') || ''
    const name = attr(whole, 'name')
      || (value.match(/\.(\w+)$/) || value.match(/(\w+)$/) || [])[1] || ''
    const placeholder = attr(whole, 'placeholder') || ''

    const key = limitFor(whole, kind, name, placeholder)
    hits.push(`${(name || '—').padEnd(20)} ${kind.padEnd(8)} → LIMITS.${key}`)

    // تُوضع مباشرة بعد اسم الوسم كي تبقى ظاهرة عند القراءة.
    return `<${kind} maxLength={LIMITS.${key}}${body}${close}`
  })

  if (!hits.length) continue

  // الاستيراد: يُضاف إن لم يكن، بمسار نسبي من موقع الملف.
  if (!/from\s+'[^']*lib\/validate/.test(src)) {
    const depth = rel.split('/').length - 2      // src/… → عدد المجلّدات تحت src
    const path = `${'../'.repeat(depth)}lib/validate.js`
    const lastImport = [...src.matchAll(/^import .*$/gm)].pop()
    if (!lastImport) {
      console.error(`⚠️  ${rel}: لا سطر import — يُتخطّى`)
      continue
    }
    const at = lastImport.index + lastImport[0].length
    src = `${src.slice(0, at)}\nimport { LIMITS } from '${path}'${src.slice(at)}`
  }

  perFile[rel] = hits
  changed += hits.length
  if (!dry) writeFileSync(f, src)
}

for (const [f, hits] of Object.entries(perFile).sort()) {
  console.log(`\n${f}`)
  for (const h of hits) console.log(`   ${h}`)
}
console.log(`\n${dry ? '(تجربة) ' : ''}${changed} حقلاً في ${Object.keys(perFile).length} ملفاً`)
