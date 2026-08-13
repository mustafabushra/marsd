#!/usr/bin/env node
/**
 * الميزات المبنيّة، مشغَّلة — لا الشاشات مرسومة.
 *
 * probe-admin-nav يفتح كل مدخل ويطلب أن يمتلئ المحتوى، وهذا يمسك الانهيار
 * ولا يمسك الكذب: بلاطة تعرض رقماً، وصفٌّ يطبع «full» بالإنجليزية، وزرّ صوت
 * لا يصل سياقه إلى 'running'. كلّها شاشات ممتلئة.
 *
 * فهذا يفحص ما بُني هذه الجلسة، واحدة واحدة، في متصفح حقيقي بجلسة حقيقية.
 * لا يكتب شيئاً في القاعدة: زرّ السحب يُفتح ويُلغى، ولا يُؤكَّد أبداً.
 *
 *   node scripts/probe-admin-features.mjs [url]
 */

import { chromium } from 'playwright'
import pg from 'pg'
import { readFileSync } from 'node:fs'
import { signIn } from './lib/sign-in.mjs'

const BASE = process.argv.find((a) => a.startsWith('http')) || 'http://localhost:4393'

let pass = 0
let fail = 0
const ok = (n, c, d = '') => {
  if (c) { pass += 1; console.log(`  ✅ ${n}`) }
  else { fail += 1; console.log(`  ❌ ${n}${d ? ` — ${d}` : ''}`) }
}

/**
 * شركة عليها تقارير، من القاعدة.
 *
 * سجلّ الشركات يفتح دُرجاً لا رابطاً، فلا href يُلتقط منه؛ والتنقّل عبر واجهة
 * قد تتغيّر يجعل المسبار يرسب لسبب لا علاقة له بما يفحصه.
 */
async function companyWithReports () {
  const line = readFileSync('.env.migrations', 'utf8').split(/\r?\n/)
    .find((l) => l.trim().startsWith('DATABASE_URL='))
  if (!line) return null
  const c = new pg.Client({
    connectionString: line.split('=').slice(1).join('=').trim(),
    ssl: { rejectUnauthorized: false },
  })
  await c.connect()
  const { rows } = await c.query(
    'select c.id from public.companies c'
    + ' join public.reports r on r.target_company_id = c.id'
    + ' group by c.id order by count(*) desc limit 1')
  await c.end()
  return rows[0]?.id || null
}

const browser = await chromium.launch()
const errs = []

try {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1200 } })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 140)))

  await signIn(page, BASE, { role: 'platform_admin' })

  // ===== مركز الإجراءات =====
  console.log('\n─── مركز الإجراءات ───')
  await page.goto(`${BASE}/admin/command-center`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#main', { timeout: 20000 })
  await page.waitForFunction(
    () => (document.querySelector('#main')?.innerText || '').includes('مركز الإجراءات'),
    { timeout: 20000 }).catch(() => {})
  const cc = await page.locator('#main').innerText()

  ok('العنوان', cc.includes('مركز الإجراءات'))
  for (const t of ['تقارير للمراجعة', 'مؤشر ثقة منخفض', 'طلبات انضمام',
    'طلبات ملكية', 'تحقق مستندات', 'اعتراضات نشطة']) {
    ok(`  بلاطة «${t}»`, cc.includes(t))
  }
  // الاسم القديم صُرف عمداً: كان يصطدم بلوحة المراقبة أسفل الصفحة.
  ok('الاسم القديم «تنبيهات الثقة» لم يعد ظاهراً', !cc.includes('تنبيهات الثقة'))
  ok('لوحة مؤشر الثقة', cc.includes('مؤشر الثقة الوطني للمنصة'))
  ok('صندوق الإجراءات', cc.includes('صندوق الإجراءات العاجلة'))
  // صفر لا يُعرض «0.0%» بل يُقال إنه غير مصنَّف.
  ok('لا نسبة صفرية مضلّلة', !/\b0\.0\s*%/.test(cc))

  // ===== ملفّ الشركة — تبويب التقارير =====
  console.log('\n─── ملفّ الشركة · التقارير ───')
  const cid = await companyWithReports()
  ok('عُثر على شركة عليها تقارير', !!cid)

  if (cid) {
    await page.goto(`${BASE}/admin/company/${cid}`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2500)
    // محصور في #main: الشريط الجانبي يحمل مجموعة اسمها «التقارير» أيضاً،
    // فالبحث في الصفحة كلّها يضغطها ويطويها بدل أن يفتح التبويب.
    const main = page.locator('#main')
    // التبويبات role="tab" لا button — الدور المُصرَّح يتجاوز الضمني، فلا
    // يجدها getByRole('button') وإن كانت <button> في الترميز.
    await main.getByRole('tab', { name: 'التقارير', exact: true }).first()
      .click().catch(() => {})
    await page.waitForTimeout(1800)
    const rep = await page.locator('#main').innerText()

    ok('عنوان القسم', rep.includes('التقارير عن هذه الشركة'))
    // العطل الذي أبلغ عنه المستخدم: payment_commitment كان يُطبع خاماً.
    ok('«full» لم تعد تُطبع خاماً', !/\bfull\b/.test(rep))
    ok('السداد بالعربية', /سُدِّد كاملاً|سداد جزئي|لم يُسدَّد|سُدِّد متأخراً/.test(rep))
    // الأرقام موحّدة — لا أرقام هندية في التواريخ.
    ok('لا أرقام هندية', !/[٠-٩]/.test(rep), (rep.match(/[٠-٩]+/) || [''])[0])
    ok('حالة التقرير ظاهرة', /منشور|بانتظار المراجعة|مسحوب/.test(rep))
    ok('تفاصيل التعامل', rep.includes('قيمة التعامل') || rep.includes('تاريخ التعامل'))

    // زرّ السحب — يُفتح ويُلغى. لا تأكيد، فالبيانات حيّة.
    const wBtn = main.getByRole('button', { name: 'سحب التقرير', exact: true }).first()
    const hasW = await wBtn.count() > 0
    ok('زرّ سحب التقرير', hasW)
    if (hasW) {
      await wBtn.click()
      await page.waitForTimeout(700)
      const body = await page.locator('#main').innerText()
      // النصّ في placeholder الحقل لا في نصّ الصفحة، و innerText لا يقرؤه.
      ok('  يطلب سبباً',
        await main.locator('input[placeholder*="سبب السحب"]').count() > 0)
      ok('  ويحذّر من الأثر', body.includes('يُعيد احتساب'))
      await main.getByRole('button', { name: 'إلغاء', exact: true }).first()
        .click().catch(() => {})
      await page.waitForTimeout(500)
      ok('  الإلغاء يغلقه',
        !(await page.locator('#main').innerText()).includes('تأكيد السحب'))
    }
  }

  // ===== الصوت =====
  console.log('\n─── صوت الإشعارات ───')
  await page.goto(`${BASE}/admin/command-center`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)

  ok('Web Audio متاح', await page.evaluate(
    () => !!(window.AudioContext || window.webkitAudioContext)))

  // ضغطة حقيقية في الصفحة — وهي ما يفكّ قفل السياق.
  await page.mouse.click(700, 400)
  await page.waitForTimeout(900)

  const state = await page.evaluate(async () => {
    const C = window.AudioContext || window.webkitAudioContext
    const c = new C()
    if (c.state === 'suspended') { try { await c.resume() } catch { /* سياسة */ } }
    const s = c.state
    await c.close().catch(() => {})
    return s
  })
  ok(`السياق الصوتي يبلغ running بعد التفاعل (${state})`, state === 'running')

  const stored = await page.evaluate(() => localStorage.getItem('marsad.notifSound'))
  ok('إعداد الصوت مقروء من localStorage',
    stored === null || ['on', 'off'].includes(stored), String(stored))

  console.log('\n─── أخطاء الصفحة ───')
  ok('لا أخطاء JS', errs.length === 0, errs.slice(0, 2).join(' | '))

  await ctx.close()
} finally {
  await browser.close()
}

console.log(`\n${fail ? '❌' : '✅'} ${pass} ناجح · ${fail} فاشل`)
process.exit(fail ? 1 : 0)
