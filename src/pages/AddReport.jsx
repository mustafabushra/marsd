import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, Send } from 'lucide-react'

export default function AddReport() {
  const navigate = useNavigate()
  const [formData, setFormData] = useState({
    company: '',
    type: 'delayed-payment',
    description: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const companies = [
    'الراجحي للمقاولات',
    'البناء الحديث',
    'الصناعات المتقدمة',
    'النقل السريع',
    'الخدمات اللوجستية',
    'الاتصالات العالمية',
    'الطاقة والموارد',
    'التسويق الرقمي'
  ]

  const reportTypes = [
    { value: 'delayed-payment', label: '💳 دفع متأخر' },
    { value: 'non-compliance', label: '⚠️ عدم التزام' },
    { value: 'excellent', label: '⭐ ممتاز' },
    { value: 'issues', label: '⚔️ قضايا' },
  ]

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    // Validation
    if (!formData.company.trim()) {
      setError('اختر شركة')
      setLoading(false)
      return
    }
    if (!formData.description.trim()) {
      setError('أضف وصف التقرير')
      setLoading(false)
      return
    }

    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000))

      setSuccess(true)
      setFormData({
        company: '',
        type: 'delayed-payment',
        description: '',
        amount: '',
        date: new Date().toISOString().split('T')[0],
      })

      setTimeout(() => {
        navigate('/my-reports')
      }, 2000)
    } catch (err) {
      setError('فشل الإرسال: ' + (err.message || 'حاول مرة أخرى'))
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <main style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#F8FAFC', padding: '20px' }}>
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '40px', textAlign: 'center', maxWidth: '400px' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>✅</div>
          <h2 style={{ fontSize: '20px', fontWeight: 900, color: '#0F172A', marginBottom: '8px' }}>تم إرسال التقرير!</h2>
          <p style={{ fontSize: '14px', color: '#64748B', marginBottom: '20px' }}>سيتم مراجعة تقريرك من قبل الفريق قريباً</p>
          <button
            onClick={() => navigate('/my-reports')}
            style={{ background: '#16A34A', color: '#fff', border: 0, borderRadius: '8px', padding: '12px 24px', fontSize: '14px', fontWeight: 700, cursor: 'pointer', width: '100%' }}
          >
            الذهاب لتقاريري
          </button>
        </div>
      </main>
    )
  }

  return (
    <main style={{ background: '#F8FAFC', minHeight: '100vh', padding: '22px 28px' }}>
      <div style={{ maxWidth: '700px', margin: '0 auto' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 900, color: '#0F172A', margin: '0 0 8px 0', textAlign: 'right' }}>إرسال تقرير جديد</h1>
        <p style={{ fontSize: '14px', color: '#64748B', margin: '0 0 24px 0', textAlign: 'right' }}>شارك معنا تجربتك مع الشركات لمساعدة المجتمع</p>

        {error && (
          <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: '12px', padding: '14px 16px', marginBottom: '20px', fontSize: '14px', color: '#DC2626', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertCircle size={18} />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '28px' }}>
          {/* Company Selection */}
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 700, color: '#0F172A', marginBottom: '8px', textAlign: 'right' }}>اختر الشركة</label>
            <select
              name="company"
              value={formData.company}
              onChange={handleChange}
              style={{ width: '100%', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '12px', fontSize: '14px', textAlign: 'right', outline: 'none' }}
            >
              <option value="">-- اختر شركة --</option>
              {companies.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Report Type */}
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 700, color: '#0F172A', marginBottom: '8px', textAlign: 'right' }}>نوع التقرير</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
              {reportTypes.map(rt => (
                <label key={rt.value} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', border: formData.type === rt.value ? '2px solid #16A34A' : '1px solid #E2E8F0', borderRadius: '8px', cursor: 'pointer', background: formData.type === rt.value ? '#F0FDF4' : '#fff' }}>
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
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 700, color: '#0F172A', marginBottom: '8px', textAlign: 'right' }}>التاريخ</label>
            <input
              type="date"
              name="date"
              value={formData.date}
              onChange={handleChange}
              style={{ width: '100%', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '12px', fontSize: '14px', outline: 'none' }}
            />
          </div>

          {/* Amount (optional) */}
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 700, color: '#0F172A', marginBottom: '8px', textAlign: 'right' }}>المبلغ (اختياري)</label>
            <input
              type="number"
              name="amount"
              placeholder="0.00 ريال"
              value={formData.amount}
              onChange={handleChange}
              style={{ width: '100%', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '12px', fontSize: '14px', textAlign: 'right', outline: 'none' }}
            />
          </div>

          {/* Description */}
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 700, color: '#0F172A', marginBottom: '8px', textAlign: 'right' }}>تفاصيل التقرير</label>
            <textarea
              name="description"
              placeholder="اكتب التفاصيل هنا..."
              value={formData.description}
              onChange={handleChange}
              rows="4"
              style={{ width: '100%', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '12px', fontSize: '14px', textAlign: 'right', outline: 'none', fontFamily: 'inherit', resize: 'none' }}
            />
          </div>

          {/* Submit Button */}
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-start', flexDirection: 'row-reverse' }}>
            <button
              type="submit"
              disabled={loading}
              style={{
                background: loading ? '#D1D5DB' : '#16A34A',
                color: '#fff',
                border: 0,
                borderRadius: '8px',
                padding: '12px 24px',
                fontSize: '14px',
                fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                opacity: loading ? 0.6 : 1
              }}
            >
              <Send size={16} />
              {loading ? 'جاري الإرسال...' : 'إرسال التقرير'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/search')}
              style={{
                background: '#E2E8F0',
                color: '#64748B',
                border: 0,
                borderRadius: '8px',
                padding: '12px 24px',
                fontSize: '14px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              إلغاء
            </button>
          </div>

          {/* Info */}
          <div style={{ background: '#F0F4FF', border: '1px solid #E0E7FF', borderRadius: '8px', padding: '12px 14px', marginTop: '24px', fontSize: '13px', color: '#1E40AF', fontWeight: 600 }}>
            ℹ️ تقريرك سيساعد المجتمع على اتخاذ قرارات أفضل. شكراً لتعاونك!
          </div>
        </form>
      </div>
    </main>
  )
}
