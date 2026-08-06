import { useCallback, useEffect, useState } from 'react'
import { getSupabase } from '../lib/api'

/**
 * The evidence behind a report, for whoever is judging it.
 *
 * A reviewer was approving or rejecting an accusation with the accuser's proof
 * out of reach — there was no way to attach it and no way to look at it. This is
 * the second half: ReportAttachments collects the files, this shows them.
 *
 * ============================================================================
 * Absence is a finding
 * ============================================================================
 * When a report has no attachments this says so plainly rather than rendering
 * nothing. A reviewer needs to know they are deciding on an unevidenced claim —
 * an empty space looks like a panel that failed to load, and reads as no
 * information rather than as information.
 *
 * ============================================================================
 * Signed links, not public ones
 * ============================================================================
 * The bucket is private. Each link is minted on demand and expires, so a URL
 * copied out of the page stops working; nothing here can hand a permanent
 * address to a file that identifies a reporter.
 */

const BUCKET = 'report-documents'
const LINK_TTL = 300

const size = (n) => (!n ? '' : n > 1024 * 1024
  ? `${(n / 1024 / 1024).toFixed(1)} م.ب`
  : `${Math.max(1, Math.round(n / 1024))} ك.ب`)

export default function ReportEvidence({ reportId }) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  const [opening, setOpening] = useState(null)

  const load = useCallback(async () => {
    if (!reportId) return
    try {
      setError('')
      const { data, error: e } = await getSupabase()
        .rpc('report_attachments', { p_report_id: reportId })
      if (e) throw e
      setRows(data || [])
    } catch (err) {
      console.error('report_attachments failed:', err)
      // Told, not hidden. «No attachments» and «could not read them» lead a
      // reviewer to opposite conclusions about the same report.
      setError('تعذّر قراءة المرفقات')
      setRows([])
    }
  }, [reportId])

  useEffect(() => { load() }, [load])

  const open = async (row) => {
    try {
      setOpening(row.id)
      const { data, error: e } = await getSupabase().storage
        .from(BUCKET).createSignedUrl(row.s3_key, LINK_TTL)
      if (e) throw e
      if (!data?.signedUrl) throw new Error('لم يُنشأ الرابط')
      window.open(data.signedUrl, '_blank', 'noopener')
    } catch (err) {
      console.error('signed url failed:', err)
      setError(`تعذّر فتح ${row.file_name}`)
    } finally {
      setOpening(null)
    }
  }

  if (rows === null) return null

  return (
    <div style={{ marginBottom: '20px' }}>
      <div style={{ fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '8px', textAlign: 'right' }}>
        المستندات المُثبِتة {rows.length > 0 && `(${rows.length})`}
      </div>

      {error && (
        <div style={{ fontSize: '12.5px', color: '#B91C1C', fontWeight: 700, marginBottom: '8px', textAlign: 'right' }}>
          ⚠️ {error}
        </div>
      )}

      {rows.length === 0 ? (
        <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '11px', padding: '13px 16px', fontSize: '13px', color: '#92400E', fontWeight: 700, lineHeight: 1.7, textAlign: 'right' }}>
          لا مستندات مرفقة. المُبلِّغ أقرّ بأن لديه ما يثبت ما ذكره — القرار هنا يستند إلى قوله وحده.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '8px' }}>
          {rows.map((r) => (
            <button
              key={r.id}
              onClick={() => open(r)}
              disabled={opening === r.id}
              style={{
                display: 'flex', alignItems: 'center', gap: '11px', width: '100%',
                background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '11px',
                padding: '12px 15px', cursor: opening === r.id ? 'wait' : 'pointer',
                fontFamily: 'inherit', textAlign: 'right',
              }}>
              <span style={{ fontSize: '16px', flex: 'none' }}>
                {r.mime_type === 'application/pdf' ? '📄' : '🖼️'}
              </span>
              <span style={{ flex: 1, minWidth: 0, fontSize: '13.5px', fontWeight: 700, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.file_name}
              </span>
              <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 700, flex: 'none' }}>
                {size(r.file_size)}
              </span>
              <span style={{ fontSize: '12px', color: '#1D4ED8', fontWeight: 800, flex: 'none' }}>
                {opening === r.id ? '…' : 'فتح'}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
