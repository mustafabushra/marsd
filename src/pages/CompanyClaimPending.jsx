import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUser } from '@clerk/react'
import { getSupabase } from '../lib/api'

export default function CompanyClaimPending() {
  const navigate = useNavigate()
  const { user } = useUser()
  const [company, setCompany] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const supabase = getSupabase()

        // Get claim request
        const { data: claimData } = await supabase
          .from('claim_requests')
          .select('company_id, status')
          .eq('user_id', user?.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()

        if (!claimData) {
          navigate('/company-onboarding', { replace: true })
          return
        }

        // Get company
        const { data: companyData } = await supabase
          .from('companies')
          .select('*')
          .eq('id', claimData.company_id)
          .single()

        setCompany(companyData)

        // If claim approved, create tenant and redirect to dashboard
        if (claimData.status === 'approved') {
          // Tenant should already be created by admin
          navigate('/dashboard', { replace: true })
        }
      } catch (err) {
        console.error('Error checking claim status:', err)
      } finally {
        setLoading(false)
      }
    }

    if (user?.id) {
      checkStatus()
      // Check every 10 seconds
      const interval = setInterval(checkStatus, 10000)
      return () => clearInterval(interval)
    }
  }, [user?.id, navigate])

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        fontSize: '16px'
      }}>
        جاري التحميل...
      </div>
    )
  }

  return (
    <main
      dir="rtl"
      style={{
        background: 'linear-gradient(135deg, #06B6D4 0%, #0891B2 100%)',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        fontFamily: 'Tajawal, system-ui, sans-serif'
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: '20px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          padding: '50px 40px',
          maxWidth: '500px',
          textAlign: 'center'
        }}
      >
        <div style={{ fontSize: '80px', marginBottom: '20px', animation: 'pulse 2s infinite' }}>
          🔍
        </div>

        <h1 style={{
          fontSize: '28px',
          fontWeight: 900,
          color: '#0F172A',
          margin: '0 0 16px 0'
        }}>
          طلب الملكية قيد المراجعة
        </h1>

        <p style={{
          fontSize: '16px',
          color: '#64748B',
          lineHeight: 1.6,
          margin: '0 0 32px 0'
        }}>
          تم العثور على شركتك في نظام مرصد.
        </p>

        <div style={{
          background: '#ECFDF5',
          border: '1px solid #D1FAE5',
          borderRadius: '12px',
          padding: '20px',
          marginBottom: '32px',
          textAlign: 'right'
        }}>
          <div style={{
            fontSize: '14px',
            color: '#047857',
            fontWeight: 600,
            marginBottom: '12px'
          }}>
            🏢 {company?.name}
          </div>
          <div style={{
            fontSize: '13px',
            color: '#065F46',
            lineHeight: 1.6
          }}>
            طلب ملكيتك قيد المراجعة من قبل فريق مرصد.
            <br />
            سنتحقق من هويتك وسيتم الموافقة عليك قريباً إن شاء الله.
          </div>
        </div>

        <div style={{
          background: '#FFFACD',
          border: '1px solid #FFE82D',
          borderRadius: '12px',
          padding: '12px 16px',
          marginBottom: '24px',
          fontSize: '13px',
          color: '#997404',
          textAlign: 'right'
        }}>
          ⏱️ المراجعة تستغرق عادة 24-48 ساعة
        </div>

        <button
          onClick={() => navigate('/', { replace: true })}
          style={{
            background: '#06B6D4',
            color: '#fff',
            border: 'none',
            borderRadius: '10px',
            padding: '12px 24px',
            fontSize: '15px',
            fontWeight: 800,
            cursor: 'pointer'
          }}
        >
          العودة للرئيسية
        </button>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </main>
  )
}
