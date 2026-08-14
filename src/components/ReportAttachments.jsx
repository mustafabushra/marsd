import { useState } from 'react'
import { getSupabase } from '../lib/api'
import { inspectFile } from '../lib/fileSafety'

/**
 * The evidence behind a report.
 *
 * The declaration a reporter signs before submitting says «وأن لديّ مستندات
 * تثبتها» — and there was nowhere to put them. `report_documents` sat empty with
 * no screen writing to it and no bucket for the files, so the reporter accepted
 * legal responsibility for proof the product would not accept, and the reviewer
 * judged an accusation with the proof out of reach.
 *
 * ============================================================================
 * Who sees these
 * ============================================================================
 * The reporter and Marsad. Never the company being reported. An invoice carries
 * a letterhead and a contract carries signatures, so showing an attachment to
 * the reported company would identify the reporter as surely as printing their
 * name — which migration 107 removed from the timeline for exactly that reason.
 * Enforced in storage and in report_attachments(), not here; this says it out
 * loud so the person uploading knows what they are handing over and to whom.
 *
 * ============================================================================
 * Two phases, because the path needs a report id
 * ============================================================================
 * Files chosen before the report exists are held in memory, and uploaded by
 * `uploadReportFiles` once the insert returns an id. Uploading first to a
 * temporary place and moving them after would leave orphans behind every
 * abandoned draft.
 */

const MAX_BYTES = 10 * 1024 * 1024
const MAX_FILES = 5
const TYPES = {
  'application/pdf': 'PDF',
  'image/jpeg': 'صورة',
  'image/png': 'صورة',
  'image/webp': 'صورة',
}

const BUCKET = 'report-documents'

const size = (n) => (n > 1024 * 1024
  ? `${(n / 1024 / 1024).toFixed(1)} م.ب`
  : `${Math.max(1, Math.round(n / 1024))} ك.ب`)

/** The name as stored: a uuid keeps two files called `invoice.pdf` apart. */
const keyFor = (reportId, file) =>
  `${reportId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-؀-ۿ]+/g, '_')}`

/**
 * Send the chosen files, then record them.
 *
 * Storage first: the row in report_documents points at an object, and a row
 * pointing at nothing is worse than no row — it shows the reviewer a piece of
 * evidence that cannot be opened.
 *
 * Returns what failed rather than throwing. A report that saved should not be
 * lost because its third attachment did not, and the caller says so instead.
 */
export async function uploadReportFiles(reportId, files, userId) {
  const failed = []
  if (!reportId || !files?.length) return failed

  const supabase = getSupabase()
  for (const file of files) {
    const key = keyFor(reportId, file)
    try {
      const { error: upErr } = await supabase.storage.from(BUCKET)
        .upload(key, file, { contentType: file.type, upsert: false })
      if (upErr) throw upErr

      // `.select()` because an insert filtered out by RLS returns no error and
      // no rows, and the file would sit in the bucket attached to nothing.
      const { data, error: rowErr } = await supabase.from('report_documents').insert([{
        report_id: reportId,
        s3_key: key,
        file_name: file.name,
        mime_type: file.type || null,
        file_size: file.size,
        uploaded_by: userId || null,
      }]).select('id')
      if (rowErr) throw rowErr
      if (!data?.length) throw new Error('لم يُسجَّل المرفق')
    } catch (err) {
      console.error('Attachment failed:', file.name, err)
      failed.push(file.name)
    }
  }
  return failed
}

export default function ReportAttachments({ files, onChange, disabled = false }) {
  const [note, setNote] = useState('')

  // async: فحص التوقيع يقرأ أول بايتات الملف، وقراءة الملف غير متزامنة.
  const add = async (chosen) => {
    const next = [...files]
    const rejected = []

    for (const f of chosen) {
      if (next.length >= MAX_FILES) { rejected.push(`${f.name}: تجاوز ${MAX_FILES} ملفات`); continue }
      if (!TYPES[f.type]) { rejected.push(`${f.name}: نوع غير مقبول`); continue }
      // التوقيع الفعلي، لا النوع المُعلَن.
      //
      // `accept` اقتراحٌ لمربّع الاختيار، و allowed_mime_types في الدلو يفحص
      // الترويسة التي يرسلها العميل — كلاهما يقول ما ادّعاه المُرسِل. هذا يقرأ
      // أول بايتات الملف، فيردّ ملفاً تنفيذياً سُمّي .pdf قبل أن يُرفع.
      const verdict = await inspectFile(f, { maxBytes: MAX_BYTES })
      if (!verdict.ok) { rejected.push(`${f.name}: ${verdict.reason}`); continue }
      // Same name and size twice is the same file picked twice.
      if (next.some((x) => x.name === f.name && x.size === f.size)) {
        rejected.push(`${f.name}: مضاف بالفعل`); continue
      }
      next.push(f)
    }

    // Said, not swallowed. A file that silently does not appear reads as a
    // broken control, and the person tries again with the same file.
    setNote(rejected.join(' · '))
    onChange(next)
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '14px', padding: '18px', marginBottom: '16px' }}>
      <div style={{ fontSize: '14.5px', fontWeight: 800, color: '#0F172A', marginBottom: '5px', textAlign: 'right' }}>
        المستندات المُثبِتة
      </div>
      <p style={{ fontSize: '13px', color: '#64748B', margin: '0 0 12px', lineHeight: 1.8, textAlign: 'right' }}>
        عقد، فاتورة، أمر شراء، مراسلة — ما يسند ما ذكرته. حتى {MAX_FILES} ملفات، كل واحد حتى 10 م.ب، بصيغة PDF أو صورة.
        <br />
        <span style={{ color: '#15803D', fontWeight: 700 }}>
          لا تراها الشركة المُبلَّغ عنها — تصل إدارة مرصد وحدها للمراجعة.
        </span>
      </p>

      <label style={{
        display: 'inline-flex', alignItems: 'center', gap: '8px',
        background: disabled ? '#F1F5F9' : '#F8FAFC', border: '1.5px dashed #CBD5E1',
        borderRadius: '10px', padding: '11px 18px', fontSize: '13.5px', fontWeight: 800,
        color: disabled ? '#94A3B8' : '#1E2A52', cursor: disabled ? 'not-allowed' : 'pointer',
      }}>
        📎 اختر ملفات
        <input
          type="file"
          multiple
          disabled={disabled}
          accept={Object.keys(TYPES).join(',')}
          onChange={(e) => { add([...e.target.files]); e.target.value = '' }}
          style={{ display: 'none' }}
        />
      </label>

      {note && (
        <div style={{ marginTop: '10px', fontSize: '12.5px', color: '#B45309', fontWeight: 700, textAlign: 'right' }}>
          ⚠️ {note}
        </div>
      )}

      {files.length > 0 && (
        <div style={{ display: 'grid', gap: '8px', marginTop: '13px' }}>
          {files.map((f, i) => (
            <div key={`${f.name}-${f.size}`} style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              border: '1px solid #E2E8F0', borderRadius: '10px', padding: '10px 13px',
            }}>
              <span style={{ fontSize: '15px' }}>{f.type === 'application/pdf' ? '📄' : '🖼️'}</span>
              <span style={{ flex: 1, minWidth: 0, fontSize: '13.5px', fontWeight: 700, color: '#0F172A', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {f.name}
              </span>
              <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 700, flex: 'none' }}>{size(f.size)}</span>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChange(files.filter((_, j) => j !== i))}
                style={{ background: '#FEE2E2', color: '#B91C1C', border: 0, borderRadius: '7px', padding: '5px 11px', fontSize: '12px', fontWeight: 800, cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'inherit', flex: 'none' }}>
                إزالة
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
