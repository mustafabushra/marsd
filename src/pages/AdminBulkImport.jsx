import { useState } from 'react'
import { useUser } from '@clerk/react'
import * as XLSX from 'xlsx'
import { getSupabase, buildCompanyInsert } from '../lib/api'

const STEPS = [
  { n: 1, label: 'رفع الملف' },
  { n: 2, label: 'مطابقة الأعمدة' },
  { n: 3, label: 'التحقق والمعاينة' },
  { n: 4, label: 'الاستيراد' },
]

const TARGET_FIELDS = [
  { key: 'name', label: 'اسم الشركة', required: true, kw: ['اسم', 'الشركة', 'المنشأة', 'name', 'company'] },
  { key: 'crNumber', label: 'رقم السجل التجاري', kw: ['سجل', 'cr', 'registration'] },
  { key: 'unifiedNumber', label: 'الرقم الموحّد (700)', kw: ['موحد', 'موحّد', '700', 'unified'] },
  { key: 'sector', label: 'القطاع / النشاط', kw: ['قطاع', 'نشاط', 'sector', 'activity'] },
  { key: 'city', label: 'المدينة', kw: ['مدينة', 'city'] },
]

const norm = (s) => String(s || '').trim().toLowerCase()

export default function AdminBulkImport() {
  const { user } = useUser()
  const [step, setStep] = useState(1)
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState([])
  const [headers, setHeaders] = useState([])
  const [mapping, setMapping] = useState({})
  const [validation, setValidation] = useState({ valid: [], invalid: [] })
  const [importing, setImporting] = useState(false)
  const [importedCount, setImportedCount] = useState(0)
  const [error, setError] = useState('')

  const parseFile = async (file) => {
    setError('')
    if (!file) return
    const name = file.name.toLowerCase()
    if (!['.xlsx', '.xls', '.csv'].some((e) => name.endsWith(e))) { setError('نوع الملف غير مدعوم — استخدم Excel أو CSV'); return }
    if (file.size > 15 * 1024 * 1024) { setError('حجم الملف كبير جداً (الحد 15MB)'); return }
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const data = XLSX.utils.sheet_to_json(ws, { defval: '' })
      if (!data.length) { setError('الملف فارغ أو لا يحتوي صفوفاً'); return }
      const hdrs = Object.keys(data[0])
      // Auto-map fields to headers by keyword
      const auto = {}
      TARGET_FIELDS.forEach((f) => {
        const match = hdrs.find((h) => f.kw.some((k) => norm(h).includes(norm(k))))
        auto[f.key] = match || ''
      })
      setFileName(file.name)
      setRows(data)
      setHeaders(hdrs)
      setMapping(auto)
      setStep(2)
    } catch (err) {
      console.error(err)
      setError('تعذّر قراءة الملف: ' + (err?.message || 'صيغة غير صالحة'))
    }
  }

  const runValidation = async () => {
    setError('')
    if (!mapping.name) { setError('حدّد عمود اسم الشركة أولاً'); return }
    try {
      const supabase = getSupabase()
      const { data: existing } = await supabase.from('companies').select('name, cr_number').limit(5000)
      const existNames = new Set((existing || []).map((c) => norm(c.name)))
      const existCrs = new Set((existing || []).map((c) => norm(c.cr_number)).filter(Boolean))
      const seenNames = new Map() // norm(name) -> first row number
      const seenCrs = new Map()   // norm(cr)   -> first row number
      const valid = []
      const invalid = []
      rows.forEach((r, i) => {
        const rowNo = i + 2 // +1 header, +1 to 1-index
        const name = String(r[mapping.name] ?? '').trim()
        const cr = mapping.crNumber ? String(r[mapping.crNumber] ?? '').trim() : ''
        const rec = {
          name,
          crNumber: cr,
          unifiedNumber: mapping.unifiedNumber ? String(r[mapping.unifiedNumber] ?? '').trim() : '',
          sector: mapping.sector ? String(r[mapping.sector] ?? '').trim() : '',
          city: mapping.city ? String(r[mapping.city] ?? '').trim() : '',
        }
        let reason = ''
        if (!name) reason = 'اسم الشركة مفقود'
        else if (existNames.has(norm(name)) || (cr && existCrs.has(norm(cr)))) reason = 'موجودة مسبقاً في سجلات مرصد'
        else if (seenNames.has(norm(name))) reason = `مكرّرة داخل ملفك (وردت في الصف ${seenNames.get(norm(name))})`
        else if (cr && seenCrs.has(norm(cr))) reason = `رقم السجل مكرّر داخل ملفك (الصف ${seenCrs.get(norm(cr))})`
        if (reason) { invalid.push({ row: rowNo, name: name || '—', reason }) }
        else { seenNames.set(norm(name), rowNo); if (cr) seenCrs.set(norm(cr), rowNo); valid.push(rec) }
      })
      setValidation({ valid, invalid })
      setStep(3)
    } catch (err) {
      setError('تعذّر التحقق: ' + (err?.message || ''))
    }
  }

  const doImport = async () => {
    if (!validation.valid.length) { setError('لا توجد صفوف صالحة للاستيراد'); return }
    setImporting(true)
    setError('')
    try {
      const supabase = getSupabase()
      const inserts = validation.valid.map((r) => buildCompanyInsert({
        name: r.name,
        crNumber: r.crNumber || `CR${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 1000)}`,
        unifiedNumber: r.unifiedNumber || null,
        sector: r.sector || null,
        city: r.city || null,
        approved: true,
        status: 'active',
        source: 'community',
      }))
      // Insert in batches
      let imported = 0
      const batchSize = 200
      for (let i = 0; i < inserts.length; i += batchSize) {
        const batch = inserts.slice(i, i + batchSize)
        const { error: insErr, data } = await supabase.from('companies').insert(batch).select('id')
        if (insErr) throw insErr
        imported += (data?.length || batch.length)
      }
      await supabase.from('audit_logs').insert([{ actor_id: user?.id || null, action: 'companies_bulk_imported', entity: 'company', meta: JSON.stringify({ count: imported, file: fileName }), created_at: new Date().toISOString() }])
      setImportedCount(imported)
      setStep(4)
    } catch (err) {
      setError('فشل الاستيراد: ' + (err?.message || 'خطأ غير معروف'))
    } finally {
      setImporting(false)
    }
  }

  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([['اسم الشركة', 'رقم السجل التجاري', 'الرقم الموحّد', 'القطاع', 'المدينة'], ['شركة الرياض للتجارة', '1010234567', '7001234567', 'تجارة', 'الرياض']])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'companies')
    XLSX.writeFile(wb, 'marsad_companies_template.xlsx')
  }

  const reset = () => { setStep(1); setFileName(''); setRows([]); setHeaders([]); setMapping({}); setValidation({ valid: [], invalid: [] }); setImportedCount(0); setError('') }

  const P = '#7C3AED'

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto' }}>
      {/* Stepper */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '26px' }}>
        {STEPS.map((w, idx) => {
          const done = w.n < step, active = w.n === step
          return (
            <div key={w.n} style={{ display: 'flex', alignItems: 'center', flex: idx < STEPS.length - 1 ? 1 : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '14px', flex: 'none', background: active || done ? P : '#E2E8F0', color: active || done ? '#fff' : '#94A3B8' }}>{done ? '✓' : String(w.n)}</div>
                <span style={{ fontSize: '13.5px', fontWeight: active ? 800 : 600, color: active || done ? '#1E2A52' : '#94A3B8', whiteSpace: 'nowrap' }}>{w.label}</span>
              </div>
              {idx < STEPS.length - 1 && <div style={{ flex: 1, height: '2px', background: '#E2E8F0', margin: '0 10px', minWidth: '16px' }}></div>}
            </div>
          )
        })}
      </div>

      {error && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '12px', padding: '14px 18px', marginBottom: '18px', fontSize: '14px', color: '#B91C1C', fontWeight: 700 }}>{error}</div>}

      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '18px', padding: '32px' }}>
        {/* STEP 1 */}
        {step === 1 && (
          <>
            <h2 style={{ fontSize: '21px', fontWeight: 900, color: '#0F172A', margin: '0 0 6px' }}>رفع ملف الشركات</h2>
            <p style={{ fontSize: '14.5px', color: '#64748B', margin: '0 0 22px' }}>استورد مئات الشركات دفعة واحدة من ملف Excel أو CSV — لإضافة شركة واحدة استخدم "إضافة شركة".</p>
            <label style={{ display: 'block', border: `2px dashed #C4B5FD`, borderRadius: '16px', padding: '46px', textAlign: 'center', background: '#F5F3FF', cursor: 'pointer' }}>
              <div style={{ fontSize: '42px', marginBottom: '12px' }}>📊</div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: '#5B21B6', marginBottom: '6px' }}>اضغط لاختيار ملف Excel / CSV</div>
              <div style={{ fontSize: '13px', color: '#7C3AED' }}>حتى 15MB</div>
              <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => parseFile(e.target.files?.[0])} style={{ display: 'none' }} />
            </label>
            <div onClick={downloadTemplate} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginTop: '16px', fontSize: '13px', color: '#7C3AED', fontWeight: 700, cursor: 'pointer' }}>⬇ تنزيل القالب الجاهز (Excel) لضمان تطابق الأعمدة</div>
          </>
        )}

        {/* STEP 2: mapping */}
        {step === 2 && (
          <>
            <h2 style={{ fontSize: '21px', fontWeight: 900, color: '#0F172A', margin: '0 0 6px' }}>مطابقة أعمدة الملف بحقول مرصد</h2>
            <p style={{ fontSize: '14.5px', color: '#64748B', margin: '0 0 6px' }}>الملف: <b>{fileName}</b> · {rows.length} صف</p>
            <p style={{ fontSize: '13.5px', color: '#64748B', margin: '0 0 22px' }}>راجع الربط التلقائي بين أعمدة ملفك وحقول قاعدة البيانات.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {TARGET_FIELDS.map((f) => (
                <div key={f.key} style={{ display: 'grid', gridTemplateColumns: '1fr auto 1.4fr', gap: '14px', alignItems: 'center', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '11px', padding: '13px 16px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 800, color: '#1E2A52' }}>{f.label}{f.required && <span style={{ color: '#DC2626' }}> *</span>}</span>
                  <span style={{ color: '#64748B', fontWeight: 900 }}>←</span>
                  <select value={mapping[f.key] || ''} onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value }))} style={{ width: '100%', border: '1.5px solid #E2E8F0', borderRadius: '9px', padding: '9px 12px', fontSize: '14px', outline: 'none', fontFamily: 'inherit', textAlign: 'right', background: '#fff' }}>
                    <option value="">— تجاهل —</option>
                    {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '26px', paddingTop: '20px', borderTop: '1px solid #F1F5F9' }}>
              <button onClick={reset} style={{ background: '#fff', color: '#64748B', border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '12px 26px', fontSize: '14.5px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>إلغاء</button>
              <button onClick={runValidation} style={{ background: P, color: '#fff', border: 0, borderRadius: '10px', padding: '12px 34px', fontSize: '14.5px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>التحقق من البيانات</button>
            </div>
          </>
        )}

        {/* STEP 3: validate preview */}
        {step === 3 && (
          <>
            <h2 style={{ fontSize: '21px', fontWeight: 900, color: '#0F172A', margin: '0 0 6px' }}>التحقق والمعاينة</h2>
            <p style={{ fontSize: '14.5px', color: '#64748B', margin: '0 0 20px' }}>ستُستورد الصفوف الصالحة فقط — تُستبعد المكررة والناقصة.</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '14px', marginBottom: '20px' }}>
              <div style={{ background: '#F8FAFC', borderRadius: '12px', padding: '16px', textAlign: 'center' }}><div style={{ fontSize: '26px', fontWeight: 900, color: '#1E2A52' }}>{rows.length}</div><div style={{ fontSize: '12.5px', color: '#64748B', fontWeight: 700 }}>إجمالي الصفوف</div></div>
              <div style={{ background: '#ECFDF5', borderRadius: '12px', padding: '16px', textAlign: 'center' }}><div style={{ fontSize: '26px', fontWeight: 900, color: '#15803D' }}>{validation.valid.length}</div><div style={{ fontSize: '12.5px', color: '#15803D', fontWeight: 700 }}>جاهزة للاستيراد</div></div>
              <div style={{ background: '#FEF2F2', borderRadius: '12px', padding: '16px', textAlign: 'center' }}><div style={{ fontSize: '26px', fontWeight: 900, color: '#B91C1C' }}>{validation.invalid.length}</div><div style={{ fontSize: '12.5px', color: '#B91C1C', fontWeight: 700 }}>مستبعَدة</div></div>
            </div>
            <div style={{ border: '1px solid #E2E8F0', borderRadius: '12px', overflow: 'hidden', maxHeight: '320px', overflowY: 'auto' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.4fr 1fr 1fr', padding: '12px 16px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', fontSize: '12.5px', fontWeight: 800, color: '#64748B', position: 'sticky', top: 0 }}>
                <span>اسم الشركة</span><span>السجل التجاري</span><span>المدينة</span><span>الحالة</span>
              </div>
              {validation.valid.slice(0, 100).map((r, i) => (
                <div key={'v' + i} style={{ display: 'grid', gridTemplateColumns: '2fr 1.4fr 1fr 1fr', padding: '11px 16px', borderBottom: '1px solid #F1F5F9', alignItems: 'center' }}>
                  <span style={{ fontSize: '13.5px', fontWeight: 700, color: '#0F172A' }}>{r.name}</span>
                  <span style={{ fontSize: '13px', color: '#64748B', direction: 'ltr', textAlign: 'right' }}>{r.crNumber || '—'}</span>
                  <span style={{ fontSize: '13px', color: '#334155' }}>{r.city || '—'}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#16A34A' }}></span><span style={{ fontSize: '12.5px', fontWeight: 700, color: '#15803D' }}>جاهز</span></span>
                </div>
              ))}
              {validation.invalid.slice(0, 100).map((r, i) => (
                <div key={'i' + i} style={{ display: 'grid', gridTemplateColumns: '2fr 1.4fr 1fr 1fr', padding: '11px 16px', borderBottom: '1px solid #F1F5F9', alignItems: 'center' }}>
                  <span style={{ fontSize: '13.5px', fontWeight: 700, color: '#0F172A' }}>{r.name}</span>
                  <span style={{ fontSize: '12px', color: '#64748B' }}>صف {r.row}</span>
                  <span></span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#DC2626' }}></span><span style={{ fontSize: '12px', fontWeight: 700, color: '#B91C1C' }}>{r.reason}</span></span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '24px', paddingTop: '20px', borderTop: '1px solid #F1F5F9' }}>
              <button onClick={() => setStep(2)} style={{ background: '#fff', color: '#64748B', border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '12px 26px', fontSize: '14.5px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>السابق</button>
              <button onClick={doImport} disabled={importing || !validation.valid.length} style={{ background: importing || !validation.valid.length ? '#94A3B8' : P, color: '#fff', border: 0, borderRadius: '10px', padding: '12px 34px', fontSize: '14.5px', fontWeight: 800, cursor: importing || !validation.valid.length ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>{importing ? 'جاري الاستيراد...' : `استيراد ${validation.valid.length} شركة`}</button>
            </div>
          </>
        )}

        {/* STEP 4: done */}
        {step === 4 && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ width: '70px', height: '70px', borderRadius: '50%', background: '#ECFDF5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px', margin: '0 auto 18px' }}>✓</div>
            <h2 style={{ fontSize: '23px', fontWeight: 900, color: '#0F172A', margin: '0 0 10px' }}>تم استيراد {importedCount.toLocaleString('en-US')} شركة بنجاح</h2>
            <p style={{ fontSize: '15px', color: '#64748B', lineHeight: 1.75, margin: '0 auto 22px', maxWidth: '520px' }}>أُضيفت الشركات لسجلات مرصد وأصبحت متاحة للبحث والتقييم. استُبعدت {validation.invalid.length} صفوف (مكررة أو ناقصة).</p>
            <button onClick={reset} style={{ background: P, color: '#fff', border: 0, borderRadius: '11px', padding: '12px 30px', fontSize: '15px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>رفع دفعة أخرى</button>
          </div>
        )}
      </div>
    </div>
  )
}
