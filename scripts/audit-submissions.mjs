#!/usr/bin/env node
/**
 * Does the screen only claim success after the server granted it?
 *
 * The fault this looks for: a submission that tells somebody it worked, or
 * navigates away, or closes its dialog, before the write it depends on has come
 * back. The database refuses — a business rule, a policy, a constraint — and the
 * person has already been told it went to the reviewers. The rejection arrives
 * afterwards as a notification about something they believe already happened.
 *
 * Three shapes are reported, in the order they matter:
 *
 *   claimed   a success signal — a ✅ toast, a navigation, a dialog closing —
 *             that appears in the source *before* the write it is claiming
 *             about. This is the reported fault.
 *
 *   unread    a write whose outcome is never looked at: no `error` check and
 *             no `.select()` row count. A write RLS filtered out returns no
 *             error and no rows, so «it did not throw» is not the same as «it
 *             happened».
 *
 *   unguarded a handler that writes but never sets a submitting flag, so two
 *             taps are two operations.
 *
 * It reads source, not behaviour, so it is a map rather than a verdict — every
 * finding is a place to look. What it cannot do is miss the shape entirely, and
 * the self-test at the bottom is what makes that claim worth anything: a file
 * with each fault deliberately in it must be caught, or the run aborts.
 *
 *   node scripts/audit-submissions.mjs [--all]
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const VERBOSE = process.argv.includes('--all')

// A write, and only within one statement.
//
// The bridge between the client and the operation used to be `[\s\S]{0,400}?`,
// which happily crossed a semicolon and a blank line: a `.select()` read on one
// line matched the `.update()` three statements below it, and nine of twelve
// findings were reads misreported as writes.
//
// A semicolon is not the boundary here — this codebase omits them. So the bridge
// stops at a newline that begins a new statement: `const`, `let`, `if`,
// `return`, `await`, a closing brace, a setter, a toast. Without that it walked
// from a `.select()` on one line to an `.insert()` three lines below, and then
// measured that insert's outcome inside the wrong enclosing block — reporting a
// write that checks its error perfectly well.
const WRITE = /await\s+(?:supabase|sb|getSupabase\(\))(?:[^;\n]|\n(?!\s*(?:\n|const |let |var |if\s*\(|return\b|await |[})]|set[A-Z]|show[A-Z]|navigate\())){0,300}?\.(insert|update|upsert|delete|rpc|upload)\s*\(/g

// An `rpc` is whichever the function on the other end is. These names read.
// Reporting «the result of company_report_full is unchecked» as a submission
// fault is how a list of thirteen becomes a list nobody opens.
const READ_RPC = /rpc\(\s*['"`](?:get_|my_|public_|search_|admin_[a-z_]*overview|[a-z_]*(?:_overview|_full|_completion|_invoices|_checklist|_types|_history|_context|_timeline|_summary|_balance|_state|_access))/
const SUCCESS = [
  { re: /showToast\(\s*[`'"]\s*✅/, what: 'رسالة نجاح' },
  { re: /setSuccess\(\s*(?:true|[`'"])/, what: 'حالة نجاح' },
  { re: /navigate\(/, what: 'انتقال لصفحة أخرى' },
  { re: /setStep\(\s*(?:step\s*\+|[0-9])/, what: 'انتقال لخطوة تالية' },
]
// A lock while the write is in flight. Two shapes, because both are in use:
// a boolean for a page with one submit, and a per-key flag for a screen where
// each row saves on its own — `setBusyKey(key)` locks that row and nothing
// else, which is the right design and matched none of the boolean patterns.
// AdminSettings.jsx was reported for a double-submit it does not have.
const GUARD = /set(?:Submitting|Saving|Busy|Loading|Sending|Uploading)\w*\s*\(\s*(?:true|[a-zA-Z_$][\w$.]*)\s*\)/
const OUTCOME = /\b(error|Error|err)\b|\.select\(/

/** Every .jsx under a directory. */
function files(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) files(p, out)
    else if (name.endsWith('.jsx')) out.push(p)
  }
  return out
}

/**
 * The function body a position sits inside.
 *
 * Brace counting rather than a parser: the question is only «what runs together
 * with this write», and a handler is the nearest enclosing block. It is
 * approximate, and being approximate here costs a false report, not a missed
 * one — which is the right way round.
 */
function enclosing(src, at) {
  let depth = 0
  let start = at
  for (let i = at; i >= 0; i -= 1) {
    if (src[i] === '}') depth += 1
    else if (src[i] === '{') {
      if (depth === 0) { start = i; break }
      depth -= 1
    }
  }
  depth = 0
  let end = src.length
  for (let i = start; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1
    else if (src[i] === '}') {
      depth -= 1
      if (depth === 0) { end = i; break }
    }
  }
  return { start, end, body: src.slice(start, end) }
}

const lineOf = (src, at) => src.slice(0, at).split('\n').length

/** Scan one file. Returns findings. */
export function scan(path, src, counter) {
  const found = []
  WRITE.lastIndex = 0

  let m
  while ((m = WRITE.exec(src)) !== null) {
    const at = m.index
    const op = m[1]
    if (counter) counter.writes += 1
    const { start, end, body } = enclosing(src, at)
    const rel = at - start

    // A success signal earlier in the same block than the write it claims about.
    for (const s of SUCCESS) {
      const hit = body.search(s.re)
      if (hit >= 0 && hit < rel) {
        // A success signal followed by `return` or `throw` before the write is
        // not a claim about that write — it is a different branch, and it ends.
        //
        // Read across everything in between, not just the first line. The first
        // version looked at one line and reported CompanyUsers.jsx, where the
        // toast belongs to a branch that returns two lines later and never
        // reaches the update at all. One confident false positive is enough to
        // make every other finding suspect.
        const between = body.slice(hit, rel)
        if (/\breturn\b|\bthrow\b/.test(between)) continue
        found.push({
          kind: 'claimed', path, line: lineOf(src, start + hit),
          detail: `${s.what} قبل ${op}()`,
        })
      }
    }

    // Is the outcome of this write ever looked at?
    //
    // Two windows, because the answer lives on both sides of the call. The
    // destructuring that names `error` sits *before* the `await`, and the check
    // that reads it sits after a parameter list that can run to thirty lines —
    // so a fixed window starting at the match reported code that checks its
    // result perfectly well. AdminAddReport.jsx, written the day before with an
    // explicit `if (!data) throw`, was reported by the first version of this.
    //
    // The call's own extent is found by balancing parentheses rather than
    // guessed at, so the window after it starts where the statement ends.
    const openParen = src.indexOf('(', m.index + m[0].length - 1)
    let depth = 0
    let callEnd = openParen
    for (let i = openParen; i < src.length && i < openParen + 4000; i += 1) {
      if (src[i] === '(') depth += 1
      else if (src[i] === ')') {
        depth -= 1
        if (depth === 0) { callEnd = i; break }
      }
    }

    const prefix = src.slice(Math.max(start, at - 140), at)
    const after = src.slice(callEnd, Math.min(end, callEnd + 420))

    // Audit entries are excluded. They are written after the operation they
    // record has already succeeded, deliberately best-effort — a failed log must
    // not undo a saved report. Reporting sixty of them buries the handful that
    // matter, which is how an audit stops being read.
    const call = src.slice(at, callEnd + 1)
    const isAudit = /audit_logs|notifications|analytics/.test(call)
    // Read by name where the name says so, and by inspection where it does not.
    //
    // Each of these was opened and read before being listed. `compute_trust_score`
    // is the one that is genuinely a write and genuinely best-effort: it
    // recomputes a derived number after a report is approved, and a failure
    // must not undo the approval — the next approval recomputes it anyway.
    const READ_BY_INSPECTION = /company_partner_status|document_versions|company_review_file|compute_trust_score/
    const isRead = op === 'rpc' && (READ_RPC.test(call) || READ_BY_INSPECTION.test(call))

    if (!isAudit && !isRead && !OUTCOME.test(prefix) && !OUTCOME.test(after)) {
      found.push({ kind: 'unread', path, line: lineOf(src, at), detail: `${op}() بلا فحص للنتيجة` })
    }

    // Two taps, two operations.
    //
    // The handler's name sits *before* the brace this measures inside, so the
    // declaration is read from the line above rather than from the body. The
    // self-test caught that: the fixture was a textbook double-submit and went
    // unreported, because the only place the name appeared was outside the
    // block being searched.
    const header = src.slice(Math.max(0, start - 160), start)
    if (!GUARD.test(body) && /(const|function)\s+\w*([Ss]ubmit|[Ss]end|[Ss]ave)|onSubmit/.test(header)) {
      found.push({ kind: 'unguarded', path, line: lineOf(src, at), detail: 'إرسال بلا قفل أثناء التنفيذ' })
    }
  }

  return found
}

// --- Does it catch anything? -------------------------------------------------
// A deliberately broken file, with one of each. A check that has never been
// shown to fail is a check nobody should trust — and this one is about to be
// used to decide what does not need fixing.
{
  const broken = `
    const handleSubmit = async () => {
      showToast('✅ تم الإرسال')
      const { data } = await supabase.from('reports').insert([row])
      navigate('/my-reports')
    }
  `
  // And the other direction: code that does check its result must not be
  // reported. A checker that flags everything is as useless as one that flags
  // nothing, and this is the half that decides whether 38 findings are real.
  const correct = `
    const save = async () => {
      setSubmitting(true)
      const { data, error } = await supabase.rpc('admin_set_thing', {
        a: 1, b: 2, c: 3,
      })
      if (error) throw error
      if (!data) throw new Error('لم يُحفظ')
      showToast('✅ تم')
    }
  `
  const clean = scan('selftest-clean', correct)
  if (clean.length) {
    console.log(`
  ❌ المدقّق يبلّغ عن شيفرة سليمة: ${clean.map((x) => x.kind + ':' + x.detail).join(' | ')}`)
    console.log('     عدد الملاحظات لا يعني شيئاً إن كان يشمل السليم.')
    process.exit(2)
  }

  const f = scan('selftest', broken)
  const kinds = new Set(f.map((x) => x.kind))
  if (!kinds.has('claimed') || !kinds.has('unguarded')) {
    console.log(`\n  ❌ المدقّق لا يمسك ما وُضع له عمداً — وجد: ${[...kinds].join(', ') || 'لا شيء'}`)
    console.log('     أي نتيجة بعده لا تعني شيئاً.\n')
    process.exit(2)
  }
  console.log('\n  ✔ المدقّق نفسه مُختبَر: يمسك النجاح المُعلَن قبل الكتابة، والإرسال بلا قفل\n')
}

// --- The application ---------------------------------------------------------
const all = []
// How many writes were looked at. «Zero findings» is only worth reading beside
// this number: a regex that stopped matching reports a clean application in
// exactly the same words as an application that is clean.
const seen = { writes: 0 }
for (const dir of ['src/pages', 'src/components']) {
  for (const p of files(dir)) all.push(...scan(p, readFileSync(p, 'utf8'), seen))
}

if (seen.writes < 40) {
  console.log(`
  ❌ فُحصت ${seen.writes} كتابة فقط — النمط توقّف عن المطابقة، والنتيجة لا تعني شيئاً
`)
  process.exit(2)
}

const by = (k) => all.filter((f) => f.kind === k)
const groups = [
  ['claimed', '❌ نجاح مُعلَن قبل أن يردّ الخادم', by('claimed')],
  ['unread', '⚠️  كتابة لا تُقرأ نتيجتها', by('unread')],
  ['unguarded', '⚠️  إرسال بلا قفل أثناء التنفيذ', by('unguarded')],
]

for (const [, title, list] of groups) {
  console.log(`  ${title} — ${list.length}`)
  const show = VERBOSE ? list : list.slice(0, 12)
  for (const f of show) {
    console.log(`     ${f.path.replace(/\\/g, '/')}:${f.line} — ${f.detail}`)
  }
  if (!VERBOSE && list.length > show.length) {
    console.log(`     … و${list.length - show.length} أخرى (--all لعرضها)`)
  }
  console.log()
}

const worst = by('claimed').length
console.log(`  ${all.length} ملاحظة — من ${seen.writes} عملية كتابة فُحصت في ${new Set(all.map((f) => f.path)).size} ملفاً\n`)
process.exit(worst ? 1 : 0)
