import { useEffect, useRef, useState } from 'react'
import { getSupabase } from '../lib/api'
import { LIMITS } from '../lib/validate.js'

/**
 * The documents a company must arrive with, collected when it is added.
 *
 * Adding a company to the registry used to ask for one file — the commercial
 * registration — held as a base64 data URL on the company row. Everything else
 * on the documents checklist was requested afterwards, from a company that had
 * no account and no reason to answer. So records sat in the registry
 * permanently incomplete, and the reviewer had nothing to verify them against.
 *
 * The four documents marked required are now collected at the point where
 * somebody is already gathering paperwork about a company they know.
 *
 * ============================================================================
 * One place, named by the company
 * ============================================================================
 * Files go to `company-documents/{company_id}/…`, the same bucket and the same
 * folder shape the phone handoff writes to. A reviewer opening a company sees
 * everything about it in one place regardless of how it got there, and each
 * row records the tenant and the user who submitted it — so «who sent this, and
 * for which company» is answered by the data rather than by asking.
 *
 * The list of required types is read from the database, not written here. It is
 * the same `company_document_types()` the documents page and the phone handoff
 * read; a tenth type added there appears here without anyone remembering to.
 */

const MAX_BYTES = 15 * 1024 * 1024
const ACCEPT = 'application/pdf,image/jpeg,image/png'
const EXT = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' }
const BUCKET = 'company-documents'

/**
 * Send the collected files, once the company exists and has an id.
 *
 * Called after the insert, because the folder is named after the company and
 * there is no company to name it after until then. Each upload is followed by
 * its row, and the row is read back — a storage write that RLS filtered out of
 * the table would otherwise look like a success and leave a file nobody can
 * find.
 *
 * Returns the doc types that did not make it, so the caller can say which.
 */
export async function uploadCompanyDocuments(files, { companyId, tenantId, userId, requestId = null }) {
  const supabase = getSupabase()
  const failed = []

  for (const [docType, file] of Object.entries(files)) {
    if (!file) continue
    try {
      const path = `${companyId}/${docType}-${Date.now()}.${EXT[file.type] || 'bin'}`

      const { error: upErr } = await supabase.storage
        .from(BUCKET).upload(path, file, { contentType: file.type })
      if (upErr) throw upErr

      const { data, error: rowErr } = await supabase
        .from('company_documents')
        .insert([{
          company_id: companyId,
          uploaded_by_tenant_id: tenantId,
          uploaded_by_user_id: userId,
          doc_type: docType,
          file_url: path,
          file_name: file.name,
          status: 'pending',
          // Attached to the request when there is one. A document beside a
          // company is a file somebody has to go and find the meaning of; a
          // document on a request is part of what is being decided.
          request_id: requestId,
        }])
        .select('id')

      if (rowErr) throw rowErr
      if (!data?.length) throw new Error('لم يُحفظ سجل المستند')
    } catch {
      failed.push(docType)
    }
  }

  return failed
}

export default function RequiredCompanyDocuments({ files, onChange, onTypesLoaded, disabled }) {
  const [types, setTypes] = useState([])
  const [error, setError] = useState('')
  const inputs = useRef({})

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data, error: e } = await getSupabase().rpc('company_document_types')
      if (cancelled) return
      if (e) { setError('تعذّر تحميل قائمة المستندات'); return }
      const required = (data || []).filter((t) => t.required)
      setTypes(required)
      // The page validates against the same list it renders. Two copies of
      // «which documents are required» would agree until somebody changed one.
      onTypesLoaded?.(required)
    })()
    return () => { cancelled = true }
  }, [])

  const pick = (docType, file) => {
    if (!file) return
    if (file.size > MAX_BYTES) {
      setError(`${file.name} — ${(file.size / 1024 / 1024).toFixed(1)} م.ب، والحد ١٥`)
      return
    }
    if (!ACCEPT.split(',').includes(file.type)) {
      setError('الصيغ المقبولة: PDF أو PNG أو JPG')
      return
    }
    setError('')
    onChange({ ...files, [docType]: file })
  }

  const remove = (docType) => {
    const next = { ...files }
    delete next[docType]
    onChange(next)
  }

  const done = types.filter((t) => files[t.doc_type]).length

  return (
    <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '14px', padding: '18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '6px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: 900, color: '#0F172A', margin: 0 }}>
          مستندات الشركة
        </h3>
        <span style={{ fontSize: '12.5px', fontWeight: 800, color: done === types.length && types.length ? '#15803D' : '#64748B', flex: 'none' }}>
          {done} من {types.length}
        </span>
      </div>

      <p style={{ fontSize: '12.5px', color: '#64748B', margin: '0 0 14px', lineHeight: 1.9 }}>
        كلها مطلوبة. تُراجعها إدارة مرصد قبل اعتماد الشركة، وتُحفظ باسم الشركة
        ومَن أرسلها.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
        {types.map((t) => {
          const file = files[t.doc_type]
          return (
            <div key={t.doc_type} style={{
              display: 'flex', alignItems: 'center', gap: '10px', padding: '11px 13px',
              background: file ? '#F0FDF4' : '#F8FAFC',
              border: `1px solid ${file ? '#BBF7D0' : '#E2E8F0'}`, borderRadius: '11px',
            }}>
              <span style={{ fontSize: '15px', flex: 'none' }}>{file ? '✅' : '○'}</span>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#0F172A' }}>
                  {t.label}
                </div>
                {file && (
                  <div style={{ fontSize: '12px', color: '#15803D', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {file.name}
                  </div>
                )}
              </div>

              <input maxLength={LIMITS.name}
                ref={(el) => { inputs.current[t.doc_type] = el }}
                type="file"
                accept={ACCEPT}
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  e.target.value = ''
                  pick(t.doc_type, f)
                }}
              />

              <button
                type="button"
                disabled={disabled}
                onClick={() => (file ? remove(t.doc_type) : inputs.current[t.doc_type]?.click())}
                style={{
                  flex: 'none', minHeight: '40px', padding: '0 14px', borderRadius: '9px',
                  fontSize: '13px', fontWeight: 800, fontFamily: 'inherit',
                  cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1,
                  border: file ? '1.5px solid #E2E8F0' : 0,
                  background: file ? '#fff' : '#1E2A52',
                  color: file ? '#64748B' : '#fff',
                }}>
                {file ? 'إزالة' : 'إرفاق'}
              </button>
            </div>
          )
        })}
      </div>

      {error && (
        <div style={{
          marginTop: '12px', background: '#FEF2F2', border: '1px solid #FECACA',
          color: '#B91C1C', borderRadius: '10px', padding: '10px',
          fontSize: '12.5px', fontWeight: 700, lineHeight: 1.8,
        }}>
          {error}
        </div>
      )}
    </div>
  )
}
