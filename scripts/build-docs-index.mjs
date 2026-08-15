#!/usr/bin/env node
/**
 * فهرس البحث في التوثيق — يُبنى مرّة، ويُقرأ جاهزاً.
 *
 * ============================================================================
 * لماذا وقت البناء لا وقت التشغيل
 * ============================================================================
 * البديل أن يُنزّل المتصفّح كل ملفّات MDX ويُحلّلها ليبحث فيها. وذلك يُبطئ
 * أوّل بحث، ويكبر خطّياً مع كل صفحة تُضاف — أي أنه يعمل عند عشر صفحات ويسقط
 * عند مئة، وهو ما طُلب أن يتحمّله.
 *
 * فالفهرس يُبنى هنا: عنوانٌ ووصفٌ وعناوين فرعية ونصٌّ مُجرَّد من صيغة MDX،
 * مطويّ بطيّ العربية نفسه الذي تستعمله لوحة الأوامر. والمتصفّح يُنزّل JSON
 * واحداً صغيراً.
 *
 * ============================================================================
 * ومعرّفات العناوين
 * ============================================================================
 * تُشتقّ باستيراد `slugifyHeading` من mdxComponents لا بنسخها — فنسختان
 * تفترقان، والنتيجة فهرسٌ يقفز إلى لا شيء.
 *
 *   npm run docs:index
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join, relative, sep } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const CONTENT = join(root, 'content', 'docs')
// إلى public/ لا إلى src/: الاستيراد يُدخل الفهرس في حزمة التوثيق، فيكبر
// أوّل تحميل مع كل صفحة تُضاف — نحو ٥٫٥ ك.ب لكل صفحة، أي ميغابايت ونصف عند
// ثلاثمئة. وملفٌّ في public يُجلَب عند أوّل بحث ويُخزَّن في ذاكرة المتصفّح.
const OUT = join(root, 'public', 'docs-search-index.json')

const { fold } = await import(pathToFileURL(join(root, 'src', 'lib', 'extraction', 'fold.js')).href)
const { slugifyHeading } = await import(pathToFileURL(join(root, 'src', 'docs', 'mdxComponents.jsx')).href)
  .catch(() => ({ slugifyHeading: null }))

/** نسخة احتياطية مطابقة — تُستعمل إن تعذّر استيراد JSX من Node. */
const slugify = slugifyHeading || ((t) => String(t ?? '').trim()
  .replace(/[\s ]+/g, '-')
  .replace(/[^\p{L}\p{N}_-]/gu, '')
  .replace(/-{2,}/g, '-')
  .replace(/^-|-$/g, '')
  .toLowerCase())

if (!existsSync(CONTENT)) {
  console.error('❌ content/docs غير موجود')
  process.exit(2)
}

const files = []
const walk = (d) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name)
    if (e.isDirectory()) walk(p)
    else if (e.name.endsWith('.mdx')) files.push(p)
  }
}
walk(CONTENT)

/**
 * يُجرّد MDX إلى نصّ يُبحث فيه.
 *
 * ما يُحذف: كتل الشيفرة (أسماء دوالّ لا نثر)، وسوم JSX، الاستيراد والتصدير،
 * وصيغة Markdown. وما يبقى: ما يقرؤه إنسان.
 */
const plainText = (src) => src
  .replace(/^---[\s\S]*?^---/m, '')
  .replace(/```[\s\S]*?```/g, ' ')
  .replace(/^import .*$/gm, ' ')
  .replace(/^export .*$/gm, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
  .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
  .replace(/[#*_`>|]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()

/** `export const meta = {...}` — يُقرأ بلا تنفيذ الملفّ. */
const readMeta = (src) => {
  const m = /export\s+const\s+meta\s*=\s*(\{[\s\S]*?\n\})/m.exec(src)
  if (!m) return {}
  try {
    // eslint-disable-next-line no-new-func
    return Function(`"use strict";return (${m[1]})`)()
  } catch { return {} }
}

const entries = []
for (const f of files) {
  const rel = relative(CONTENT, f).split(sep).join('/')
  const lang = rel.split('/')[0]
  const slug = rel.slice(lang.length + 1).replace(/\.mdx$/, '')
  const src = readFileSync(f, 'utf8')
  const meta = readMeta(src)

  const headings = [...src.matchAll(/^(#{2,3})\s+(.+)$/gm)].map((h) => ({
    text: h[2].replace(/[`*_]/g, '').trim(),
    id: slugify(h[2].replace(/[`*_]/g, '').trim()),
    depth: h[1].length,
  }))

  // مسارات نقاط النهاية تُلتقط صراحةً: من يبحث عن «scan-document» يقصدها.
  const endpoints = [...src.matchAll(/path="([^"]+)"/g)].map((m) => m[1])

  const body = plainText(src)

  entries.push({
    slug,
    lang,
    title: meta.title || slug,
    description: meta.description || '',
    headings,
    endpoints,
    // النصّ يُقتطع: الفهرس أداة عثور لا نسخة من الموقع. أول ١٢٠٠ حرف تكفي
    // لإيجاد الصفحة، والصفحة نفسها تُقرأ بعد الوصول إليها.
    excerpt: body.slice(0, 1200),
    // مطويّ مسبقاً كي لا يُطوى في المتصفّح مع كل ضغطة مفتاح.
    haystack: fold([
      meta.title || '', meta.description || '',
      headings.map((h) => h.text).join(' '),
      endpoints.join(' '),
      body.slice(0, 4000),
    ].join(' ')),
  })
}

entries.sort((a, b) => a.lang.localeCompare(b.lang) || a.slug.localeCompare(b.slug))

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, `${JSON.stringify(entries)}\n`)

const kb = (Buffer.byteLength(JSON.stringify(entries)) / 1024).toFixed(1)
const byLang = entries.reduce((a, e) => ({ ...a, [e.lang]: (a[e.lang] || 0) + 1 }), {})
console.log(`✅ فُهرست ${entries.length} صفحة (${Object.entries(byLang).map(([l, n]) => `${l}:${n}`).join(' · ')}) — ${kb} ك.ب`)
const noHeadings = entries.filter((e) => e.headings.length === 0)
if (noHeadings.length) {
  console.log(`⚠️  ${noHeadings.length} صفحة بلا عناوين فرعية: ${noHeadings.map((e) => `${e.lang}/${e.slug}`).join(', ')}`)
}
