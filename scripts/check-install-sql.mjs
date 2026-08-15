import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
const OUT = 'install-sql'
const SRC = 'backend/migrations'
const files = readdirSync(OUT).filter(f => f.endsWith('.sql')).sort()
const src = readdirSync(SRC).filter(f => f.endsWith('.sql'))
let ok = 0, bad = 0
const say = (c, m) => { if (c) ok++; else { bad++; console.log('  ❌ ' + m) } }

// 1) حدود الحرّاس متتابعة
let cumulative = 0
files.forEach((f, i) => {
  const t = readFileSync(join(OUT, f), 'utf8')
  const g = /v_n < (\d+) then/.exec(t)
  const expected = i === 0 ? null : cumulative
  if (i === 0) say(/v_n > 0 then/.test(t), 'الدفعة 1 بلا حارس القاعدة النظيفة')
  else say(g && Number(g[1]) === expected, `${f}: الحارس يتوقّع ${g?.[1]} والصحيح ${expected}`)
  cumulative += (t.match(/^-- \d{3}_.*\.sql$/gm) || []).length
})

// 2) كل مهاجرة مرّة واحدة بالضبط
const seen = new Map()
for (const f of files) {
  for (const m of readFileSync(join(OUT, f), 'utf8').matchAll(/^-- (\d{3}_[\w-]+\.sql)$/gm)) {
    seen.set(m[1], (seen.get(m[1]) || 0) + 1)
  }
}
say(seen.size === src.length, `مهاجرات في الناتج ${seen.size} · في المصدر ${src.length}`)
const dupes = [...seen].filter(([, n]) => n > 1)
say(dupes.length === 0, `مكرّرة: ${dupes.map(([k]) => k).join(', ')}`)
const missing = src.filter(f => !seen.has(f))
say(missing.length === 0, `مفقودة: ${missing.slice(0,5).join(', ')}`)

// 3) كتل $tag$ متوازنة في كل دفعة
for (const f of files) {
  const t = readFileSync(join(OUT, f), 'utf8')
  const tags = {}
  for (const m of t.matchAll(/\$([a-z_]*)\$/g)) tags[m[1]] = (tags[m[1]] || 0) + 1
  const odd = Object.entries(tags).filter(([, n]) => n % 2 !== 0)
  say(odd.length === 0, `${f}: كتل غير متوازنة ${odd.map(([k, n]) => `$${k}$×${n}`).join(' ')}`)
}

// 4) الترتيب الرقمي محفوظ عبر الدفعات
const order = []
for (const f of files) {
  for (const m of readFileSync(join(OUT, f), 'utf8').matchAll(/^-- (\d{3})_/gm)) order.push(Number(m[1]))
}
say(order.every((n, i) => i === 0 || n >= order[i-1]), 'الترتيب الرقمي مكسور')

// 5) السجلّ يُسجَّل لكل مهاجرة
let records = 0
for (const f of files) records += (readFileSync(join(OUT, f), 'utf8').match(/insert into public\.schema_migrations/g) || []).length
say(records === src.length + 0, `قيود السجلّ ${records} · المتوقَّع ${src.length}`)

console.log(`\n${bad ? '❌' : '✅'} ${ok} ناجح · ${bad} فاشل`)
process.exit(bad ? 1 : 0)
