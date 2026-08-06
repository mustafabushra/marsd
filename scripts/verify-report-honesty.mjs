#!/usr/bin/env node
/**
 * Does the trust report ever state a verdict the data did not produce?
 *
 * Found while redesigning it: one panel printed «موثوق» in green as a literal
 * string, on every company, whatever its risk band. A high-risk company was
 * shown, in the same report that scored it high-risk, that it was trusted.
 *
 * Nothing errored. No test failed. The word was markup, so no amount of
 * checking the calculation would ever have caught it — the arithmetic was right
 * and the page disagreed with it.
 *
 * The same panel drew the layer weights as a hardcoded 30/50/20 bar beside the
 * real ones read from `trust_scores.breakdown`. Two panels answering one
 * question, and the prettier one was fiction.
 *
 * So this reads the source and refuses both shapes.
 *
 *   node scripts/verify-report-honesty.mjs
 */

import { readFileSync, readdirSync } from 'node:fs'

const FILES = [
  'src/pages/TrustReport.jsx',
  ...readdirSync('src/components/report').map((f) => `src/components/report/${f}`),
]

let failed = 0
const check = (ok, name, detail = '') => {
  console.log(`  ${ok ? '✅' : '❌'} ${name}${ok ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}

/**
 * The file with every comment blanked out, line numbering preserved.
 *
 * The first version of this check scanned raw text and flagged its own
 * explanatory comments — which describe the bug in the words the bug used. A
 * checker that reports its own documentation trains people to skip its output,
 * which costs more than the thing it was watching for.
 */
function codeOnly(src) {
  const out = []
  let inBlock = false
  for (const line of src.split('\n')) {
    let l = line
    if (inBlock) {
      const end = l.indexOf('*/')
      if (end === -1) { out.push(''); continue }
      l = ' '.repeat(end + 2) + l.slice(end + 2)
      inBlock = false
    }
    // Strip a block comment that opens and may not close on this line.
    for (;;) {
      const open = l.indexOf('/*')
      if (open === -1) break
      const close = l.indexOf('*/', open + 2)
      if (close === -1) { l = l.slice(0, open); inBlock = true; break }
      l = l.slice(0, open) + ' '.repeat(close + 2 - open) + l.slice(close + 2)
    }
    const lineComment = l.indexOf('//')
    if (lineComment !== -1) l = l.slice(0, lineComment)
    out.push(l)
  }
  return out
}

// ---------------------------------------------------------------------------
// A verdict must come from the band
// ---------------------------------------------------------------------------
// Matched with word boundaries. «موثوق» inside «موثوقية التقرير» is a different
// word about a different subject — the report's own reliability, not a claim
// about the company — and flagging it was the checker being wrong, not the page.
const VERDICT = /(^|[\s>"'(])(موثوق|موثوقة|آمنة?|سليمة?|ممتازة?)($|[\s<"',.)])/

for (const file of FILES) {
  const lines = codeOnly(readFileSync(file, 'utf8'))
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!VERDICT.test(line)) continue

    // Produced from data rather than asserted: a lookup keyed by band or tier,
    // or a comparison against a value that came out of the database.
    const fromData = /^\s*(low|medium|high|none|full|preliminary)\s*:/.test(line)
      || /\b(label|verdict|t)\s*:/.test(line)
      || /===|!==|\?\s*'|\bincludes\(/.test(line)
    // A sentence saying there is no verdict is not a verdict.
    const isNegation = /لا توجد|غير كافية|لإصدار|بيانات غير|لم /.test(line)

    if (fromData || isNegation) continue
    check(false, `${file}:${i + 1}`, `حكم مكتوب نصاً: ${line.trim().slice(0, 70)}`)
  }
}
check(true, 'لا حكم عن الشركة مكتوب نصاً خارج جدول الحالات')

// ---------------------------------------------------------------------------
// Weights must never be literals
// ---------------------------------------------------------------------------
// The three layer weights live in system_settings.trust_score_rules and an
// operator can change them from the admin screen. A percentage typed into the
// markup keeps showing the old split for ever, and looks exactly as
// authoritative as the real one beside it.
for (const file of FILES) {
  const lines = codeOnly(readFileSync(file, 'utf8'))
  for (let i = 0; i < lines.length; i++) {
    if (/(الرسمية|المجتمع|المنصة)\s*\d{1,3}\s*%/.test(lines[i])) {
      check(false, `${file}:${i + 1}`, `وزن طبقة مكتوب نصاً: ${lines[i].trim().slice(0, 70)}`)
    }
  }
}
check(true, 'أوزان الطبقات تُقرأ من القاعدة لا تُكتب نصاً')


// ---------------------------------------------------------------------------
// No raw database codes on screen
// ---------------------------------------------------------------------------
// The reports panel printed «⚔️ 2 dispute» — the emoji from a CASE statement
// inside get_company_reports_summary, and the label straight from the column.
// The Arabic names were already in the file, used by a different panel.
for (const file of FILES) {
  const lines = codeOnly(readFileSync(file, 'utf8'))
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    // A code inside a lookup or a comparison is how it is meant to be used;
    // one interpolated straight into JSX is the code reaching the screen.
    if (!/\{\s*(item|r|report|s)\.(category|severity)\s*\}/.test(l)) continue
    check(false, `${file}:${i + 1}`, `رمز تصنيف يُعرض خاماً: ${l.trim().slice(0, 60)}`)
  }
}
check(true, 'لا رمز تصنيف يصل الشاشة بلا ترجمة')

// And an emoji chosen inside a stored procedure is presentation in the wrong
// layer: it cannot be changed without a migration, and it was wrong.
for (const file of FILES) {
  const lines = codeOnly(readFileSync(file, 'utf8'))
  for (let i = 0; i < lines.length; i++) {
    if (/\{\s*(item|r|report)\.(icon|color)\s*\}/.test(lines[i])) {
      check(false, `${file}:${i + 1}`, 'يعرض أيقونة أو لوناً قادماً من SQL')
    }
  }
}
check(true, 'العرض لا يأخذ أيقوناته وألوانه من قاعدة البيانات')

// ---------------------------------------------------------------------------
// One question, one panel
// ---------------------------------------------------------------------------
// Counted in the render body only. A component's own definition and the
// comments naming it are not renders, and counting them was how this check
// first reported three copies of a panel that appears once.
const reportSrc = readFileSync('src/pages/TrustReport.jsx', 'utf8')
const reportCode = codeOnly(reportSrc).join('\n')
const renders = (name) =>
  (reportCode.match(new RegExp(`<${name}(\\s|/|>)`, 'g')) ?? []).length

for (const comp of ['ReportHeader', 'PaymentBehaviour', 'EvidenceStrength',
  'ScoreContext', 'ScoreLayers', 'ScoreHistory', 'ReportBreakdown',
  'ReportTimeline', 'OfficialIdentity', 'ReportConfidence', 'Disclaimer']) {
  const n = renders(comp)
  check(n === 1, `${comp} يُعرض مرة واحدة`, `عُرض ${n} مرة`)
}

// And the panels that were removed have not crept back.
for (const [heading, why] of [
  ['تركيبة مؤشر الثقة', 'مكرر لـ ScoreLayers وكان يرسم أوزاناً ثابتة'],
  ['سجل تغيّرات التقييم', 'مكرر لـ ScoreHistory'],
]) {
  check(!reportCode.includes(`>${heading}<`), `«${heading}» لم يعد`, why)
}

console.log(failed ? `\n  ❌ ${failed} فحص فشل\n` : '\n  ✅ كل الفحوصات نجحت\n')
process.exit(failed ? 1 : 0)
