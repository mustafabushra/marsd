import { useState, useEffect, useRef } from 'react'
import { getSupabase } from '../lib/api'
import { Card } from '../ui'
import { LIMITS } from '../lib/validate.js'
import { parseActivityFile, ACTIVITY_CODE, MAX_FILE_BYTES } from '../lib/activityImport'

/**
 * Load the national economic activity directory (ISIC4).
 *
 * ============================================================================
 * Why this screen exists at all
 * ============================================================================
 * The Ministry of Commerce publishes the directory, but not as a file this
 * codebase can hold: the ministry and the business centre both serve it from
 * pages that render in JavaScript behind an anti-automation control, so there is
 * nothing to vendor. Writing plausible six-digit codes by hand was the other
 * option, and that would put invented official data in front of people — the one
 * thing the whole extraction feature is built to avoid.
 *
 * So the list is data an administrator loads, not code a developer edits. Paste
 * the official file here once and every activity dropdown in the product is
 * populated, with no deployment. When a Wathq subscription arrives it can write
 * to the same table.
 *
 * The seeded rows are the ISIC4 divisions — the published international
 * structure, which is stable and correct. What is missing is Saudi Arabia's
 * national extension to six and seven digits, and that is what this loads.
 */

const SAMPLE = `561010, المطاعم مع الخدمة
561031, محلات الوجبات السريعة
561040, أنشطة تقديم الوجبات فقط
563011, محلات تقديم المشروبات (الكوفي شوب)`

export default function AdminActivities() {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [stats, setStats] = useState(null)
  // ما قُرئ من ملف، بانتظار تأكيد المسؤول. لا شيء يُكتب قبله.
  const [parsed, setParsed] = useState(null)
  const [reading, setReading] = useState(false)
  const [mode, setMode] = useState('merge')
  const fileRef = useRef(null)
  // Where the extractor was wrong, according to the people who fixed it. This
  // table has been filling up since the import feature shipped and nothing has
  // ever read it — a feedback loop with no reader is a write-only log.
  const [corrections, setCorrections] = useState(null)

  const loadCorrections = async () => {
    try {
      const supabase = getSupabase()
      const { data } = await supabase
        .from('extraction_corrections')
        .select('field, extracted, corrected, method, score, layout_mode, created_at')
        .order('created_at', { ascending: false })
        .limit(400)

      const rows = data ?? []
      // Grouped by field and then by rule, because "which field goes wrong" is
      // the question you ask first and "which rule produced it" is the one that
      // tells you where to go and fix it.
      const byField = new Map()
      for (const r of rows) {
        const e = byField.get(r.field) ?? { field: r.field, n: 0, missed: 0, methods: new Map() }
        e.n++
        // No extracted value means the engine found nothing — a miss, which is
        // a different problem from reading the wrong thing.
        if (!r.extracted) e.missed++
        if (r.method) e.methods.set(r.method, (e.methods.get(r.method) ?? 0) + 1)
        byField.set(r.field, e)
      }
      setCorrections({
        total: rows.length,
        fields: [...byField.values()].sort((a, b) => b.n - a.n).slice(0, 10),
        recent: rows.slice(0, 8),
      })
    } catch {
      setCorrections({ total: 0, fields: [], recent: [] })
    }
  }

  const load = async () => {
    const supabase = getSupabase()
    const { count } = await supabase
      .from('reference_activities')
      .select('code', { count: 'exact', head: true })
      .eq('active', true)

    // Counted per level rather than in total: 88 divisions and no detailed
    // activities looks identical to a loaded directory if you only show a
    // number, and it is the detailed ones that matter.
    const { data } = await supabase
      .from('reference_activities').select('level').eq('active', true).limit(10000)
    const byLevel = {}
    for (const r of data ?? []) byLevel[r.level] = (byLevel[r.level] ?? 0) + 1
    setStats({ total: count ?? 0, byLevel })
  }

  useEffect(() => { load(); loadCorrections() }, [])

  /**
   * Parse the pasted list.
   *
   * Accepts comma, tab, or a run of spaces between the code and the name,
   * because a person exporting from Excel gets tabs, from a CSV gets commas,
   * and from a PDF gets whatever the PDF felt like. A line that does not start
   * with a code is reported rather than skipped: silently ignoring rows is how
   * you end up believing you loaded four thousand activities and shipped three.
   *
   * تُرجع نفس شكل `parseActivityFile` كي تُعرض المعاينة بمكوّن واحد: مصدران
   * بشكلين يفترقان عند أول تعديل.
   */
  const parsePasted = (raw) => {
    const rows = []
    const problems = []
    const seen = new Map()
    let lineNo = 0
    let blank = 0
    let badCode = 0
    let duplicate = 0
    let total = 0

    for (const line of String(raw).split(/\r?\n/)) {
      lineNo += 1
      const t = line.trim()
      if (!t) continue
      total += 1

      const m = /^(\d{2,8})\s*[,\t;|]\s*(.+)$/.exec(t) || /^(\d{2,8})\s{1,}(.+)$/.exec(t)
      if (!m) {
        badCode += 1
        problems.push(`سطر ${lineNo}: لا يبدأ بكود متبوعاً بالاسم — «${t.slice(0, 40)}»`)
        continue
      }

      const code = m[1]
      const name = m[2].trim().replace(/^["']|["']$/g, '').replace(/\s+/g, ' ')
      if (!name) { blank += 1; problems.push(`سطر ${lineNo}: اسم فارغ للكود ${code}`); continue }
      if (name.length > 300) { problems.push(`سطر ${lineNo}: الاسم أطول من ٣٠٠ حرف`); continue }
      if (!ACTIVITY_CODE.test(code)) {
        badCode += 1
        problems.push(`سطر ${lineNo}: كود غير صالح «${code}»`)
        continue
      }

      // A duplicate code in the source file means two names for one activity.
      // Reporting beats letting the last write win invisibly.
      if (seen.has(code)) {
        duplicate += 1
        problems.push(`سطر ${lineNo}: الكود ${code} مكرّر (وردَ في سطر ${seen.get(code)})`)
        continue
      }
      seen.set(code, lineNo)

      rows.push({
        code,
        name_ar: name,
        name_en: null,
        level: code.length,
        parent_code: code.length > 2 ? code.slice(0, code.length - 2) : null,
      })
    }

    return {
      ok: rows.length > 0 && problems.length === 0,
      rows,
      problems,
      headerMap: null,
      counts: {
        total,
        valid: rows.length,
        blank,
        badCode,
        duplicate,
        byLevel: rows.reduce((a, r) => ({ ...a, [r.level]: (a[r.level] || 0) + 1 }), {}),
      },
    }
  }

  /** يُقرأ الملف المختار ويُعرض ما فيه. لا شيء يُكتب حتى يؤكّد المسؤول. */
  const onFile = async (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setError(''); setResult(null); setText('')
    setReading(true)
    try {
      const out = await parseActivityFile(f)
      setParsed({ ...out, fileName: f.name })
      if (!out.rows.length) setError(out.problems[0] || 'لم يُقرأ أي نشاط من الملف')
    } catch (err) {
      setParsed(null)
      setError(err?.message || 'تعذّرت قراءة الملف')
    } finally {
      setReading(false)
    }
  }

  // مصدر واحد للمعاينة أياً كان مصدر البيانات.
  const preview = parsed || (text.trim() ? { ...parsePasted(text), fileName: null } : null)

  /**
   * الاستيراد.
   *
   * دالةٌ واحدة على الخادم بدل كتابةٍ مباشرة على دفعات. الفارق ليس أسلوبياً:
   * الدفعات كانت تترك الدليل نصفه جديداً ونصفه قديماً إذا فشلت واحدة في
   * المنتصف، ولا شيء يقول أين الحدّ. والدالة تعمل في معاملة واحدة — تتحقّق من
   * كل الصفوف قبل كتابة أوّلها، وتكتب أثراً.
   */
  const upload = async () => {
    setError(''); setResult(null)
    if (!preview?.rows.length) { setError('لا صفوف صالحة للاستيراد'); return }
    if (preview.problems.length) {
      setError('أصلح المشكلات المذكورة أولاً — لا يُستورد ملف ناقص')
      return
    }

    setBusy(true)
    try {
      const supabase = getSupabase()
      const { data, error: err } = await supabase.rpc('import_reference_activities', {
        p_rows: preview.rows,
        p_mode: mode,
        p_file_name: preview.fileName || 'لصق نصّي',
      })
      if (err) throw new Error(err.message)

      setResult(data)
      setText('')
      setParsed(null)
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: '23px', fontWeight: 900, color: '#0F172A', margin: '0 0 6px' }}>
        دليل الأنشطة الاقتصادية
      </h1>
      <p style={{ fontSize: '14px', color: '#64748B', margin: '0 0 22px', lineHeight: 1.9 }}>
        القائمة التي تظهر في حقل «أنشطة السجل التجاري» عند إضافة شركة.
      </p>

      {stats && (
        <Card style={{ display: 'flex', gap: '26px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '27px', fontWeight: 900, color: '#0F172A' }}>{stats.total}</div>
            <div style={{ fontSize: '12.5px', color: '#64748B', fontWeight: 700 }}>نشاط في الدليل</div>
          </div>
          {Object.entries(stats.byLevel).sort().map(([lvl, n]) => (
            <div key={lvl}>
              <div style={{ fontSize: '19px', fontWeight: 900, color: '#334155' }}>{n}</div>
              <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 700 }}>
                {lvl === '2' ? 'قسم اقتصادي' : `${lvl} أرقام`}
              </div>
            </div>
          ))}
          {!stats.byLevel[6] && !stats.byLevel[7] && (
            <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', color: '#92400E', borderRadius: '10px', padding: '11px 15px', fontSize: '12.5px', fontWeight: 700, lineHeight: 1.8, flex: 1, minWidth: '260px' }}>
              الأقسام الدولية فقط محمّلة. الأنشطة السعودية التفصيلية (6–7 أرقام) لم تُرفع بعد،
              ولذلك يكتب المستخدمون النشاط يدوياً.
            </div>
          )}
        </Card>
      )}

      {corrections && corrections.total > 0 && (
        <Card>
          <h2 style={{ fontSize: '16px', fontWeight: 900, color: '#0F172A', margin: '0 0 6px' }}>
            أين يخطئ الاستخراج
          </h2>
          <p style={{ fontSize: '13px', color: '#64748B', margin: '0 0 16px', lineHeight: 1.9 }}>
            {corrections.total} تصحيحاً أجراه المستخدمون على ما قرأه المحرك. الحقل الذي يتكرر
            في أعلى القائمة هو الذي يستحق قاعدة جديدة في <code style={{ direction: 'ltr', fontSize: '12px' }}>patterns.js</code>.
          </p>

          <div style={{ display: 'grid', gap: '8px' }}>
            {corrections.fields.map((f) => (
              <div key={f.field} style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '11px 14px', flexWrap: 'wrap' }}>
                <code style={{ direction: 'ltr', fontSize: '12.5px', fontWeight: 800, color: '#1E2A52', minWidth: '150px' }}>
                  {f.field}
                </code>
                <span style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A' }}>{f.n}</span>
                {f.missed > 0 && (
                  <span style={{ background: '#FEF2F2', color: '#B91C1C', borderRadius: '6px', padding: '2px 8px', fontSize: '11.5px', fontWeight: 800 }}>
                    {f.missed} لم يُستخرج أصلاً
                  </span>
                )}
                {[...f.methods.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([m, n]) => (
                  <span key={m} style={{ background: '#EEF2FF', color: '#3730A3', borderRadius: '6px', padding: '2px 8px', fontSize: '11.5px', fontWeight: 700, direction: 'ltr' }}>
                    {m} × {n}
                  </span>
                ))}
              </div>
            ))}
          </div>

          <details style={{ marginTop: '14px' }}>
            <summary style={{ fontSize: '12.5px', fontWeight: 800, color: '#334155', cursor: 'pointer' }}>
              آخر التصحيحات
            </summary>
            <div style={{ marginTop: '9px', display: 'grid', gap: '6px' }}>
              {corrections.recent.map((r, i) => (
                <div key={i} style={{ fontSize: '12.5px', color: '#475569', background: '#F8FAFC', borderRadius: '8px', padding: '9px 12px', lineHeight: 1.8 }}>
                  <code style={{ direction: 'ltr', fontWeight: 800, color: '#1E2A52' }}>{r.field}</code>
                  {'  '}
                  <span style={{ textDecoration: 'line-through', color: '#94A3B8' }}>{r.extracted ?? 'لم يُستخرج'}</span>
                  {'  ←  '}
                  <span style={{ fontWeight: 700, color: '#15803D' }}>{r.corrected ?? 'حُذف'}</span>
                </div>
              ))}
            </div>
          </details>
        </Card>
      )}

      <Card>
        <h2 style={{ fontSize: '16px', fontWeight: 900, color: '#0F172A', margin: '0 0 8px' }}>رفع القائمة</h2>
        <div style={{ fontSize: '13px', color: '#475569', lineHeight: 2, marginBottom: '14px' }}>
          <div>سطر لكل نشاط: <strong>الكود</strong> ثم فاصلة أو Tab ثم <strong>الاسم</strong>.</div>
          <div>الكود الموجود يُحدَّث، والجديد يُضاف. لا شيء يُحذف.</div>
          <div style={{ color: '#64748B' }}>
            مصدر القائمة الرسمي: الدليل الوطني للأنشطة الاقتصادية (ISIC4) من وزارة التجارة.
          </div>
        </div>

        {/* ---- ملف ---------------------------------------------------------- */}
        <div style={{ display: 'flex', gap: '11px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '14px' }}>
          <input ref={fileRef} type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                 onChange={onFile} style={{ display: 'none' }} />
          <button type="button" onClick={() => fileRef.current?.click()} disabled={reading || busy}
                  style={{ background: '#1E2A52', color: '#fff', border: 0, borderRadius: '10px', padding: '11px 20px', fontSize: '13.5px', fontWeight: 800, cursor: reading || busy ? 'default' : 'pointer', fontFamily: 'inherit' }}>
            {reading ? 'يقرأ الملف…' : '📄 اختر ملف Excel أو CSV'}
          </button>
          {parsed?.fileName && (
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#334155' }}>
              {parsed.fileName}
              <button type="button" onClick={() => { setParsed(null); setError(''); }}
                      style={{ marginRight: '9px', background: '#F1F5F9', border: 0, borderRadius: '7px', padding: '4px 10px', fontSize: '12px', fontWeight: 800, color: '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}>
                إزالة
              </button>
            </span>
          )}
          <span style={{ fontSize: '12.5px', color: '#64748B', fontWeight: 600 }}>
            العمودان المطلوبان: <code style={{ direction: 'ltr', fontSize: '12px' }}>activity_code</code>
            {' و'}
            <code style={{ direction: 'ltr', fontSize: '12px' }}>activity_description</code>
            {` · حتى ${MAX_FILE_BYTES / 1048576} ميجابايت`}
          </span>
        </div>

        {!parsed && (
          <textarea maxLength={LIMITS.description} value={text} onChange={(e) => setText(e.target.value)}
                    rows={8} placeholder={SAMPLE}
                    style={{ width: '100%', padding: '13px 15px', border: '1.5px solid #E2E8F0', borderRadius: '11px', fontSize: '13px', fontFamily: 'monospace', resize: 'vertical', lineHeight: 1.9 }} />
        )}

        {/* ---- المعاينة ------------------------------------------------------ */}
        {preview && (
          <div style={{ marginTop: '14px' }}>
            <div style={{ display: 'flex', gap: '9px', flexWrap: 'wrap' }}>
              <span style={{ background: '#ECFDF5', color: '#15803D', borderRadius: '7px', padding: '5px 12px', fontSize: '12.5px', fontWeight: 800 }}>
                {preview.counts.valid} نشاط صالح
              </span>
              {preview.counts.duplicate > 0 && (
                <span style={{ background: '#FFFBEB', color: '#92400E', borderRadius: '7px', padding: '5px 12px', fontSize: '12.5px', fontWeight: 800 }}>
                  {preview.counts.duplicate} كود مكرّر
                </span>
              )}
              {preview.counts.blank > 0 && (
                <span style={{ background: '#FEF2F2', color: '#B91C1C', borderRadius: '7px', padding: '5px 12px', fontSize: '12.5px', fontWeight: 800 }}>
                  {preview.counts.blank} قيمة فارغة
                </span>
              )}
              {preview.counts.badCode > 0 && (
                <span style={{ background: '#FEF2F2', color: '#B91C1C', borderRadius: '7px', padding: '5px 12px', fontSize: '12.5px', fontWeight: 800 }}>
                  {preview.counts.badCode} كود غير صالح
                </span>
              )}
              {Object.entries(preview.counts.byLevel).sort().map(([lvl, n]) => (
                <span key={lvl} style={{ background: '#EEF2FF', color: '#3730A3', borderRadius: '7px', padding: '5px 12px', fontSize: '12.5px', fontWeight: 700 }}>
                  {n} من {lvl} أرقام
                </span>
              ))}
            </div>

            {preview.headerMap && (
              <div style={{ fontSize: '12.5px', color: '#64748B', fontWeight: 600, marginTop: '9px', lineHeight: 1.9 }}>
                الأعمدة المقروءة: <strong>{preview.headerMap.code}</strong> ← الكود ·{' '}
                <strong>{preview.headerMap.description}</strong> ← الوصف
                {preview.headerMap.descriptionEn && <> · <strong>{preview.headerMap.descriptionEn}</strong> ← الإنجليزية</>}
              </div>
            )}

            {preview.rows.length > 0 && (
              <div style={{ marginTop: '11px', border: '1px solid #E2E8F0', borderRadius: '11px', overflow: 'hidden' }}>
                <div style={{ maxHeight: '260px', overflowY: 'auto', overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                    <thead>
                      <tr style={{ background: '#F8FAFC', position: 'sticky', top: 0 }}>
                        <th style={{ textAlign: 'right', padding: '9px 13px', fontWeight: 800, color: '#334155', borderBottom: '1px solid #E2E8F0' }}>الكود</th>
                        <th style={{ textAlign: 'right', padding: '9px 13px', fontWeight: 800, color: '#334155', borderBottom: '1px solid #E2E8F0' }}>الوصف</th>
                        <th style={{ textAlign: 'right', padding: '9px 13px', fontWeight: 800, color: '#334155', borderBottom: '1px solid #E2E8F0' }}>المستوى</th>
                        <th style={{ textAlign: 'right', padding: '9px 13px', fontWeight: 800, color: '#334155', borderBottom: '1px solid #E2E8F0' }}>الأب</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.rows.slice(0, 100).map((r) => (
                        <tr key={r.code}>
                          <td style={{ padding: '8px 13px', borderBottom: '1px solid #F1F5F9', direction: 'ltr', textAlign: 'right', fontWeight: 800, color: '#1E2A52' }}>{r.code}</td>
                          <td style={{ padding: '8px 13px', borderBottom: '1px solid #F1F5F9', color: '#0F172A' }}>{r.name_ar}</td>
                          <td style={{ padding: '8px 13px', borderBottom: '1px solid #F1F5F9', color: '#64748B' }}>{r.level}</td>
                          <td style={{ padding: '8px 13px', borderBottom: '1px solid #F1F5F9', color: '#64748B', direction: 'ltr', textAlign: 'right' }}>{r.parent_code || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {preview.rows.length > 100 && (
                  <div style={{ padding: '9px 13px', background: '#F8FAFC', fontSize: '12px', fontWeight: 700, color: '#64748B', borderTop: '1px solid #E2E8F0' }}>
                    تُعرض أول ١٠٠ من {preview.rows.length}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {preview?.problems.length > 0 && (
          <details style={{ marginTop: '10px' }} open>
            <summary style={{ fontSize: '12.5px', fontWeight: 800, color: '#B91C1C', cursor: 'pointer' }}>
              {preview.problems.length} مشكلة تمنع الاستيراد
            </summary>
            <div style={{ maxHeight: '180px', overflowY: 'auto', background: '#FEF2F2', borderRadius: '9px', padding: '10px 13px', marginTop: '7px', fontSize: '12px', color: '#7F1D1D', lineHeight: 1.9 }}>
              {preview.problems.slice(0, 80).map((r, i) => <div key={i}>{r}</div>)}
              {preview.problems.length > 80 && <div style={{ fontWeight: 800 }}>… و{preview.problems.length - 80} غيرها</div>}
            </div>
          </details>
        )}

        {/* ---- الوضع --------------------------------------------------------- */}
        {preview?.rows.length > 0 && (
          <div style={{ marginTop: '14px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '11px', padding: '13px 15px' }}>
            <div style={{ fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '9px' }}>ماذا يحدث للأنشطة الحالية؟</div>
            {[
              ['merge', 'دمج', 'يُحدَّث ما ورد في الملف، ويبقى ما لم يرد كما هو.'],
              ['replace', 'استبدال', 'يُحدَّث ما ورد، ويُعطَّل كل نشاط لم يرد في الملف (لا يُحذف).'],
            ].map(([val, label, hint]) => (
              <label key={val} style={{ display: 'flex', gap: '9px', alignItems: 'flex-start', marginBottom: '7px', cursor: 'pointer' }}>
                <input type="radio" name="import-mode" value={val} checked={mode === val}
                       onChange={() => setMode(val)} style={{ marginTop: '3px' }} />
                <span>
                  <span style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A' }}>{label}</span>
                  <span style={{ fontSize: '12.5px', color: '#64748B', fontWeight: 600 }}> — {hint}</span>
                </span>
              </label>
            ))}
          </div>
        )}

        {error && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C', borderRadius: '10px', padding: '12px 15px', marginTop: '12px', fontSize: '13px', fontWeight: 700, lineHeight: 1.9 }}>
            {error}
          </div>
        )}

        {result && (
          <div style={{ background: '#ECFDF5', border: '1px solid #BBF7D0', color: '#15803D', borderRadius: '10px', padding: '12px 15px', marginTop: '12px', fontSize: '13px', fontWeight: 700, lineHeight: 1.9 }}>
            ✅ استُورد الدليل: {result.inserted} جديد · {result.updated} محدَّث
            {result.deactivated > 0 && ` · ${result.deactivated} عُطِّل`}
          </div>
        )}

        <button onClick={upload} disabled={busy || !preview?.rows.length || preview?.problems.length > 0}
                style={{
                  marginTop: '14px',
                  background: busy || !preview?.rows.length || preview?.problems.length > 0 ? '#CBD5E1' : '#1E2A52',
                  color: '#fff', border: 0, borderRadius: '11px', padding: '13px 26px',
                  fontSize: '14px', fontWeight: 800,
                  cursor: busy || !preview?.rows.length || preview?.problems.length > 0 ? 'default' : 'pointer',
                  fontFamily: 'inherit',
                }}>
          {busy ? 'يستورد…'
            : preview?.problems.length > 0 ? 'أصلح المشكلات أولاً'
              : `${mode === 'replace' ? 'استبدل بـ' : 'استورد'} ${preview?.rows.length ?? 0} نشاط`}
        </button>
      </Card>
    </div>
  )
}
