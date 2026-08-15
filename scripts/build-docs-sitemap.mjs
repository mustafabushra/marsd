#!/usr/bin/env node
/**
 * خريطة موقع للتوثيق.
 *
 * ============================================================================
 * لماذا تُولَّد ولا تُكتب
 * ============================================================================
 * خريطةٌ مكتوبة بيد تتخلّف عن أوّل صفحة تُضاف، ولا يلاحظ أحد — فالخريطة
 * الناقصة تعمل، تعمل فقط بمحتوى أقلّ.
 *
 * وهي تُبنى من الملفّات الموجودة فعلاً لا من شجرة التنقّل: صفحةٌ مُدرَجة في
 * الشجرة ولم تُكتب بعد لا يجوز أن تُقدَّم لمحرّك بحث.
 *
 *   npm run docs:sitemap
 */
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative, sep } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const CONTENT = join(root, 'content', 'docs')
const PUBLIC = join(root, 'public')
const SITE = 'https://marsd-peach.vercel.app'

if (!existsSync(CONTENT)) { console.error('❌ content/docs غير موجود'); process.exit(2) }

const files = []
const walk = (d) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name)
    if (e.isDirectory()) walk(p)
    else if (e.name.endsWith('.mdx')) files.push(p)
  }
}
walk(CONTENT)

const pages = files.map((f) => {
  const rel = relative(CONTENT, f).split(sep).join('/')
  const lang = rel.split('/')[0]
  const slug = rel.slice(lang.length + 1).replace(/\.mdx$/, '')
  return { lang, slug, mtime: statSync(f).mtime.toISOString().slice(0, 10) }
})

const urlFor = (p) => `${SITE}${p.lang === 'en' ? `/docs/en/${p.slug}` : `/docs/${p.slug}`}`

// كل صفحة تُعلن نظيرتها بلغة أخرى إن وُجدت — فالمحرّك يعرف أنهما واحدة.
const byKey = new Map(pages.map((p) => [`${p.lang}/${p.slug}`, p]))

const body = pages
  .sort((a, b) => a.lang.localeCompare(b.lang) || a.slug.localeCompare(b.slug))
  .map((p) => {
    const other = p.lang === 'ar' ? byKey.get(`en/${p.slug}`) : byKey.get(`ar/${p.slug}`)
    const alt = other
      ? `\n    <xhtml:link rel="alternate" hreflang="${other.lang}" href="${urlFor(other)}"/>`
      : ''
    return `  <url>
    <loc>${urlFor(p)}</loc>
    <lastmod>${p.mtime}</lastmod>
    <changefreq>weekly</changefreq>${alt}
  </url>`
  })
  .join('\n')

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemap.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${body}
</urlset>
`.replace('www.sitemap.org', 'www.sitemaps.org')

writeFileSync(join(PUBLIC, 'sitemap-docs.xml'), xml)

// robots.txt: تُضاف إشارة الخريطة إن لم تكن، ولا يُمسّ ما فيه.
const robotsPath = join(PUBLIC, 'robots.txt')
let robots = existsSync(robotsPath) ? readFileSync(robotsPath, 'utf8') : 'User-agent: *\nAllow: /\n'
if (!robots.includes('sitemap-docs.xml')) {
  robots = `${robots.trimEnd()}\nSitemap: ${SITE}/sitemap-docs.xml\n`
  writeFileSync(robotsPath, robots)
}

console.log(`✅ خريطة الموقع: ${pages.length} صفحة → public/sitemap-docs.xml`)
