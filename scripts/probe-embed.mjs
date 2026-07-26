// Why does companies → trust_scores come back empty through PostgREST when a
// direct select on trust_scores does not?
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import pg from 'pg'

const env = (k) => {
  const l = readFileSync('.env.production', 'utf8').split('\n').find((x) => x.trim().startsWith(k + '='))
  return l.slice(l.indexOf('=') + 1).trim()
}
const sb = createClient(env('VITE_SUPABASE_URL'), env('VITE_SUPABASE_ANON_KEY'))

const dbUrl = readFileSync('.env.migrations', 'utf8').split('\n')
  .find((l) => l.trim().startsWith('DATABASE_URL=')).split('=').slice(1).join('=').trim()
const db = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } })
await db.connect()

const { rows: [demo] } = await db.query(`select id, name from public.companies where cr_number like 'DEMO%' limit 1`)
console.log(`\n  شركة الاختبار: ${demo.name}`)

const { rows: scores } = await db.query('select id, score, company_id from public.trust_scores where company_id = $1', [demo.id])
console.log(`  صفوف trust_scores لها في القاعدة: ${scores.length}  ${scores.map((s) => s.score).join(', ')}`)

const { rows: fks } = await db.query(`
  select tc.constraint_name from information_schema.table_constraints tc
  where tc.table_schema = 'public' and tc.table_name = 'trust_scores' and tc.constraint_type = 'FOREIGN KEY'`)
console.log(`  مفاتيح أجنبية على trust_scores: ${fks.map((f) => f.constraint_name).join(', ') || 'لا شيء'}`)

const direct = await sb.from('trust_scores').select('score').eq('company_id', demo.id)
console.log(`\n  anon → trust_scores مباشرة: ${direct.error ? 'خطأ ' + direct.error.message : direct.data.length + ' صف'}`)

const embed = await sb.from('companies').select('name, trust_scores(score)').eq('id', demo.id).maybeSingle()
console.log(`  anon → embed: ${embed.error ? 'خطأ ' + embed.error.message : JSON.stringify(embed.data)}`)

await db.end()
console.log('')
