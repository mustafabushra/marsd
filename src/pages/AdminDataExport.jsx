import { useCallback, useState, useEffect } from 'react'
import { useUser } from '@clerk/react'
import { getSupabase } from '../lib/api'
import { StatTile, STATUS_COLOR } from '../components/Charts'

/**
 * /admin/data-export — taking the data out.
 *
 * The button posted to /api/export, which does not exist. The response was a
 * 404, response.ok was false, the else branch was empty, and the spinner stopped
 * — so pressing Export did nothing at all and said nothing about it. The screen
 * also offered a "payments" dataset for a payments system Marsad does not have.
 *
 * There is no reason for a server here. An admin already has read access to
 * these tables under RLS, so the browser fetches the rows it is allowed to see
 * and builds the file itself. That also means the export can never disagree with
 * what the panel shows: it is the same query.
 *
 * Each export is recorded. A platform holding other companies' commercial
 * conduct should be able to say who took a copy of it and when. It goes to
 * audit_logs rather than export_jobs because that table requires a tenant_id and
 * a platform administrator has no tenant — a platform action belongs in the
 * platform's own log.
 */

const card = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px' }

// Only what exists. Columns are named rather than selected with '*' so an export
// cannot silently start carrying a column added later for another purpose.
const DATASETS = [
  {
    id: 'companies', label: 'الشركات', table: 'companies', dateColumn: 'created_at',
    columns: 'id, name, name_en, cr_number, unified_number, entity_type, sector, main_activity, city, region, website, official_email, phone, source, status, approved, verified, verified_at, created_at',
    note: 'سجل الشركات كاملاً',
  },
  {
    id: 'reports', label: 'التقارير', table: 'reports', dateColumn: 'created_at',
    columns: 'id, reporter_tenant_id, target_company_id, status, category, report_type, payment_commitment, delay_days, defaulted, deal_value, currency, dealt_at, submitted_at, approved_at, created_at',
    note: 'بلا نصوص الوصف — تحتوي تفاصيل تجارية حسّاسة',
  },
  {
    id: 'trust_scores', label: 'درجات الثقة', table: 'trust_scores', dateColumn: 'computed_at',
    columns: 'company_id, score, risk_band, tier, approved_reports, computed_at',
    note: 'الدرجة الحالية لكل شركة',
  },
  {
    id: 'tenants', label: 'حسابات الشركات', table: 'tenants', dateColumn: 'created_at',
    columns: 'id, name, cr_number, email, phone, sector, city, status, company_id, created_at',
    note: 'الشركات المشتركة في مرصد',
  },
  {
    id: 'users', label: 'المستخدمون', table: 'users', dateColumn: 'created_at',
    columns: 'id, email, first_name, last_name, role, status, tenant_id, last_login_at, created_at',
    note: 'بيانات شخصية — التصدير مُسجَّل باسمك',
  },
  {
    id: 'subscriptions', label: 'الاشتراكات', table: 'subscriptions', dateColumn: 'created_at',
    columns: 'id, tenant_id, plan_id, status, current_period_start, current_period_end, created_at',
    note: 'الباقة الحالية لكل شركة',
  },
  {
    id: 'credits_ledger', label: 'سجل النقاط', table: 'credits_ledger', dateColumn: 'created_at',
    columns: 'id, tenant_id, amount, reason, report_id, created_at',
    note: 'كل حركة Give-to-Get',
  },
  {
    id: 'audit_logs', label: 'سجل التدقيق', table: 'audit_logs', dateColumn: 'created_at',
    columns: 'id, actor_id, action, entity, entity_id, tenant_id, created_at',
    note: 'من فعل ماذا ومتى',
  },
]

const RANGES = [
  { id: 0, label: 'كل الفترات' },
  { id: 30, label: 'آخر ٣٠ يوماً' },
  { id: 90, label: 'آخر ٩٠ يوماً' },
  { id: 365, label: 'آخر سنة' },
]

/**
 * RFC 4180: a field containing a quote, a comma or a newline is quoted, and
 * quotes inside it are doubled. Getting this wrong shifts every later column on
 * the row — and an Arabic company name with a comma in it is not unusual.
 */
const csvCell = (v) => {
  if (v == null) return ''
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const toCsv = (rows) => {
  if (!rows.length) return ''
  const headers = Object.keys(rows[0])
  return [
    headers.join(','),
    ...rows.map((r) => headers.map((h) => csvCell(r[h])).join(',')),
  ].join('\r\n')
}

const download = (text, filename, mime) => {
  // The BOM is what makes Excel read UTF-8 rather than the system codepage.
  // Without it every Arabic name in the file opens as mojibake.
  const blob = new Blob([mime.startsWith('text/csv') ? '﻿' + text : text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export default function AdminDataExport() {
  const { user } = useUser()
  const [selected, setSelected] = useState({ companies: true, reports: true, trust_scores: true })
  const [format, setFormat] = useState('csv')
  const [days, setDays] = useState(0)
  const [counts, setCounts] = useState({})
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [history, setHistory] = useState([])
  const [toast, setToast] = useState('')

  const showToast = (m) => { setToast(m); setTimeout(() => setToast(''), 5000) }

  const load = useCallback(async () => {
    const supabase = getSupabase()

    // How many rows each dataset holds, so the operator knows the size before
    // asking for it rather than after the browser has stalled.
    const results = await Promise.all(DATASETS.map(async (d) => {
      const { count } = await supabase.from(d.table).select('id', { count: 'exact', head: true })
      return [d.id, count || 0]
    }))
    setCounts(Object.fromEntries(results))

    const { data } = await supabase
      .from('audit_logs')
      .select('id, action, meta, created_at')
      .eq('action', 'data_exported')
      .order('created_at', { ascending: false })
      .limit(8)
    setHistory(data || [])
  }, [])

  useEffect(() => { load() }, [load])

  const chosen = DATASETS.filter((d) => selected[d.id])
  const estimatedRows = chosen.reduce((s, d) => s + (counts[d.id] || 0), 0)

  const runExport = async () => {
    if (!chosen.length) return
    try {
      setBusy(true)
      const supabase = getSupabase()
      const since = days > 0 ? new Date(Date.now() - days * 86400000).toISOString() : null
      const stamp = new Date().toISOString().slice(0, 10)
      let exported = 0

      for (const d of chosen) {
        setProgress(`جاري تصدير ${d.label}…`)

        // Paged, because a single select of tens of thousands of rows is a
        // request that times out rather than an export that is merely slow.
        const rows = []
        const PAGE = 1000
        for (let from = 0; ; from += PAGE) {
          let q = supabase.from(d.table).select(d.columns).range(from, from + PAGE - 1)
          if (since) q = q.gte(d.dateColumn, since)
          const { data, error } = await q
          if (error) throw new Error(`${d.label}: ${error.message}`)
          rows.push(...(data || []))
          if (!data || data.length < PAGE) break
        }

        if (!rows.length) { showToast(`⚠️ ${d.label}: لا صفوف في هذه الفترة`); continue }

        if (format === 'csv') {
          download(toCsv(rows), `marsad-${d.id}-${stamp}.csv`, 'text/csv;charset=utf-8')
        } else {
          download(JSON.stringify(rows, null, 2), `marsad-${d.id}-${stamp}.json`, 'application/json')
        }
        exported += rows.length
      }

      // Recorded whether or not anyone is watching. A platform holding other
      // companies' conduct should be able to say who took a copy of it.
      await supabase.from('audit_logs').insert([{
        actor_id: user?.id,
        action: 'data_exported',
        entity: 'platform',
        meta: JSON.stringify({
          datasets: chosen.map((d) => d.id),
          format,
          range_days: days,
          rows: exported,
        }),
        created_at: new Date().toISOString(),
      }])

      await load()
      showToast(`✅ صُدِّر ${exported.toLocaleString('en-US')} صفاً في ${chosen.length} ملفاً`)
    } catch (err) {
      showToast(`❌ ${err.message || 'فشل التصدير'}`)
    } finally {
      setBusy(false)
      setProgress('')
    }
  }

  return (
    <div>
      {toast && (
        <div style={{ position: 'fixed', bottom: '24px', left: '24px', background: '#0F172A', color: '#fff', borderRadius: '10px', padding: '12px 18px', fontSize: '13.5px', fontWeight: 700, zIndex: 100, boxShadow: '0 8px 24px rgba(15,23,42,.25)', maxWidth: '460px', lineHeight: 1.8 }}>{toast}</div>
      )}

      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 900, color: '#0F172A', margin: '0 0 5px', textAlign: 'right' }}>تصدير البيانات</h1>
        <p style={{ fontSize: '14px', color: '#64748B', margin: 0, textAlign: 'right' }}>
          الملف يُبنى في متصفحك من نفس الاستعلامات التي تعرضها اللوحة — وكل تصدير يُسجَّل باسمك
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: '14px', marginBottom: '18px' }}>
        <StatTile label="مجموعات مختارة" value={chosen.length} sub={`من ${DATASETS.length}`} />
        <StatTile label="صفوف تقريبية" value={estimatedRows.toLocaleString('en-US')} sub={days ? `مقيّدة بالفترة عند التصدير` : 'كل الفترات'} tone={estimatedRows > 50000 ? STATUS_COLOR.warning : undefined} />
        <StatTile label="الصيغة" value={format.toUpperCase()} sub={format === 'csv' ? 'يفتح في Excel' : 'للمعالجة البرمجية'} />
      </div>

      <div style={{ ...card, padding: '22px', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '15.5px', fontWeight: 900, color: '#0F172A', margin: '0 0 16px', textAlign: 'right' }}>ما الذي يُصدَّر</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(250px,1fr))', gap: '11px' }}>
          {DATASETS.map((d) => (
            <label key={d.id} style={{ display: 'flex', gap: '11px', alignItems: 'flex-start', padding: '13px 15px', border: `1.5px solid ${selected[d.id] ? '#1E2A52' : '#E2E8F0'}`, borderRadius: '11px', cursor: 'pointer', background: selected[d.id] ? '#F8FAFC' : '#fff', textAlign: 'right', flexDirection: 'row-reverse' }}>
              <input
                type="checkbox"
                checked={!!selected[d.id]}
                onChange={(e) => setSelected((s) => ({ ...s, [d.id]: e.target.checked }))}
                style={{ width: '17px', height: '17px', marginTop: '2px', cursor: 'pointer', accentColor: '#1E2A52', flexShrink: 0 }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>
                  {d.label}
                  <span style={{ color: '#64748B', fontWeight: 700 }}> · {(counts[d.id] ?? 0).toLocaleString('en-US')}</span>
                </div>
                <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 600, marginTop: '3px', lineHeight: 1.7 }}>{d.note}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      <div style={{ ...card, padding: '22px', marginBottom: '16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: '20px' }}>
          <div>
            <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#334155', marginBottom: '9px', textAlign: 'right' }}>الصيغة</div>
            <div style={{ display: 'flex', gap: '9px' }}>
              {['csv', 'json'].map((f) => (
                <button key={f} onClick={() => setFormat(f)} style={{ flex: 1, padding: '10px', background: format === f ? '#1E2A52' : '#fff', color: format === f ? '#fff' : '#334155', border: format === f ? 0 : '1.5px solid #E2E8F0', borderRadius: '9px', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {f.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#334155', marginBottom: '9px', textAlign: 'right' }}>الفترة</div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {RANGES.map((r) => (
                <button key={r.id} onClick={() => setDays(r.id)} style={{ padding: '10px 15px', background: days === r.id ? '#1E2A52' : '#fff', color: days === r.id ? '#fff' : '#334155', border: days === r.id ? 0 : '1.5px solid #E2E8F0', borderRadius: '9px', fontSize: '12.5px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <button
          onClick={runExport}
          disabled={busy || !chosen.length}
          style={{ marginTop: '20px', width: '100%', padding: '14px', background: busy || !chosen.length ? '#CBD5E1' : '#16A34A', color: '#fff', border: 0, borderRadius: '11px', fontSize: '15px', fontWeight: 800, cursor: busy || !chosen.length ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
        >
          {busy ? (progress || 'جاري التصدير…') : chosen.length ? `تصدير ${chosen.length} ملفاً` : 'اختر مجموعة واحدة على الأقل'}
        </button>
        <p style={{ fontSize: '12.5px', color: '#64748B', margin: '11px 2px 0', fontWeight: 600, textAlign: 'right', lineHeight: 1.9 }}>
          ملف لكل مجموعة. ملفات CSV تحمل علامة ترميز حتى تفتح العربية سليمة في Excel.
        </p>
      </div>

      <div style={{ ...card, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #F1F5F9' }}>
          <h2 style={{ fontSize: '15px', fontWeight: 900, color: '#0F172A', margin: 0, textAlign: 'right' }}>آخر عمليات التصدير</h2>
        </div>
        {history.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: '#64748B', fontSize: '13.5px', fontWeight: 600 }}>لم يُصدَّر شيء بعد</div>
        ) : history.map((h, i) => {
          let meta = {}
          try { meta = typeof h.meta === 'string' ? JSON.parse(h.meta) : (h.meta || {}) } catch { /* a log entry must never break the page */ }
          return (
            <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 20px', borderBottom: i < history.length - 1 ? '1px solid #F1F5F9' : 'none', gap: '12px', flexWrap: 'wrap', textAlign: 'right' }}>
              <span style={{ fontSize: '13.5px', fontWeight: 700, color: '#334155' }}>
                {(meta.datasets || []).map((d) => DATASETS.find((x) => x.id === d)?.label || d).join('، ') || '—'}
                <span style={{ color: '#64748B' }}> · {String(meta.format || '').toUpperCase()}</span>
              </span>
              <span style={{ fontSize: '12.5px', color: '#64748B', fontWeight: 700 }}>
                {Number(meta.rows || 0).toLocaleString('en-US')} صف · {new Date(h.created_at).toLocaleString('en-GB')}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
