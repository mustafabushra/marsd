#!/usr/bin/env node
/**
 * Does the product describe its monthly limit as the thing it actually counts?
 *
 * `searches_per_month` counts distinct companies whose *report* was opened this
 * month. Searching is free, unlimited, and always was — it runs on every
 * keystroke behind a debounce, and charging for it would spend a whole month's
 * allowance typing one company's name.
 *
 * The key's name says otherwise, and the wording followed the key rather than
 * the behaviour. The same limit was called four different things:
 *
 *     الاشتراك    «تقارير الشركات المفتوحة شهرياً»   ← correct
 *     التقرير      «بلغت حد عمليات البحث»
 *     لوحة الباقات «بحث/شهر»
 *     الشركاء      «100 بحث شهرياً»                  ← a public promise
 *
 * So a customer searched, watched the number stay where it was, and reported it
 * as broken. Nothing was broken. Three screens had told them the wrong thing
 * about what they were buying — including the public pricing page, where
 * "50 عملية بحث شهرية" both misnames the limit and undersells it.
 *
 * This keeps the words attached to the behaviour. It is a text check because
 * there is nothing else to check: the counter is right and the sentences were
 * wrong, which no test of the counter could ever have found.
 *
 * It also checks where the meter is allowed to run. Since migration 109 every
 * opening is charged, including a repeat, so a metered call on any path that
 * re-fetches by itself would bill a reader for sitting still — the report page
 * re-reads whenever a score moves, several times an hour on a busy company.
 *
 *   node scripts/verify-quota-rules.mjs
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

let failed = 0
const check = (ok, name, detail = '') => {
  console.log(`  ${ok ? '✅' : '❌'} ${name}${ok ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(jsx?|tsx?)$/.test(e)) out.push(p.replace(/\\/g, '/'))
  }
  return out
}

/** Comments explain the old wording at length; only rendered text counts. */
function codeOnly(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, ''))
    .join('\n')
}

// A quantity of searches, offered or limited. Not the word «بحث» on its own —
// «ابحث عن شركة» and «نتائج البحث» are the search feature, which is a real
// thing this product has and should go on saying.
const SELLS_SEARCHES = [
  /\d+\s*(?:عملية|عمليات)?\s*بحث\s*(?:شهري|\/\s*شهر|في الشهر|كل شهر)/,
  /(?:عمليات|عملية)\s+بحث\s+(?:شهرية|غير محدودة|متبقية)/,
  /حد\s+عمليات\s+البحث/,
  /بحث\s*\/\s*شهر/,
]

// Since 109 a revisit is charged. Any screen still promising otherwise is
// telling a customer their next click is free when it is not.
const PROMISES_FREE_REVISIT = [
  /بلا احتساب إضافي/,
  /تبقى متاحة لك بلا/,
]

const offenders = []
for (const f of walk('src')) {
  const src = codeOnly(readFileSync(f, 'utf8'))
  for (const [i, line] of src.split('\n').entries()) {
    if ([...SELLS_SEARCHES, ...PROMISES_FREE_REVISIT].some((re) => re.test(line))) {
      offenders.push(`${f}:${i + 1} — ${line.trim().slice(0, 60)}`)
    }
  }
}
check(offenders.length === 0,
  'لا شاشة تبيع «عمليات بحث» ولا تَعِد بإعادة فتح مجانية',
  offenders.join(' | '))

// And the one screen that had it right still does.
const sub = readFileSync('src/pages/Subscription.jsx', 'utf8')
check(/searches_per_month:\s*'[^']*تقارير[^']*'/.test(sub),
  'صفحة الاشتراك تسمّي الحد باسمه',
  'searches_per_month فقد وصفه الصحيح')

// ---------------------------------------------------------------------------
// The meter runs where the reader acts, and nowhere else
// ---------------------------------------------------------------------------
// openCompanyReport belongs in the initial load, once per page. Anything that
// re-fetches on its own — the realtime refresh, a poll, an interval — must not
// reach it: since 109 every call is charged, so an automatic re-read would bill
// somebody for standing still. A busy company's score moves several times an
// hour, and a hundred lookups would be gone by lunchtime.
//
// Checked by shape, not by trust. The comment on that callback used to say the
// arrangement was "harmless today", and it was — until the day the rule changed.
const report = readFileSync('src/pages/TrustReport.jsx', 'utf8')
const calls = [...report.matchAll(/openCompanyReport\s*\(/g)]
check(calls.length === 1, 'العدّاد يُستدعى مرة واحدة في صفحة التقرير',
  `${calls.length} استدعاء — كل واحد يُحتسب على العميل`)

const refresh = /const refreshScore = useCallback\(([\s\S]*?)\n {2}\}, \[/.exec(report)
check(!!refresh, 'دالة التحديث الحيّ موجودة كما هي متوقَّعة',
  'تغيّر شكلها — الفحص التالي لا يقيس شيئاً')
check(!refresh || !/openCompanyReport/.test(refresh[1]),
  'والتحديث الحيّ لا يمرّ بالعدّاد',
  'تحديث تلقائي يستهلك من حصة القارئ بلا فعل منه')

console.log(failed ? `\n  ❌ ${failed} فحص فشل\n` : '\n  ✅ كل الفحوصات نجحت\n')
process.exit(failed ? 1 : 0)
