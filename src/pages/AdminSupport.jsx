import { useCallback, useEffect, useState } from 'react'
import { getSupabase } from '../lib/api'
import { SkeletonPanel } from '../components/Skeleton'
import { PageTitle, Pill, EmptyState, ErrorState } from '../ui'

/**
 * /admin/support — the other half of «الإبلاغ عن مشكلة».
 *
 * A form that sends somewhere nobody looks is worse than no form: it collects
 * the complaint and the trust, and answers neither. The dialog on the company
 * side writes support_tickets; this is where they are read, and where the
 * screenshot attached to one can actually be opened.
 *
 * The attachments are in a private bucket, so each is fetched behind a signed
 * URL that expires. They routinely contain whatever the person had on screen —
 * frequently their own account — which is the reason the bucket is not public
 * and the reason a link here is minted per click rather than stored.
 */

const card = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: '14px', padding: '20px' }
const h3 = { fontSize: '15px', fontWeight: 900, color: '#0F172A', margin: '0 0 14px' }
const lbl = { fontSize: '11.5px', color: '#64748B', fontWeight: 700 }

const KIND = {
  technical: 'مشكلة تقنية',
  data: 'خطأ في البيانات',
  billing: 'الاشتراك أو الدفع',
  suggestion: 'اقتراح',
  other: 'ملاحظات عامة',
}

// The tone each status carries, named once. The colours themselves live in the
// theme now rather than being retyped per screen.
const PILL_TONE = {
  open: 'danger', in_progress: 'warning', resolved: 'success', closed: 'neutral',
}

const STATUS = {
  open: { t: 'مفتوح', bg: '#FEF2F2', fg: '#B91C1C' },
  in_progress: { t: 'قيد المعالجة', bg: '#FEF3C7', fg: '#B45309' },
  resolved: { t: 'مُعالَج', bg: '#ECFDF5', fg: '#15803D' },
  closed: { t: 'مغلق', bg: '#F1F5F9', fg: '#475569' },
}
const st = (s) => STATUS[s] || { t: s || '—', bg: '#F1F5F9', fg: '#475569' }

const dt = (d) => (d ? new Date(d).toLocaleString('ar-SA', { dateStyle: 'medium', timeStyle: 'short' }) : '—')

const SCOPES = [
  { v: 'open', t: 'المفتوحة' },
  { v: 'in_progress', t: 'قيد المعالجة' },
  { v: 'resolved', t: 'المُعالَجة' },
  { v: 'all', t: 'الكل' },
]

export default function AdminSupport () {
  const [scope, setScope] = useState('open')
  const [list, setList] = useState({ data: null, loading: true, error: '' })
  const [open, setOpen] = useState(null)
  const [files, setFiles] = useState({ data: null, loading: false, error: '' })
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')

  const say = (m) => { setToast(m); setTimeout(() => setToast(''), 4000) }

  const load = useCallback(async () => {
    setList((x) => ({ ...x, loading: true, error: '' }))
    try {
      let q = getSupabase().from('support_tickets')
        .select('id, kind, details, status, page_url, created_at, created_by, tenant_id, resolution')
        .order('created_at', { ascending: false })
        .limit(100)
      if (scope !== 'all') q = q.eq('status', scope)
      const { data, error } = await q
      if (error) throw error
      setList({ data: data || [], loading: false, error: '' })
    } catch (e) {
      setList({ data: null, loading: false, error: e.message || 'تعذّر التحميل' })
    }
  }, [scope])

  useEffect(() => { load() }, [load])

  // Attachments load per ticket, and a failure here must not blank the ticket
  // text beside it — the description is usually enough to act on.
  const loadFiles = useCallback(async (ticketId) => {
    setFiles({ data: null, loading: true, error: '' })
    try {
      const sb = getSupabase()
      const { data, error } = await sb.from('support_ticket_attachments')
        .select('id, s3_key, file_name, mime_type, file_size')
        .eq('ticket_id', ticketId)
      if (error) throw error
      setFiles({ data: data || [], loading: false, error: '' })
    } catch (e) {
      setFiles({ data: null, loading: false, error: e.message || 'تعذّر تحميل المرفقات' })
    }
  }, [])

  const show = (t) => { setOpen(t); loadFiles(t.id) }

  // Minted per click and short-lived. A signed URL kept in the page is a link
  // to somebody's screenshot that outlives the reason it was made.
  const openFile = async (key) => {
    try {
      const { data, error } = await getSupabase().storage
        .from('support-attachments').createSignedUrl(key, 120)
      if (error) throw error
      window.open(data.signedUrl, '_blank', 'noopener')
    } catch (e) {
      say('❌ ' + (e.message || 'تعذّر فتح المرفق'))
    }
  }

  const setStatus = async (status) => {
    try {
      setBusy(true)
      // `.select()` because an update filtered out by RLS returns no error and
      // no rows, and the screen would report a change that did not happen.
      const { data, error } = await getSupabase().from('support_tickets')
        .update({
          status,
          updated_at: new Date().toISOString(),
          ...(status === 'resolved' ? { resolved_at: new Date().toISOString() } : {}),
        })
        .eq('id', open.id).select('id')
      if (error) throw error
      if (!data?.length) throw new Error('لم تُحفَظ الحالة — تحقّق من صلاحيتك')
      say('✅ حُدِّثت الحالة')
      setOpen({ ...open, status })
      load()
    } catch (e) {
      say('❌ ' + (e.message || 'تعذّر التحديث'))
    } finally { setBusy(false) }
  }

  return (
    <div>
      <PageTitle note="البلاغات الواردة من الشركات عبر «الإبلاغ عن مشكلة».">الدعم الفني</PageTitle>

      {toast && (
        <div role="status" style={{
          background: '#0F172A', color: '#fff', borderRadius: '10px', padding: '12px 16px',
          fontSize: '13px', fontWeight: 700, marginBottom: '16px',
        }}>{toast}</div>
      )}

      <div role="tablist" aria-label="نطاق البلاغات"
        style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
        {SCOPES.map((s) => (
          <button key={s.v} role="tab" aria-selected={scope === s.v}
            onClick={() => setScope(s.v)} style={{
              padding: '9px 16px', borderRadius: '9px', fontSize: '13px', fontWeight: 800,
              cursor: 'pointer', fontFamily: 'inherit',
              background: scope === s.v ? '#1E2A52' : '#fff',
              color: scope === s.v ? '#fff' : '#334155',
              border: scope === s.v ? 0 : '1.5px solid #E2E8F0',
            }}>{s.t}</button>
        ))}
      </div>

      <div style={card}>
        {list.loading ? <SkeletonPanel rows={5} title={false} />
          : list.error ? (
            <ErrorState what="البلاغات" message={list.error} onRetry={load} />
          ) : !list.data?.length ? (
            <EmptyState title="لا بلاغات في هذا النطاق">لم يصل أي بلاغ مطابق.</EmptyState>
          ) : list.data.map((t, i) => (
            <button key={t.id} onClick={() => show(t)} style={{
              display: 'block', width: '100%', textAlign: 'right', padding: '14px 0',
              borderTop: i ? '1px solid #F1F5F9' : 0, background: 'none', border: 0,
              cursor: 'pointer', fontFamily: 'inherit',
            }}>
              <div style={{ display: 'flex', gap: '9px', alignItems: 'center', flexWrap: 'wrap' }}>
                <Pill tone={PILL_TONE[t.status] || 'neutral'}>{st(t.status).t}</Pill>
                <span style={{ fontSize: '12.5px', fontWeight: 800, color: '#1E2A52' }}>{KIND[t.kind] || t.kind}</span>
                <span style={{ fontSize: '12px', color: '#94A3B8' }}>{dt(t.created_at)}</span>
              </div>
              <div style={{
                fontSize: '14px', color: '#0F172A', marginTop: '6px', lineHeight: 1.9,
                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
              }}>{t.details}</div>
              {t.page_url && (
                <div style={{ fontSize: '12px', color: '#64748B', marginTop: '3px' }}>
                  من <code>{t.page_url}</code>
                </div>
              )}
            </button>
          ))}
      </div>

      {open && (
        <div role="dialog" aria-modal="true" aria-label="تفاصيل البلاغ"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(null) }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(15,23,42,.5)', zIndex: 60,
            display: 'flex', justifyContent: 'flex-start',
          }}>
          <div style={{
            background: '#F8FAFC', width: 'min(640px, 100%)', height: '100%',
            overflowY: 'auto', padding: '24px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 900, color: '#0F172A', margin: 0 }}>تفاصيل البلاغ</h2>
              <button onClick={() => setOpen(null)} style={{
                background: '#fff', border: '1.5px solid #E2E8F0', borderRadius: '8px',
                padding: '7px 14px', fontSize: '12.5px', fontWeight: 800, cursor: 'pointer',
                fontFamily: 'inherit', color: '#1E2A52',
              }}>إغلاق</button>
            </div>

            <div style={{ ...card, marginBottom: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '14px' }}>
                <div><div style={lbl}>النوع</div><div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', marginTop: '3px' }}>{KIND[open.kind] || open.kind}</div></div>
                <div><div style={lbl}>الحالة</div><div style={{ marginTop: '3px' }}>
                  <span style={{ background: st(open.status).bg, color: st(open.status).fg, borderRadius: '999px', padding: '3px 11px', fontSize: '12px', fontWeight: 800 }}>{st(open.status).t}</span>
                </div></div>
                <div><div style={lbl}>وصل</div><div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A', marginTop: '3px' }}>{dt(open.created_at)}</div></div>
                <div><div style={lbl}>الصفحة</div><div style={{ fontSize: '13px', color: '#334155', marginTop: '3px', wordBreak: 'break-all' }}>{open.page_url || '—'}</div></div>
              </div>
            </div>

            <div style={{ ...card, marginBottom: '14px' }}>
              <h3 style={h3}>الوصف</h3>
              <p style={{ fontSize: '14px', color: '#0F172A', margin: 0, lineHeight: 2, whiteSpace: 'pre-wrap' }}>{open.details}</p>
            </div>

            <div style={{ ...card, marginBottom: '14px' }}>
              <h3 style={h3}>المرفقات</h3>
              {files.loading ? <SkeletonPanel rows={2} title={false} />
                : files.error ? (
                  <div style={{ fontSize: '12.5px', color: '#B91C1C', lineHeight: 1.9 }}>
                    {files.error}
                    <button onClick={() => loadFiles(open.id)} style={{
                      display: 'block', marginTop: '8px', padding: '6px 13px', borderRadius: '8px',
                      border: '1.5px solid #E2E8F0', background: '#fff', color: '#1E2A52',
                      fontSize: '12px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
                    }}>إعادة المحاولة</button>
                  </div>
                ) : !files.data?.length ? (
                  <div style={{ fontSize: '13px', color: '#94A3B8' }}>لا مرفقات مع هذا البلاغ.</div>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '9px' }}>
                    {files.data.map((f) => (
                      <button key={f.id} onClick={() => openFile(f.s3_key)} style={{
                        display: 'inline-flex', alignItems: 'center', gap: '8px',
                        background: '#fff', border: '1.5px solid #E2E8F0', borderRadius: '10px',
                        padding: '9px 12px', cursor: 'pointer', fontFamily: 'inherit', maxWidth: '100%',
                      }}>
                        <span style={{ fontSize: '14px' }}>{(f.mime_type || '').startsWith('image/') ? '🖼️' : '📄'}</span>
                        <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#1E2A52', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '220px' }}>{f.file_name}</span>
                      </button>
                    ))}
                  </div>
                )}
            </div>

            <div style={card}>
              <h3 style={h3}>الحالة</h3>
              <div style={{ display: 'flex', gap: '9px', flexWrap: 'wrap' }}>
                {['in_progress', 'resolved', 'closed'].map((s) => (
                  <button key={s} onClick={() => setStatus(s)} disabled={busy || open.status === s}
                    style={{
                      padding: '9px 17px', borderRadius: '9px', border: open.status === s ? 0 : '1.5px solid #E2E8F0',
                      background: open.status === s ? '#CBD5E1' : '#fff',
                      color: open.status === s ? '#fff' : '#1E2A52',
                      fontSize: '12.5px', fontWeight: 800,
                      cursor: busy || open.status === s ? 'default' : 'pointer', fontFamily: 'inherit',
                    }}>{st(s).t}</button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
