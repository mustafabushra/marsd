import { useState, useEffect } from 'react'
import { useUser } from '@clerk/react'
import { getSupabase } from '../lib/api'
import { COMPANY_STATUS } from '../lib/constants'
import { notifyTenant } from '../lib/notify'

/**
 * /admin/company-approval — letting a registered company onto the platform.
 *
 * Approving and rejecting both wrote a notification naming tenant_id and
 * omitting user_id, which is NOT NULL, so the insert always failed. The failure
 * was caught and logged as "non-blocking", which is true of the write and false
 * of the consequence: no company has ever been told it was approved or rejected.
 * The payload was JSON.stringify'd into a jsonb column too, so payload.message
 * would have been undefined even had the row landed.
 *
 * The audit entry recorded supabase.auth.getUser() as the actor. Identity here
 * is Clerk; that call returns nothing, so every approval in the log is
 * attributed to no one.
 *
 * And the status update was not read back. A row RLS filters out of an UPDATE
 * returns no error and no rows, so the screen removed the company from the list
 * and said "تمت الموافقة" whether or not anything had been written.
 */

export default function AdminCompanyApproval() {
  const { user } = useUser()
  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedCompany, setSelectedCompany] = useState(null)
  const [rejectionReason, setRejectionReason] = useState('')
  const [processingId, setProcessingId] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchPendingCompanies()
  }, [])

  const fetchPendingCompanies = async () => {
    setLoading(true)
    try {
      const supabase = getSupabase()
      // Query companies with status='pending' (SOURCE OF TRUTH)
      const { data, error: fetchError } = await supabase
        .from('companies')
        .select('id, cr_number, name, cr_file_url, status, created_at, sector, city')
        .eq('status', COMPANY_STATUS.PENDING)
        .order('created_at', { ascending: false })

      if (fetchError) throw fetchError

      // Enrich with tenant info (email, phone)
      const companiesWithTenant = await Promise.all((data || []).map(async (company) => {
        try {
          const { data: tenantData, error: tenantError } = await supabase
            .from('tenants')
            .select('id, email, phone')
            .eq('company_id', company.id)
            .single()

          if (tenantError) {
            console.warn(`⚠️ Tenant not found for company ${company.id}:`, tenantError.message)
            return {
              ...company,
              tenant_id: null,
              email: '',
              phone: ''
            }
          }

          return {
            ...company,
            tenant_id: tenantData?.id || null,
            email: tenantData?.email || '',
            phone: tenantData?.phone || ''
          }
        } catch (err) {
          console.warn(`⚠️ Error fetching tenant for company ${company.id}:`, err.message)
          return {
            ...company,
            tenant_id: null,
            email: '',
            phone: ''
          }
        }
      }))

      setCompanies(companiesWithTenant)
    } catch (err) {
      setError(err.message || 'فشل تحميل قائمة الشركات')
    } finally {
      setLoading(false)
    }
  }

  const handleApprove = async (companyId, crNumber) => {
    if (processingId) return
    setProcessingId(companyId)
    setError('')

    try {
      const supabase = getSupabase()
      const company = companies.find(c => c.id === companyId)

      // Update company status in companies table (SOURCE OF TRUTH)
      const { data: updated, error: updateError } = await supabase
        .from('companies')
        .update({
          status: COMPANY_STATUS.APPROVED,
          updated_at: new Date().toISOString()
        })
        .eq('id', companyId)
        .select('id, status')

      if (updateError) throw updateError
      // No error is not evidence: an UPDATE that RLS filters out matches nothing
      // and reports nothing. The row count is the only proof it happened.
      if (!updated?.length) throw new Error('لم تُحفظ الموافقة — تحقّق من صلاحيتك')

      // Log the action (non-blocking)
      try {
        const { error: auditError } = await supabase
          .from('audit_logs')
          .insert([{
            actor_id: user?.id,
            action: 'company_approved',
            entity: 'company',
            entity_id: companyId,
            meta: JSON.stringify({
              status: 'approved',
              cr_number: crNumber
            })
          }])

        if (auditError) {
          console.warn('⚠️ Audit log warning (non-blocking):', auditError.message)
        }
      } catch (auditErr) {
        console.warn('⚠️ Audit log error (non-blocking):', auditErr.message)
      }

      // notifyTenant writes what the table accepts, addresses every member of
      // the company, and reads its own error.
      if (company?.tenant_id) {
        await notifyTenant(company.tenant_id, 'company_approved', {
          title: 'تمت الموافقة على تسجيل شركتك',
          message: 'يمكنك الآن استخدام مرصد بالكامل.',
          meta: { cr_number: crNumber, company_id: companyId },
        })
      }

      // Remove from list and show success
      setCompanies(companies.filter(c => c.id !== companyId))
      setSelectedCompany(null)
      alert(`✅ تمت الموافقة على: ${company?.name}\n(السجل: ${crNumber})`)
    } catch (err) {
      setError(err.message || 'فشل الموافقة على الشركة')
    } finally {
      setProcessingId(null)
    }
  }

  const handleReject = async (companyId, crNumber) => {
    if (!rejectionReason.trim()) {
      setError('يجب إدخال سبب الرفض')
      return
    }

    if (processingId) return
    setProcessingId(companyId)
    setError('')

    try {
      const supabase = getSupabase()
      const company = companies.find(c => c.id === companyId)

      // Update company status in companies table (SOURCE OF TRUTH)
      const { data: updated, error: updateError } = await supabase
        .from('companies')
        .update({
          status: COMPANY_STATUS.REJECTED,
          updated_at: new Date().toISOString()
        })
        .eq('id', companyId)
        .select('id, status')

      if (updateError) throw updateError
      if (!updated?.length) throw new Error('لم يُحفظ الرفض — تحقّق من صلاحيتك')

      // Log the action (non-blocking)
      try {
        const { error: auditError } = await supabase
          .from('audit_logs')
          .insert([{
            actor_id: user?.id,
            action: 'company_rejected',
            entity: 'company',
            entity_id: companyId,
            meta: JSON.stringify({
              reason: rejectionReason,
              cr_number: crNumber
            })
          }])

        if (auditError) {
          console.warn('⚠️ Audit log warning (non-blocking):', auditError.message)
        }
      } catch (auditErr) {
        console.warn('⚠️ Audit log error (non-blocking):', auditErr.message)
      }

      if (company?.tenant_id) {
        await notifyTenant(company.tenant_id, 'company_rejected', {
          title: 'لم يُقبل تسجيل شركتك',
          message: rejectionReason.trim(),
          meta: { cr_number: crNumber, company_id: companyId },
        })
      }

      // Remove from list and show success
      setCompanies(companies.filter(c => c.id !== companyId))
      setSelectedCompany(null)
      setRejectionReason('')
      alert(`❌ تم رفض: ${company?.name}\n(السجل: ${crNumber})`)
    } catch (err) {
      setError(err.message || 'فشل رفض الشركة')
    } finally {
      setProcessingId(null)
    }
  }

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ fontSize: '20px' }}>جاري التحميل...</div>
      </div>
    )
  }

  return (
    <main style={{ padding: '40px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '28px', fontWeight: 800, marginBottom: '24px', textAlign: 'right' }}>
        مراجعة تسجيل الشركات
      </h1>

      {error && (
        <div style={{
          background: '#FEE2E2',
          border: '1px solid #FECACA',
          borderRadius: '8px',
          padding: '12px',
          marginBottom: '20px',
          color: '#DC2626'
        }}>
          ⚠️ {error}
        </div>
      )}

      {companies.length === 0 ? (
        <div style={{
          background: '#F0FDF4',
          border: '1px solid #BBFBBB',
          borderRadius: '8px',
          padding: '24px',
          textAlign: 'center',
          color: '#15803D'
        }}>
          ✅ لا توجد شركات في الانتظار
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
          {/* List */}
          <div>
            <h2 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '16px', textAlign: 'right' }}>
              الشركات المعلقة ({companies.length})
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {companies.map(company => (
                <div
                  key={company.id}
                  onClick={() => setSelectedCompany(company)}
                  style={{
                    padding: '16px',
                    background: selectedCompany?.id === company.id ? '#EEF2FF' : '#F8FAFC',
                    border: selectedCompany?.id === company.id ? '2px solid #4F46E5' : '1px solid #E2E8F0',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    textAlign: 'right'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '15px', fontWeight: 600, color: '#0F172A' }}>
                        {company.name}
                      </div>
                      <div style={{ fontSize: '13px', color: '#64748B', marginTop: '4px' }}>
                        {company.email}
                      </div>
                    </div>
                    <div
                      style={{
                        background: '#EEF2FF',
                        color: '#3730A3',
                        padding: '6px 10px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 700,
                        whiteSpace: 'nowrap'
                      }}
                      title="رقم السجل التجاري - المرجع الأساسي"
                    >
                      {company.cr_number}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Details & Actions */}
          {selectedCompany && (
            <div style={{
              background: '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderRadius: '12px',
              padding: '24px',
              textAlign: 'right'
            }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '16px' }}>
                تفاصيل الشركة
              </h3>

              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#64748B', marginBottom: '6px' }}>
                  الاسم
                </div>
                <div style={{ fontSize: '15px', color: '#0F172A' }}>
                  {selectedCompany.name}
                </div>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#64748B', marginBottom: '6px' }}>
                  البريد الإلكتروني
                </div>
                <div style={{ fontSize: '15px', color: '#0F172A', direction: 'ltr' }}>
                  {selectedCompany.email}
                </div>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#64748B', marginBottom: '6px' }}>
                  رقم السجل التجاري
                </div>
                <div style={{ fontSize: '15px', color: '#0F172A' }}>
                  {selectedCompany.cr_number}
                </div>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#64748B', marginBottom: '6px' }}>
                  القطاع
                </div>
                <div style={{ fontSize: '15px', color: '#0F172A' }}>
                  {selectedCompany.sector || 'لم يتم التحديد'}
                </div>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#64748B', marginBottom: '6px' }}>
                  المدينة
                </div>
                <div style={{ fontSize: '15px', color: '#0F172A' }}>
                  {selectedCompany.city || 'لم يتم التحديد'}
                </div>
              </div>

              {selectedCompany.cr_file_url && (
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#64748B', marginBottom: '6px' }}>
                    السجل التجاري (المرفق)
                  </div>
                  {selectedCompany.cr_file_url.startsWith('data:') ? (
                    // Base64 embedded file
                    <a
                      href={selectedCompany.cr_file_url}
                      download="cr-document"
                      style={{
                        fontSize: '13px',
                        color: '#4F46E5',
                        textDecoration: 'underline',
                        cursor: 'pointer'
                      }}
                    >
                      📥 تحميل الملف
                    </a>
                  ) : (
                    // Storage URL
                    <a
                      href={selectedCompany.cr_file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontSize: '13px',
                        color: '#4F46E5',
                        textDecoration: 'underline',
                        cursor: 'pointer'
                      }}
                    >
                      📄 عرض الملف
                    </a>
                  )}
                </div>
              )}

              {/* Rejection Reason */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#64748B',
                  display: 'block',
                  marginBottom: '6px'
                }}>
                  سبب الرفض (إذا كان متعلقاً):
                </label>
                <textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="أدخل سبب الرفض (يصل للشركة في الإشعار)..."
                  style={{
                    width: '100%',
                    border: '1.5px solid #E2E8F0',
                    borderRadius: '8px',
                    padding: '10px',
                    fontSize: '14px',
                    fontFamily: 'inherit',
                    outline: 'none',
                    boxSizing: 'border-box',
                    minHeight: '80px',
                    resize: 'vertical'
                  }}
                />
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  onClick={() => handleApprove(selectedCompany.id, selectedCompany.cr_number)}
                  disabled={processingId === selectedCompany.id}
                  style={{
                    flex: 1,
                    background: processingId === selectedCompany.id ? '#CCCCCC' : '#16A34A',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '10px',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: processingId === selectedCompany.id ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s'
                  }}
                  title={`الموافقة على السجل: ${selectedCompany.cr_number}`}
                >
                  {processingId === selectedCompany.id ? '⏳' : '✅'} الموافقة
                </button>

                <button
                  onClick={() => handleReject(selectedCompany.id, selectedCompany.cr_number)}
                  disabled={processingId === selectedCompany.id}
                  style={{
                    flex: 1,
                    background: processingId === selectedCompany.id ? '#CCCCCC' : '#DC2626',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '10px',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: processingId === selectedCompany.id ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s'
                  }}
                  title={`رفض السجل: ${selectedCompany.cr_number}`}
                >
                  {processingId === selectedCompany.id ? '⏳' : '❌'} الرفض
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  )
}
