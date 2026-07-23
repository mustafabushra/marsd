import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, Send } from 'lucide-react'
import { getSupabase } from '../lib/api'

export default function AddReport() {
  const navigate = useNavigate()
  const [formData, setFormData] = useState({
    companyId: '',
    type: 'delayed-payment',
    description: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
  })
  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [companiesLoading, setCompaniesLoading] = useState(true)

  const reportTypes = [
    { value: 'delayed-payment', label: '💳 دفع متأخر' },
    { value: 'non-compliance', label: '⚠️ عدم التزام' },
    { value: 'excellent', label: '⭐ ممتاز' },
    { value: 'issues', label: '⚔️ قضايا' },
  ]

  useEffect(() => {
    fetchCompanies()
  }, [])

  const fetchCompanies = async () => {
    try {
      // Use Knowledge Base for approved companies list
      const { searchCompaniesKnowledgeBase } = await import('../lib/api')
      const response = await searchCompaniesKnowledgeBase('', { status: 'approved' }, 1, 1000)

      const formatted = response.data?.map(c => ({
        id: c.id,
        name: c.name,
        sector: c.sector
      })) || []

      setCompanies(formatted)
    } catch (err) {
      console.error('Failed to fetch companies:', err)
    } finally {
      setCompaniesLoading(false)
    }
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    // Validation
    if (!formData.companyId.trim()) {
      setError('اختر شركة')
      setLoading(false)
      return
    }
    if (formData.description.length < 20) {
      setError('وصف التقرير يجب أن يكون 20 حرف على الأقل (BR-07)')
      setLoading(false)
      return
    }
    if (!formData.date) {
      setError('حدد التاريخ')
      setLoading(false)
      return
    }

    try {
      const supabase = getSupabase()
      const { data: user } = await supabase.auth.getUser()
      if (!user.user) throw new Error('Unauthorized')

      // Get user's tenant
      const { data: userData } = await supabase
        .from('users')
        .select('tenant_id')
        .eq('id', user.user.id)
        .single()

      if (!userData?.tenant_id) throw new Error('Tenant not found')

      // BR-05: Check for duplicate reports in last 90 days
      const ninetyDaysAgo = new Date()
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

      const { data: existingReport } = await supabase
        .from('reports')
        .select('id')
        .eq('reporter_tenant_id', userData.tenant_id)
        .eq('target_company_id', formData.companyId)
        .gte('created_at', ninetyDaysAgo.toISOString())
        .limit(1)

      if (existingReport && existingReport.length > 0) {
        throw new Error('❌ لا يمكن إرسال تقرير لنفس الشركة مرتين خلال 90 يوم (BR-05)')
      }

      // Submit report
      const { data: reportData, error: submitError } = await supabase
        .from('reports')
        .insert([{
          reporter_tenant_id: userData.tenant_id,
          target_company_id: formData.companyId,
          type: formData.type,
          description: formData.description,
          deal_amount_range: formData.amount ? `SAR ${formData.amount}` : null,
          dealt_at: new Date(formData.date).toISOString(),
          status: 'pending_review',
          submitted_at: new Date().toISOString()
        }])
        .select()
        .single()

      if (submitError) throw submitError

      // Deduct 1 credit (will be refunded if rejected)
      await supabase
        .from('credits_ledger')
        .insert([{
          tenant_id: userData.tenant_id,
          report_id: reportData.id,
          amount: -1,
          reason: 'report_submitted',
          created_at: new Date().toISOString()
        }])
        .catch(err => console.warn('Credit deduction warning:', err))

      // Audit log
      await supabase
        .from('audit_logs')
        .insert([{
          tenant_id: userData.tenant_id,
          actor_id: user.user.id,
          action: 'report_submitted',
          entity: 'report',
          entity_id: reportData.id,
          meta: JSON.stringify({ company_id: formData.companyId, type: formData.type }),
          created_at: new Date().toISOString()
        }])
        .catch(err => console.warn('Audit log warning:', err))

      setSuccess(true)
      setTimeout(() => navigate('/my-reports'), 2000)
    } catch (err) {
      setError(err.message || 'فشل الإرسال')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <main style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'linear-gradient(135deg, #F8FAFC 0%, #F1F5F9 100%)', padding: '20px' }}>
        <style>{`
          @keyframes successBounce {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.1); }
          }
        `}</style>
        <div style={{ background: '#fff', border: 'none', borderRadius: '20px', padding: '48px', textAlign: 'center', maxWidth: '420px', boxShadow: '0 12px 32px rgba(0,0,0,0.12)' }}>
          <div style={{ fontSize: '64px', marginBottom: '20px', animation: 'successBounce 0.6s ease-out' }}>✅</div>
          <h2 style={{ fontSize: '24px', fontWeight: 900, color: '#0F172A', marginBottom: '12px' }}>تم إرسال التقرير!</h2>
          <p style={{ fontSize: '14px', color: '#64748B', marginBottom: '24px', lineHeight: '1.6' }}>شكراً لمساهمتك في بناء مجتمع آمن. سيتم مراجعة تقريرك من قبل فريقنا قريباً.</p>
          <button
            onClick={() => navigate('/my-reports')}
            style={{
              background: 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)',
              color: '#fff',
              border: '0',
              borderRadius: '12px',
              padding: '14px 24px',
              fontSize: '14px',
              fontWeight: 700,
              cursor: 'pointer',
              width: '100%',
              transition: 'all 0.3s ease',
              boxShadow: '0 4px 12px rgba(22, 163, 74, 0.25)'
            }}
            onMouseEnter={(e) => {
              e.target.style.transform = 'translateY(-2px)'
              e.target.style.boxShadow = '0 6px 16px rgba(22, 163, 74, 0.35)'
            }}
            onMouseLeave={(e) => {
              e.target.style.transform = 'translateY(0)'
              e.target.style.boxShadow = '0 4px 12px rgba(22, 163, 74, 0.25)'
            }}>
            📋 عرض تقاريري
          </button>
        </div>
      </main>
    )
  }

  return (
    <main style={{ background: 'linear-gradient(135deg, #F8FAFC 0%, #F1F5F9 100%)', minHeight: '100vh', padding: '32px 28px' }}>
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
      <div style={{ maxWidth: '700px', margin: '0 auto', animation: 'fadeIn 0.5s ease-out' }}>
        <h1 style={{ fontSize: '32px', fontWeight: 900, color: '#0F172A', margin: '0 0 12px 0', textAlign: 'right', letterSpacing: '-0.5px' }}>
          📋 إرسال تقرير جديد
        </h1>
        <p style={{ fontSize: '14px', color: '#64748B', margin: '0 0 28px 0', textAlign: 'right', lineHeight: '1.6' }}>
          شارك معنا تجربتك مع الشركات لمساعدة المجتمع على اتخاذ قرارات أفضل
        </p>

        {error && (
          <div style={{ background: 'linear-gradient(135deg, #FEE2E2 0%, #FECACA 100%)', border: 'none', borderRadius: '12px', padding: '16px 18px', marginBottom: '24px', fontSize: '14px', color: '#DC2626', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '10px', boxShadow: '0 2px 8px rgba(220, 38, 38, 0.1)' }}>
            <AlertCircle size={18} />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ background: '#fff', border: 'none', borderRadius: '20px', padding: '32px', boxShadow: '0 8px 32px rgba(0,0,0,0.08)' }}>
          {/* Company Selection */}
          <div style={{ marginBottom: '28px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 700, color: '#0F172A', marginBottom: '10px', textAlign: 'right' }}>🏢 اختر الشركة</label>
            <select
              name="companyId"
              value={formData.companyId}
              onChange={handleChange}
              disabled={companiesLoading}
              style={{
                width: '100%',
                border: '2px solid #E2E8F0',
                borderRadius: '12px',
                padding: '13px 16px',
                fontSize: '14px',
                textAlign: 'right',
                outline: 'none',
                background: '#F8FAFC',
                transition: 'all 0.3s ease',
                cursor: companiesLoading ? 'not-allowed' : 'pointer',
                fontWeight: '500'
              }}
              onFocus={(e) => e.target.style.borderColor = '#16A34A'}
              onBlur={(e) => e.target.style.borderColor = '#E2E8F0'}
            >
              <option value="">{companiesLoading ? 'جاري التحميل...' : '-- اختر شركة --'}</option>
              {companies.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Report Type */}
          <div style={{ marginBottom: '28px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 700, color: '#0F172A', marginBottom: '12px', textAlign: 'right' }}>📊 نوع التقرير</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
              {reportTypes.map(rt => (
                <label key={rt.value} style={{
                  display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 12px',
                  border: formData.type === rt.value ? '2px solid #16A34A' : '2px solid #E2E8F0',
                  borderRadius: '12px', cursor: 'pointer',
                  background: formData.type === rt.value ? 'linear-gradient(135deg, #F0FDF4 0%, #E8F9EE 100%)' : '#F8FAFC',
                  transition: 'all 0.3s ease'
                }}>
                  <input
                    type="radio"
                    name="type"
                    value={rt.value}
                    checked={formData.type === rt.value}
                    onChange={handleChange}
                    style={{ cursor: 'pointer' }}
                  />
                  {rt.label}
                </label>
              ))}
            </div>
          </div>

          {/* Date */}
          <div style={{ marginBottom: '28px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 700, color: '#0F172A', marginBottom: '10px', textAlign: 'right' }}>📅 التاريخ</label>
            <input
              type="date"
              name="date"
              value={formData.date}
              onChange={handleChange}
              style={{
                width: '100%', border: '2px solid #E2E8F0', borderRadius: '12px', padding: '13px 16px',
                fontSize: '14px', outline: 'none', background: '#F8FAFC', transition: 'all 0.3s ease', fontWeight: '500'
              }}
              onFocus={(e) => e.target.style.borderColor = '#16A34A'}
              onBlur={(e) => e.target.style.borderColor = '#E2E8F0'}
            />
          </div>

          {/* Amount (optional) */}
          <div style={{ marginBottom: '28px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 700, color: '#0F172A', marginBottom: '10px', textAlign: 'right' }}>💰 المبلغ (اختياري)</label>
            <input
              type="number"
              name="amount"
              placeholder="0.00 ريال"
              value={formData.amount}
              onChange={handleChange}
              style={{
                width: '100%', border: '2px solid #E2E8F0', borderRadius: '12px', padding: '13px 16px',
                fontSize: '14px', textAlign: 'right', outline: 'none', background: '#F8FAFC',
                transition: 'all 0.3s ease', fontWeight: '500'
              }}
              onFocus={(e) => e.target.style.borderColor = '#16A34A'}
              onBlur={(e) => e.target.style.borderColor = '#E2E8F0'}
            />
          </div>

          {/* Description */}
          <div style={{ marginBottom: '28px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 700, color: '#0F172A', marginBottom: '10px', textAlign: 'right' }}>📝 تفاصيل التقرير</label>
            <textarea
              name="description"
              placeholder="اكتب التفاصيل والملاحظات هنا... (20 حرف بالحد الأدنى)"
              value={formData.description}
              onChange={handleChange}
              rows="5"
              style={{
                width: '100%', border: '2px solid #E2E8F0', borderRadius: '12px', padding: '13px 16px',
                fontSize: '14px', textAlign: 'right', outline: 'none', fontFamily: 'inherit',
                resize: 'none', background: '#F8FAFC', transition: 'all 0.3s ease', fontWeight: '500'
              }}
              onFocus={(e) => e.target.style.borderColor = '#16A34A'}
              onBlur={(e) => e.target.style.borderColor = '#E2E8F0'}
            />
            <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '6px', textAlign: 'right' }}>
              {formData.description.length}/500 حرف
            </div>
          </div>

          {/* Submit Button */}
          <div style={{ display: 'flex', gap: '14px', justifyContent: 'flex-start', flexDirection: 'row-reverse' }}>
            <button
              type="submit"
              disabled={loading}
              style={{
                background: loading ? '#D1D5DB' : 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)',
                color: '#fff',
                border: '0',
                borderRadius: '12px',
                padding: '14px 28px',
                fontSize: '14px',
                fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.3s ease',
                boxShadow: loading ? 'none' : '0 4px 12px rgba(22, 163, 74, 0.25)'
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  e.target.style.transform = 'translateY(-2px)'
                  e.target.style.boxShadow = '0 6px 16px rgba(22, 163, 74, 0.35)'
                }
              }}
              onMouseLeave={(e) => {
                if (!loading) {
                  e.target.style.transform = 'translateY(0)'
                  e.target.style.boxShadow = '0 4px 12px rgba(22, 163, 74, 0.25)'
                }
              }}>
              <Send size={16} />
              {loading ? '⏳ جاري الإرسال...' : '✉️ إرسال التقرير'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/search')}
              style={{
                background: '#EEF2FF',
                color: '#1E2A52',
                border: '0',
                borderRadius: '12px',
                padding: '14px 28px',
                fontSize: '14px',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.3s ease'
              }}
              onMouseEnter={(e) => {
                e.target.style.background = '#E0E7FF'
                e.target.style.transform = 'translateY(-2px)'
              }}
              onMouseLeave={(e) => {
                e.target.style.background = '#EEF2FF'
                e.target.style.transform = 'translateY(0)'
              }}>
              ← إلغاء
            </button>
          </div>

          {/* Info */}
          <div style={{
            background: 'linear-gradient(135deg, #F0F4FF 0%, #EEF2FF 100%)',
            border: '2px solid #E0E7FF',
            borderRadius: '12px',
            padding: '16px 18px',
            marginTop: '28px',
            fontSize: '13px',
            color: '#1E40AF',
            fontWeight: '600',
            lineHeight: '1.6',
            display: 'flex',
            gap: '10px',
            alignItems: 'flex-start'
          }}>
            <span>ℹ️</span>
            <span>تقريرك سيساعد المجتمع على اتخاذ قرارات آمنة وموثوقة. شكراً لمساهمتك في بناء مجتمع آمن!</span>
          </div>
        </form>
      </div>
    </main>
  )
}
