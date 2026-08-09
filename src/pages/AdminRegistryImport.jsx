import { useCallback, useEffect, useRef, useState } from 'react'
import { getSupabase } from '../lib/api'
import {
  DATASET_ID, PORTAL_URL, REGISTRY_COLUMNS, describeHeaders, fetchDatasetInfo,
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
 * A quarter is hundreds of thousands of rows. Reading it happens in a worker —
 * doing it here killed the tab outright — and the rows go up in batches, because
 * one request would time out and a failure halfway would leave nobody knowing
 * what had landed. The count is on screen throughout, and stopping is allowed —
 * `cr_number` is unique, so re-running the same file updates what is there
 * instead of duplicating it, and an interrupted import is finished by importing
 * the same file again.
 */

const BATCH = 500

export default function AdminRegistryImport() {
  const [info, setInfo] = useState(null)
  const [infoError, setInfoError] = useState('')

  const [total, setTotal] = useState(0)
  const [atExcelLimit, setAtExcelLimit] = useState(false)
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
  //
  // In a worker. The first version read the file in this handler, and on a real
  // quarter of the register — hundreds of thousands of rows — Chrome killed the
  // tab before it finished: `RESULT_CODE_HUNG`. The upload was batched; the
  // parse was not, and the parse is the larger half.
  const [stage, setStage] = useState('')
  // Which publication these rows belong to. Taken from the dataset's own title
  // so a row can always be traced to the quarter it was published in — Q3 is a
  // different snapshot, not an update to Q2.
  const snapshot = info?.titleAr || 'غير محدّد'
  // The portal gives a publication date; without it the import date is the
  // best evidence there is, and it is at least monotonic per file.
  const snapshotAt = (info?.updatedAt || new Date().toISOString()).slice(0, 10)
  const worker = useRef(null)

  useEffect(() => () => worker.current?.terminate(), [])

  const readFile = useCallback((file) => {
    setError('')
    setTotal(0)
    setAtExcelLimit(false)
    setHeaders([])
    setFinished(false)
    setDone(0)
    setWritten(0)
    setFileName(file.name)
    setStage('جاري فتح الملف…')

    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
      setError('نوع الملف غير مدعوم — Excel أو CSV')
      setStage('')
      return
    }

    worker.current?.terminate()
    const w = new Worker(new URL('../lib/registryParser.worker.js', import.meta.url), { type: 'module' })
    worker.current = w

    // Rows arrive in chunks and are appended, so the count climbs while the
    // file is still being read rather than appearing all at once at the end.
    w.onmessage = (e) => {
      const msg = e.data
      if (msg.type === 'stage') {
        setStage(msg.stage === 'reading' ? 'جاري قراءة الملف…' : 'جاري تحويل الصفوف…')
      } else if (msg.type === 'ready') {
        // Headers and a count. The rows themselves stay in the worker — a
        // million of them crossing to this thread is two full copies in memory
        // and a React state update per chunk, which is how the tab died the
        // second time.
        setHeaders(msg.headers)
        setTotal(msg.total)
        setAtExcelLimit(!!msg.atExcelLimit)
        setStage('')
      } else if (msg.type === 'error') {
        setError(msg.message)
        setStage('')
      }
    }

    w.onerror = () => {
      setError('تعذّرت قراءة الملف — قد يكون تالفاً أو أكبر من ذاكرة المتصفّح')
      setStage('')
    }

    w.postMessage({ type: 'read', file })
  }, [])

  const { present, missing } = headers.length
    ? describeHeaders(headers)
    : { present: [], missing: REGISTRY_COLUMNS }

  // A file with no registration number is not this dataset. Importing it would
  // fill the registry with rows that can never be matched to anything.
  const hasCr = present.some((c) => c.field === 'crNumber')

  // --- Sending it ---------------------------------------------------------------
  //
  // One batch in memory at a time, whatever the file holds. The page asks the
  // worker for rows `from…from+BATCH`, already mapped, uploads them, and asks
  // for the next — so a million-row file costs the same as a thousand-row one
  // and nothing is ever copied twice.
  const run = useCallback(async () => {
    const w = worker.current
    if (!w) { setError('أعد اختيار الملف'); return }

    setRunning(true)
    setFinished(false)
    setError('')
    stop.current = false

    const supabase = getSupabase()
    let saved = written
    let readAny = 0

    /** Ask the worker for one batch. */
    const askFor = (from) => new Promise((resolve, reject) => {
      const onMessage = (e) => {
        if (e.data?.type !== 'batch') return
        w.removeEventListener('message', onMessage)
        resolve(e.data)
      }
      w.addEventListener('message', onMessage)
      // A worker that has been terminated never answers, and a promise that
      // never settles is a progress bar that stops with no explanation.
      setTimeout(() => {
        w.removeEventListener('message', onMessage)
        reject(new Error('لم يستجب قارئ الملف — أعد اختيار الملف'))
      }, 60000)
      w.postMessage({ type: 'batch', from, size: BATCH })
    })

    try {
      for (let from = done; from < total; from += BATCH) {
        if (stop.current) break

        const { companies, read } = await askFor(from)
        readAny += read

        if (companies.length) {
          const { data, error: e } = await supabase
            .from('government_company_registry')
            .upsert(companies.map((c) => ({
              dataset_id: DATASET_ID,
              snapshot_period: snapshot,
              // The quarter the data describes, not the day we loaded it.
              // Search shows the most recent publication of each company, and
              // catching up on a missed quarter must not make it look newest.
              snapshot_at: snapshotAt,
              cr_number: c.crNumber,
              name: c.name,
              unified_number: c.unifiedNumber,
              registration_type: c.crType,
              legal_entity: c.entityType,
              capital: c.capital,
              region: c.region,
              city: c.city,
              registration_date: c.foundingDate,
            })), { onConflict: 'dataset_id,cr_number' })
            .select('id')

          // Read back, not assumed. An upsert RLS filters out returns no error
          // and no rows, and a progress bar running to a hundred percent over
          // nothing is the worst possible way to learn that.
          if (e) throw e
          saved += data?.length || 0
        }

        setDone(Math.min(from + BATCH, total))
        setWritten(saved)
        await new Promise((r) => setTimeout(r, 0))
      }

      setFinished(!stop.current)
      if (readAny === 0) setError('لم يُقرأ أي صف صالح — تحقّق من أن الملف هو ملف السجلات التجارية')
    } catch (e) {
      setError(e.message || 'تعذّر إتمام الاستيراد')
    } finally {
      setRunning(false)
    }
  }, [total, done, written, snapshot, snapshotAt])

  const pct = total ? Math.round((done / total) * 100) : 0

  const card = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '22px', marginBottom: '18px' }

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '22px', fontWeight: 900, color: '#0F172A', margin: '0 0 6px' }}>
        ⚡ استيراد من السجل التجاري
      </h1>
      <p style={{ fontSize: '14px', color: '#64748B', margin: '0 0 20px', lineHeight: 1.9 }}>
        السجلات التجارية القائمة، كما تنشرها وزارة التجارة على بوابة البيانات
        المفتوحة. تُحفَظ كسجل حكومي مستقل — <b>ولا تصير شركات في مرصد</b> إلا
        حين يطلب أحد ذلك من صفحة البحث.
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
          <button onClick={() => input.current?.click()} disabled={running || !!stage}
                  style={{ minHeight: '46px', padding: '0 22px', background: '#1E2A52', color: '#fff', border: 0, borderRadius: '11px', fontSize: '14.5px', fontWeight: 800, cursor: running ? 'default' : 'pointer', fontFamily: 'inherit', opacity: running ? 0.5 : 1 }}>
            اختيار الملف
          </button>
          {fileName && (
            <span style={{ fontSize: '13px', color: '#475569' }}>
              {fileName}
              {stage
                ? ` — ${stage}`
                : <> — <b className="marsad-row-count">{total.toLocaleString('ar-SA')}</b> صف</>}
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

        {/* Excel's ceiling, not a coincidence.

            1,048,576 is the maximum number of rows a worksheet can hold. A file
            that lands exactly there was almost certainly cut off when it was
            saved, and importing it silently leaves out whatever came after —
            which surfaces months later as companies that are simply not in the
            registry, with nothing to explain why. */}
        {atExcelLimit && (
          <div style={{ marginTop: '14px', background: '#FFFBEB', border: '1px solid #FDE68A', color: '#B45309', borderRadius: '11px', padding: '13px', fontSize: '13px', fontWeight: 700, lineHeight: 1.9 }}>
            ⚠️ الملف يحتوي {total.toLocaleString('ar-SA')} صف — وهو الحدّ الأقصى
            لصفوف Excel. على الأرجح أن الملف الأصلي أكبر وقُطع عند الحفظ.
            <br />
            <span style={{ fontWeight: 600 }}>
              يمكنك الاستيراد الآن، لكن ما بعد هذا الصف لن يدخل. الأفضل تنزيل
              الملف بصيغة CSV إن كانت متاحة، أو تقسيمه.
            </span>
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
      {total > 0 && hasCr && (
        <div style={card}>
          {running || done > 0 ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '9px' }}>
                <span>{done.toLocaleString('ar-SA')} من {total.toLocaleString('ar-SA')}</span>
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
