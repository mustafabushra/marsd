import { useCallback, useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { getSupabase } from '../lib/api'
import {
  PORTAL_URL, REGISTRY_COLUMNS, describeHeaders, fetchDatasetInfo, toCompany,
} from '../lib/registryDataset'

/**
 * ⚡ استيراد من السجل التجاري
 *
 * The Ministry of Commerce publishes every active commercial registration in
 * the Kingdom, free and public, refreshed each quarter. It is the same ten
 * fields Marsad keeps about a company, from the authority that issues them —
 * which is a better registry than any amount of community entry can build.
 *
 * ============================================================================
 * Why the file is chosen rather than fetched
 * ============================================================================
 * The dataset's metadata comes over the API, and is shown at the top of this
 * screen so an import is labelled with its provenance. Its file does not: the
 * published `downloadUrl` is a SharePoint folder share that answers a server
 * with `403 FORBIDDEN`, and the record exposes no query endpoint — six
 * plausible ones return the portal's HTML fallback, which is what an invented
 * path returns too. So a person downloads it once and hands it over.
 *
 * ============================================================================
 * In batches, and resumable
 * ============================================================================
 * A quarter is hundreds of thousands of rows. One request would time out, and a
 * failure halfway would leave nobody knowing what had landed. Rows go up in
 * batches, the count is on screen while it happens, and stopping is allowed —
 * `cr_number` is unique, so re-running the same file updates what is there
 * instead of duplicating it, and an interrupted import is finished by importing
 * the same file again.
 */

const BATCH = 500

export default function AdminRegistryImport() {
  const [info, setInfo] = useState(null)
  const [infoError, setInfoError] = useState('')

  const [rows, setRows] = useState([])
  const [headers, setHeaders] = useState([])
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState('')

  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(0)
  const [written, setWritten] = useState(0)
  const [finished, setFinished] = useState(false)
  const stop = useRef(false)
  const input = useRef(null)

  // --- Where this data comes from -------------------------------------------
  useEffect(() => {
    const ac = new AbortController()
    fetchDatasetInfo(ac.signal).then(setInfo).catch((e) => {
      // Not fatal. The file is the file; this only labels it.
      if (e.name !== 'AbortError') setInfoError(e.message)
    })
    return () => ac.abort()
  }, [])

  // --- Reading the sheet ------------------------------------------------------
  const readFile = useCallback(async (file) => {
    setError('')
    setRows([])
    setFinished(false)
    setDone(0)
    setWritten(0)

    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
      setError('نوع الملف غير مدعوم — Excel أو CSV')
      return
    }

    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array', cellDates: true })
      const ws = wb.Sheets[wb.SheetNames[0]]
      if (!ws) throw new Error('الملف لا يحتوي على أوراق')

      const data = XLSX.utils.sheet_to_json(ws, { defval: null })
      if (!data.length) throw new Error('الورقة الأولى فارغة')

      setHeaders(Object.keys(data[0]))
      setRows(data)
      setFileName(file.name)
    } catch (e) {
      setError(e.message || 'تعذّرت قراءة الملف')
    }
  }, [])

  const { present, missing } = headers.length
    ? describeHeaders(headers)
    : { present: [], missing: REGISTRY_COLUMNS }

  // A file with no registration number is not this dataset. Importing it would
  // fill the registry with rows that can never be matched to anything.
  const hasCr = present.some((c) => c.field === 'crNumber')

  // --- Sending it ---------------------------------------------------------------
  const run = useCallback(async () => {
    setRunning(true)
    setFinished(false)
    setError('')
    stop.current = false

    const supabase = getSupabase()
    let sent = 0
    let saved = 0

    try {
      for (let i = 0; i < rows.length; i += BATCH) {
        if (stop.current) break

        const batch = rows.slice(i, i + BATCH)
          .map(toCompany)
          // A row without a registration number has no identity in this
          // registry and nothing to match on later. Dropped, and counted as
          // read so the numbers on screen still add up.
          .filter((c) => c.crNumber && c.name)
          .map((c) => ({
            cr_number: c.crNumber,
            name: c.name,
            unified_number: c.unifiedNumber,
            cr_type: c.crType,
            entity_type: c.entityType,
            capital: c.capital,
            region: c.region,
            city: c.city,
            founding_date: c.foundingDate,
            // The Ministry issues these. They are not somebody's submission,
            // and they do not queue for a review that could not read a hundred
            // thousand of them anyway.
            source: 'official',
            approved: true,
            status: 'active',
          }))

        if (batch.length) {
          const { data, error: e } = await supabase
            .from('companies')
            .upsert(batch, { onConflict: 'cr_number' })
            .select('id')

          // Read back, not assumed. An upsert RLS filters out returns no error
          // and no rows, and a progress bar running to a hundred percent over
          // nothing is the worst possible way to learn that.
          if (e) throw e
          saved += data?.length || 0
        }

        sent += batch.length
        setDone(Math.min(i + BATCH, rows.length))
        setWritten(saved)

        // Let the screen paint. Without this the tab freezes for the length of
        // the import and the progress nobody can see is worth nothing.
        await new Promise((r) => setTimeout(r, 0))
      }

      setFinished(!stop.current)
      if (sent === 0) setError('لم يُقرأ أي صف صالح — تحقّق من أن الملف هو ملف السجلات التجارية')
    } catch (e) {
      setError(e.message || 'تعذّر إتمام الاستيراد')
    } finally {
      setRunning(false)
    }
  }, [rows])

  const pct = rows.length ? Math.round((done / rows.length) * 100) : 0

  const card = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '22px', marginBottom: '18px' }

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '22px', fontWeight: 900, color: '#0F172A', margin: '0 0 6px' }}>
        ⚡ استيراد من السجل التجاري
      </h1>
      <p style={{ fontSize: '14px', color: '#64748B', margin: '0 0 20px', lineHeight: 1.9 }}>
        السجلات التجارية القائمة، كما تنشرها وزارة التجارة على بوابة البيانات
        المفتوحة. تُدخَل كبيانات رسمية بلا مراجعة، ويُحدَّث الموجود بدل تكراره.
      </p>

      {/* --- Provenance --- */}
      <div style={card}>
        <div style={{ fontSize: '14px', fontWeight: 900, color: '#0F172A', marginBottom: '10px' }}>
          مصدر البيانات
        </div>

        {info ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', color: '#475569', lineHeight: 1.9 }}>
            <div><b style={{ color: '#0F172A' }}>{info.titleAr}</b></div>
            <div>الجهة: {info.providerAr || '—'}</div>
            <div>آخر تحديث: {info.updatedAt || '—'} · التحديث: {info.frequency || '—'}</div>
          </div>
        ) : (
          <div style={{ fontSize: '13px', color: infoError ? '#B45309' : '#94A3B8', lineHeight: 1.9 }}>
            {infoError || 'جاري قراءة معلومات المصدر…'}
          </div>
        )}

        {/* The one thing this screen cannot do for you, said plainly. */}
        <div style={{ marginTop: '14px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '11px', padding: '13px', fontSize: '12.5px', color: '#475569', lineHeight: 1.95 }}>
          الملف يُنزَّل من البوابة بمتصفّحك ثم يُرفع هنا — البوابة تنشره على
          رابط مشاركة لا يقبل التنزيل من الخادم.
          <br />
          <a href={PORTAL_URL} target="_blank" rel="noopener noreferrer"
             style={{ color: '#1E2A52', fontWeight: 800, textDecoration: 'underline' }}>
            فتح صفحة البيانات ↗
          </a>
        </div>
      </div>

      {/* --- The file --- */}
      <div style={card}>
        <input ref={input} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }}
               onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) readFile(f) }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <button onClick={() => input.current?.click()} disabled={running}
                  style={{ minHeight: '46px', padding: '0 22px', background: '#1E2A52', color: '#fff', border: 0, borderRadius: '11px', fontSize: '14.5px', fontWeight: 800, cursor: running ? 'default' : 'pointer', fontFamily: 'inherit', opacity: running ? 0.5 : 1 }}>
            اختيار الملف
          </button>
          {fileName && (
            <span style={{ fontSize: '13px', color: '#475569' }}>
              {fileName} — <b>{rows.length.toLocaleString('ar-SA')}</b> صف
            </span>
          )}
        </div>

        {/* What was recognised, and what was not. */}
        {headers.length > 0 && (
          <div style={{ marginTop: '16px', display: 'flex', flexWrap: 'wrap', gap: '7px' }}>
            {REGISTRY_COLUMNS.map((col) => {
              const ok = present.some((p) => p.field === col.field)
              return (
                <span key={col.field} style={{
                  fontSize: '12px', fontWeight: 800, padding: '5px 11px', borderRadius: '999px',
                  background: ok ? '#F0FDF4' : '#FEF2F2',
                  color: ok ? '#15803D' : '#B91C1C',
                  border: `1px solid ${ok ? '#BBF7D0' : '#FECACA'}`,
                }}>
                  {ok ? '✓' : '○'} {col.label}
                </span>
              )
            })}
          </div>
        )}

        {headers.length > 0 && !hasCr && (
          <div style={{ marginTop: '14px', background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C', borderRadius: '11px', padding: '12px', fontSize: '13px', fontWeight: 700, lineHeight: 1.85 }}>
            لا يوجد عمود «رقم السجل» — هذا ليس ملف السجلات التجارية.
          </div>
        )}

        {headers.length > 0 && hasCr && missing.length > 0 && (
          <div style={{ marginTop: '14px', fontSize: '12.5px', color: '#B45309', lineHeight: 1.9 }}>
            أعمدة غير موجودة في الملف وستُترك فارغة: {missing.map((c) => c.label).join('، ')}
          </div>
        )}
      </div>

      {/* --- Running --- */}
      {rows.length > 0 && hasCr && (
        <div style={card}>
          {running || done > 0 ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '9px' }}>
                <span>{done.toLocaleString('ar-SA')} من {rows.length.toLocaleString('ar-SA')}</span>
                <span>{pct}%</span>
              </div>
              <div style={{ height: '8px', background: '#E2E8F0', borderRadius: '999px', overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: '#16A34A', transition: 'width .2s ease' }} />
              </div>
              <div style={{ marginTop: '10px', fontSize: '12.5px', color: '#64748B', lineHeight: 1.9 }}>
                حُفظ في السجل: <b style={{ color: '#0F172A' }}>{written.toLocaleString('ar-SA')}</b>
                {finished && ' — اكتمل'}
              </div>
            </>
          ) : null}

          <div style={{ display: 'flex', gap: '11px', marginTop: done > 0 ? '16px' : 0 }}>
            <button onClick={run} disabled={running}
                    style={{ minHeight: '46px', padding: '0 26px', background: running ? '#94A3B8' : '#16A34A', color: '#fff', border: 0, borderRadius: '11px', fontSize: '15px', fontWeight: 800, cursor: running ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
              {running ? 'جاري الاستيراد…' : done > 0 && !finished ? 'متابعة' : 'بدء الاستيراد'}
            </button>

            {running && (
              <button onClick={() => { stop.current = true }}
                      style={{ minHeight: '46px', padding: '0 22px', background: '#fff', color: '#B91C1C', border: '1.5px solid #FECACA', borderRadius: '11px', fontSize: '14.5px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                إيقاف
              </button>
            )}
          </div>

          <div style={{ marginTop: '12px', fontSize: '12px', color: '#94A3B8', lineHeight: 1.9 }}>
            الإيقاف آمن. رقم السجل فريد، فإعادة رفع نفس الملف تُكمل ما لم يصل
            ولا تُكرّر ما وصل.
          </div>
        </div>
      )}

      {error && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C', borderRadius: '12px', padding: '14px', fontSize: '13.5px', fontWeight: 700, lineHeight: 1.85 }}>
          {error}
        </div>
      )}
    </div>
  )
}
