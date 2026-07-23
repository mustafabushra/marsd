/**
 * ============================================================================
 * ENUM DRIFT CHECK — الحارس الذي يمنع تكرار مشكلة constraint violation
 * ============================================================================
 *
 * يقارن القيم المعرّفة في src/lib/enums.ts بالقيم الفعلية لـ CHECK constraints
 * في قاعدة بيانات Supabase (عبر RPC: list_check_constraints).
 *
 * إذا اكتُشف أي اختلاف (قيمة في الكود غير موجودة في القاعدة أو العكس)،
 * يفشل السكربت بكود خروج 1 — فيمنع النشر/الدمج قبل إصلاح الانحراف.
 *
 * التشغيل:
 *   npm run check:enums
 *
 * يقرأ نفس متغيرات البيئة التي يستخدمها التطبيق:
 *   VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
 * (يقبل أيضاً SUPABASE_URL / SUPABASE_ANON_KEY).
 * ============================================================================
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

// ---- تحميل متغيرات البيئة من .env إن وُجد (بدون اعتماد على حزمة خارجية) ----
function loadDotEnv() {
  for (const f of ['.env.local', '.env']) {
    const p = join(root, f)
    if (!existsSync(p)) continue
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i)
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
      }
    }
  }
}
loadDotEnv()

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY

if (!url || !key) {
  console.error('❌ متغيرات البيئة مفقودة: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY')
  process.exit(2)
}

/**
 * الربط بين اسم الـ constraint في قاعدة البيانات واسم الـ export في enums.ts.
 * أي constraint من نوع "قيم محدودة" يجب أن يظهر هنا؛ وإلا سيُبلّغ عنه كـ
 * "constraint غير مغطّى" لتذكيرك بإضافته إلى الـ SSOT.
 */
const CONSTRAINT_TO_ENUM = {
  companies_status_check: 'COMPANY_STATUS_VALUES',
  companies_cr_status_check: 'COMPANY_CR_STATUS_VALUES',
  companies_source_check: 'COMPANY_SOURCE_VALUES',
  tenants_status_check: 'TENANT_STATUS_VALUES',
  users_role_check: 'USER_ROLE_VALUES',
  users_status_check: 'USER_STATUS_VALUES',
  claim_requests_status_check: 'REQUEST_STATUS_VALUES',
  registration_requests_status_check: 'REQUEST_STATUS_VALUES',
}

/** يستخرج القيم من تعريف CHECK مثل: CHECK (((source)::text = ANY ((ARRAY['a','b'])::text[]))) */
function parseAllowedValues(def) {
  const values = []
  const re = /'((?:[^']|'')*)'/g
  let m
  while ((m = re.exec(def)) !== null) {
    // تجاهل أسماء الأنواع مثل 'character varying' — نأخذ فقط ما داخل ARRAY[...]
    values.push(m[1].replace(/''/g, "'"))
  }
  return values
}

/** يقرأ مصفوفة قيم enum من enums.ts دون تنفيذ TypeScript. */
function readCodeEnums() {
  const src = readFileSync(join(root, 'src', 'lib', 'enums.ts'), 'utf8')
  const out = {}
  // نلتقط تعريفات الكائنات: export const X = { A: 'a', ... } as const
  const objRe = /export const ([A-Z0-9_]+) = \{([^}]*)\} as const/g
  let m
  const objects = {}
  while ((m = objRe.exec(src)) !== null) {
    const name = m[1]
    const vals = [...m[2].matchAll(/:\s*'([^']*)'/g)].map((x) => x[1])
    objects[name] = vals
  }
  // X_VALUES = Object.values(X)  →  نربط كل *_VALUES بكائنه
  for (const [name, vals] of Object.entries(objects)) {
    out[`${name}_VALUES`] = vals
  }
  return out
}

function arraysEqualAsSets(a, b) {
  const sa = new Set(a)
  const sb = new Set(b)
  if (sa.size !== sb.size) return false
  for (const v of sa) if (!sb.has(v)) return false
  return true
}

async function main() {
  const supabase = createClient(url, key)
  const { data, error } = await supabase.rpc('list_check_constraints')
  if (error) {
    console.error('❌ فشل استدعاء list_check_constraints:', error.message)
    process.exit(2)
  }

  const codeEnums = readCodeEnums()
  const dbByConstraint = {}
  for (const row of data) {
    // نأخذ فقط القيم داخل ARRAY[...]: نصفّي أسماء الأنواع الشائعة
    const parsed = parseAllowedValues(row.definition).filter(
      (v) => v !== 'character varying' && v !== 'text'
    )
    dbByConstraint[row.constraint_name] = parsed
  }

  const problems = []

  for (const [constraint, enumName] of Object.entries(CONSTRAINT_TO_ENUM)) {
    const dbVals = dbByConstraint[constraint]
    const codeVals = codeEnums[enumName]

    if (!dbVals) {
      problems.push(`• constraint "${constraint}" غير موجود في قاعدة البيانات (هل أُعيدت تسميته؟).`)
      continue
    }
    if (!codeVals) {
      problems.push(`• export "${enumName}" غير موجود في enums.ts.`)
      continue
    }
    if (!arraysEqualAsSets(dbVals, codeVals)) {
      const missingInCode = dbVals.filter((v) => !codeVals.includes(v))
      const extraInCode = codeVals.filter((v) => !dbVals.includes(v))
      problems.push(
        `• انحراف في ${constraint} ↔ ${enumName}:\n` +
          (missingInCode.length ? `    ناقص في الكود: ${missingInCode.join(', ')}\n` : '') +
          (extraInCode.length ? `    زائد في الكود (سيفشل الإدراج): ${extraInCode.join(', ')}\n` : '') +
          `    القاعدة: [${dbVals.join(', ')}]\n` +
          `    الكود:   [${codeVals.join(', ')}]`
      )
    }
  }

  if (problems.length) {
    console.error('\n❌ اكتُشف انحراف بين enums.ts وقاعدة البيانات:\n')
    console.error(problems.join('\n'))
    console.error('\nأصلح src/lib/enums.ts ليطابق قاعدة البيانات، ثم أعد التشغيل.\n')
    process.exit(1)
  }

  console.log('✅ enums.ts يطابق كل CHECK constraints في قاعدة البيانات. لا يوجد انحراف.')
}

main().catch((e) => {
  console.error('❌ خطأ غير متوقع:', e)
  process.exit(2)
})
