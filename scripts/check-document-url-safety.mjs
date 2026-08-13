#!/usr/bin/env node
/**
 * ما يقبله عارض المستندات دون توقيع.
 *
 * `company_documents.file_url` حقل ترفعه الشركات، وقيمته تصل إلى `<img src>`
 * وإلى `<a href target="_blank">`. فالسؤال ليس «هل يعمل العارض» بل «ما الذي
 * يرفضه».
 *
 * القاعدة تُقرأ من المصدر لا تُنسخ هنا: نسختان من تعبير نمطي أمني تفترقان،
 * وتبقى الاختبارات خضراء على قاعدة لم تعد مستعملة.
 *
 *   npm run check:doc-urls
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = readFileSync(join(root, 'src', 'components', 'DocumentViewer.jsx'), 'utf8')

const m = src.match(/const SAFE_DATA = (\/.+\/[a-z]*)\s*$/m)
if (!m) {
  console.error('❌ لم يُعثر على SAFE_DATA في DocumentViewer.jsx')
  process.exit(2)
}
// eslint-disable-next-line no-eval
const SAFE_DATA = eval(m[1])
console.log(`القاعدة المقروءة من المصدر: ${m[1]}\n`)

let pass = 0
let fail = 0
const expect = (label, value, want) => {
  const got = SAFE_DATA.test(value)
  if (got === want) { pass += 1; console.log(`  ✅ ${label}`) }
  else { fail += 1; console.log(`  ❌ ${label} — توقّعنا ${want ? 'قبول' : 'رفض'} فكان العكس`) }
}

console.log('─── يجب أن تُقبل ───')
expect('data:image/png     (الصفّ الحقيقي الوحيد)', 'data:image/png;base64,iVBORw0KGgo=', true)
expect('data:image/jpeg', 'data:image/jpeg;base64,/9j/4AAQ', true)
expect('data:image/jpg', 'data:image/jpg;base64,/9j/4AAQ', true)
expect('data:image/webp', 'data:image/webp;base64,UklGRg==', true)
expect('data:application/pdf', 'data:application/pdf;base64,JVBERi0=', true)

console.log('\n─── يجب أن تُرفض ───')
// الشكل الوحيد الذي يهمّ المهاجم فعلاً.
expect('data:text/html', 'data:text/html;base64,PHNjcmlwdD4=', false)
expect('data:text/html غير مرمَّز', 'data:text/html,<script>alert(1)</script>', false)
// SVG تُنفّذ سكربتاً في سياق التنقّل، وإن لم تُنفّذها <img>.
expect('data:image/svg+xml', 'data:image/svg+xml;base64,PHN2Zz4=', false)
expect('javascript:', 'javascript:alert(1)', false)
expect('data:application/javascript', 'data:application/javascript,alert(1)', false)
// رابط خارجي — الفرع الذي حُذف كلّه.
expect('http://', 'http://evil.example/x.png', false)
expect('https://', 'https://evil.example/x.png', false)
// محاولات التفاف على البادئة.
expect('DATA:text/html بحروف كبيرة', 'DATA:text/html,<script>', false)
expect('data: بلا فاصلة منقوطة', 'data:image/png,AAAA', false)
expect('نصّ يحوي data:image/png في وسطه', 'x data:image/png;base64,AA', false)

console.log(`\n${fail ? '❌' : '✅'} ${pass} ناجح · ${fail} فاشل`)
process.exit(fail ? 1 : 0)
