import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUser } from '@clerk/react'
import { getSupabase } from '../lib/api'

export default function AccountPendingApproval() {
  const navigate = useNavigate()
  const { user } = useUser()

  useEffect(() => {
    // Check if account is actually pending
    const checkApprovalStatus = async () => {
      try {
        const supabase = getSupabase()
        const { data: userData } = await supabase
          .from('users')
          .select('tenant_id')
          .eq('id', user?.id)
          .single()

        if (userData?.tenant_id) {
          const { data: tenantData } = await supabase
            .from('tenants')
            .select('approval_status')
            .eq('id', userData.tenant_id)
            .single()

          // If approved, redirect to dashboard
          if (tenantData?.approval_status === 'approved') {
            navigate('/dashboard', { replace: true })
          }
        }
      } catch (err) {
        console.error('Error checking approval status:', err)
      }
    }

    if (user?.id) {
      // Check every 10 seconds if account was approved
      checkApprovalStatus()
      const interval = setInterval(checkApprovalStatus, 10000)
      return () => clearInterval(interval)
    }
  }, [user?.id, navigate])

  return (
    <main
      dir="rtl"
      style={{
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        fontFamily: 'Tajawal, system-ui, sans-serif'
      }}
    >
      {/* Modal Overlay */}
      <div
        style={{
          background: '#fff',
          borderRadius: '20px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          padding: '50px 40px',
          maxWidth: '500px',
          textAlign: 'center',
          animation: 'slideUp 0.5s ease-out'
        }}
      >
        {/* Icon */}
        <div
          style={{
            fontSize: '80px',
            marginBottom: '20px',
            animation: 'pulse 2s infinite'
          }}
        >
          ⏳
        </div>

        {/* Title */}
        <h1
          style={{
            fontSize: '28px',
            fontWeight: 900,
            color: '#0F172A',
            marginBottom: '12px',
            margin: '0 0 12px 0'
          }}
        >
          قيد المراجعة
        </h1>

        {/* Status */}
        <div
          style={{
            fontSize: '16px',
            color: '#64748B',
            marginBottom: '24px',
            lineHeight: '1.6'
          }}
        >
          <p style={{ margin: '0 0 8px 0' }}>
            🔍 تم استقبال بيانات شركتك بنجاح
          </p>
          <p style={{ margin: '0 0 8px 0' }}>
            📋 يتم مراجعة السجل التجاري من قبل فريق مرصد
          </p>
          <p style={{ margin: '0' }}>
            📧 ستتلقى إشعار عند الموافقة على حسابك
          </p>
        </div>

        {/* Badge */}
        <div
          style={{
            background: '#FEF3C7',
            border: '2px solid #FBBF24',
            borderRadius: '12px',
            padding: '16px',
            marginBottom: '32px'
          }}
        >
          <div
            style={{
              fontSize: '14px',
              fontWeight: 700,
              color: '#92400E',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            <span style={{ fontSize: '20px' }}>⚙️</span>
            حسابك قيد المراجعة حالياً
          </div>
        </div>

        {/* Timeline */}
        <div style={{ marginBottom: '32px', textAlign: 'right' }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#334155', marginBottom: '16px' }}>
            خطوات المراجعة:
          </div>
          <div style={{ display: 'flex', gap: '16px', flexDirection: 'column' }}>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: '#ECFDF5',
                  border: '2px solid #16A34A',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '16px',
                  color: '#15803D',
                  fontWeight: 700,
                  flex: 'none'
                }}
              >
                ✓
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A' }}>
                  تم استقبال البيانات
                </div>
                <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                  تم رفع السجل التجاري بنجاح
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: '#FEF3C7',
                  border: '2px solid #FBBF24',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '16px',
                  color: '#92400E',
                  fontWeight: 700,
                  flex: 'none',
                  animation: 'pulse 2s infinite'
                }}
              >
                2
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A' }}>
                  جاري المراجعة
                </div>
                <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                  فريق مرصد يفحص البيانات
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: '#F3F4F6',
                  border: '2px solid #D1D5DB',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '16px',
                  color: '#6B7280',
                  fontWeight: 700,
                  flex: 'none'
                }}
              >
                3
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#6B7280' }}>
                  الموافقة النهائية
                </div>
                <div style={{ fontSize: '12px', color: '#9CA3AF', marginTop: '2px' }}>
                  تفعيل الحساب بالكامل
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Info Box */}
        <div
          style={{
            background: '#EEF2FF',
            border: '1px solid #E0E7FF',
            borderRadius: '12px',
            padding: '16px',
            marginBottom: '24px',
            fontSize: '13px',
            color: '#1E40AF',
            fontWeight: 500,
            lineHeight: '1.6'
          }}
        >
          ℹ️ عادة ما تتم المراجعة في مدة تتراوح بين ساعة إلى 24 ساعة. يمكنك العودة لاحقاً للتحقق من حالة حسابك.
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: '12px', flexDirection: 'column-reverse' }}>
          <button
            onClick={() => navigate('/', { replace: true })}
            style={{
              background: '#E2E8F0',
              color: '#64748B',
              border: 'none',
              borderRadius: '10px',
              padding: '12px 24px',
              fontSize: '14px',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => (e.target.style.background = '#CBD5E1')}
            onMouseLeave={(e) => (e.target.style.background = '#E2E8F0')}
          >
            الرجوع للصفحة الرئيسية
          </button>

          <button
            onClick={() => window.location.reload()}
            style={{
              background: '#16A34A',
              color: '#fff',
              border: 'none',
              borderRadius: '10px',
              padding: '12px 24px',
              fontSize: '14px',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => (e.target.style.background = '#15803D')}
            onMouseLeave={(e) => (e.target.style.background = '#16A34A')}
          >
            🔄 تحديث الحالة
          </button>
        </div>
      </div>

      {/* CSS Animations */}
      <style>{`
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }
      `}</style>
    </main>
  )
}
