import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function ForgotPassword() {
  const navigate = useNavigate()
  const [step, setStep] = useState('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleSendCode = async () => {
    if (!email) {
      setError('الرجاء إدخال عنوان بريدك الإلكتروني')
      return
    }
    if (!email.includes('@')) {
      setError('البريد الإلكتروني غير صحيح')
      return
    }
    setError('')
    setIsLoading(true)
    try {
      await new Promise(resolve => setTimeout(resolve, 1000))
      setSuccess('تم إرسال رمز التحقق إلى بريدك الإلكتروني')
      setTimeout(() => {
        setStep('code')
        setSuccess('')
      }, 1500)
    } catch (err) {
      setError('حدث خطأ. حاول لاحقاً')
    } finally {
      setIsLoading(false)
    }
  }

  const handleVerifyCode = async () => {
    if (!code) {
      setError('الرجاء إدخال الرمز')
      return
    }
    if (code.length !== 6) {
      setError('الرمز يجب أن يكون 6 أرقام')
      return
    }
    setError('')
    setIsLoading(true)
    try {
      await new Promise(resolve => setTimeout(resolve, 1000))
      setSuccess('تم التحقق من الرمز بنجاح')
      setTimeout(() => {
        setStep('password')
        setSuccess('')
      }, 1500)
    } catch (err) {
      setError('رمز غير صحيح')
    } finally {
      setIsLoading(false)
    }
  }

  const handleResetPassword = async () => {
    if (!newPassword) {
      setError('الرجاء إدخال كلمة المرور الجديدة')
      return
    }
    if (newPassword.length < 8) {
      setError('كلمة المرور يجب أن تكون 8 أحرف على الأقل')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('كلمات المرور غير متطابقة')
      return
    }
    setError('')
    setIsLoading(true)
    try {
      await new Promise(resolve => setTimeout(resolve, 1000))
      setSuccess('تم تحديث كلمة المرور بنجاح')
      setTimeout(() => {
        navigate('/login')
      }, 1500)
    } catch (err) {
      setError('فشل تحديث كلمة المرور')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #F8FAFC 0%, #E0F2FE 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      fontFamily: 'Tajawal, sans-serif',
    }}>
      <div style={{
        background: '#fff',
        borderRadius: '16px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.12)',
        padding: '40px',
        maxWidth: '420px',
        width: '100%',
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: 900, color: '#1E2A52', margin: '0 0 8px 0' }}>
            استعادة كلمة المرور
          </h1>
          <p style={{ fontSize: '14px', color: '#64748B', margin: 0 }}>
            أدخل بيانات حسابك للتحقق
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div style={{
            background: '#FEE2E2',
            border: '1px solid #FECACA',
            borderRadius: '8px',
            padding: '12px 16px',
            marginBottom: '16px',
            color: '#DC2626',
            fontSize: '14px',
            textAlign: 'right',
          }}>
            {error}
          </div>
        )}

        {/* Success Message */}
        {success && (
          <div style={{
            background: '#DCFCE7',
            border: '1px solid #86EFAC',
            borderRadius: '8px',
            padding: '12px 16px',
            marginBottom: '16px',
            color: '#15803D',
            fontSize: '14px',
            textAlign: 'right',
          }}>
            {success}
          </div>
        )}

        {/* Step 1: Email */}
        {step === 'email' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: 600,
                color: '#1E2A52',
                marginBottom: '8px',
                textAlign: 'right',
              }}>
                عنوان البريد الإلكتروني
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  border: '1.5px solid #E2E8F0',
                  borderRadius: '10px',
                  fontSize: '14px',
                  fontFamily: 'Tajawal',
                  textAlign: 'right',
                  boxSizing: 'border-box',
                  transition: 'all 0.2s',
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = '#16A34A'
                  e.target.style.boxShadow = '0 0 0 3px rgba(22, 163, 74, 0.1)'
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = '#E2E8F0'
                  e.target.style.boxShadow = 'none'
                }}
              />
            </div>

            <button
              onClick={handleSendCode}
              disabled={isLoading}
              style={{
                padding: '12px 24px',
                background: isLoading ? '#CCCCCC' : '#16A34A',
                color: '#fff',
                border: 'none',
                borderRadius: '10px',
                fontSize: '15px',
                fontWeight: 800,
                cursor: isLoading ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
                opacity: isLoading ? 0.7 : 1,
              }}
              onMouseEnter={(e) => !isLoading && (e.target.style.background = '#15A34A', e.target.style.transform = 'translateY(-2px)')}
              onMouseLeave={(e) => !isLoading && (e.target.style.background = '#16A34A', e.target.style.transform = 'translateY(0)')}
            >
              {isLoading ? 'جاري الإرسال...' : 'إرسال رمز التحقق'}
            </button>
          </div>
        )}

        {/* Step 2: Code */}
        {step === 'code' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <p style={{ fontSize: '13px', color: '#64748B', margin: '0 0 8px 0', textAlign: 'right' }}>
              تم إرسال رمز تحقق إلى {email}
            </p>

            <div>
              <label style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: 600,
                color: '#1E2A52',
                marginBottom: '8px',
                textAlign: 'right',
              }}>
                رمز التحقق (6 أرقام)
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.slice(0, 6))}
                placeholder="000000"
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  border: '1.5px solid #E2E8F0',
                  borderRadius: '10px',
                  fontSize: '14px',
                  fontFamily: 'monospace',
                  textAlign: 'center',
                  boxSizing: 'border-box',
                  letterSpacing: '8px',
                }}
              />
            </div>

            <button
              onClick={handleVerifyCode}
              disabled={isLoading}
              style={{
                padding: '12px 24px',
                background: isLoading ? '#CCCCCC' : '#16A34A',
                color: '#fff',
                border: 'none',
                borderRadius: '10px',
                fontSize: '15px',
                fontWeight: 800,
                cursor: isLoading ? 'not-allowed' : 'pointer',
                opacity: isLoading ? 0.7 : 1,
              }}
            >
              {isLoading ? 'جاري التحقق...' : 'التحقق من الرمز'}
            </button>

            <button
              onClick={() => setStep('email')}
              style={{
                padding: '12px 24px',
                background: '#F8FAFC',
                color: '#1E2A52',
                border: '1.5px solid #E2E8F0',
                borderRadius: '10px',
                fontSize: '15px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              تغيير البريد الإلكتروني
            </button>
          </div>
        )}

        {/* Step 3: Password */}
        {step === 'password' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: 600,
                color: '#1E2A52',
                marginBottom: '8px',
                textAlign: 'right',
              }}>
                كلمة المرور الجديدة
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  border: '1.5px solid #E2E8F0',
                  borderRadius: '10px',
                  fontSize: '14px',
                  fontFamily: 'Tajawal',
                  textAlign: 'right',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div>
              <label style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: 600,
                color: '#1E2A52',
                marginBottom: '8px',
                textAlign: 'right',
              }}>
                تأكيد كلمة المرور
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  border: '1.5px solid #E2E8F0',
                  borderRadius: '10px',
                  fontSize: '14px',
                  fontFamily: 'Tajawal',
                  textAlign: 'right',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <button
              onClick={handleResetPassword}
              disabled={isLoading}
              style={{
                padding: '12px 24px',
                background: isLoading ? '#CCCCCC' : '#16A34A',
                color: '#fff',
                border: 'none',
                borderRadius: '10px',
                fontSize: '15px',
                fontWeight: 800,
                cursor: isLoading ? 'not-allowed' : 'pointer',
                opacity: isLoading ? 0.7 : 1,
              }}
            >
              {isLoading ? 'جاري التحديث...' : 'تحديث كلمة المرور'}
            </button>
          </div>
        )}

        {/* Footer */}
        <div style={{ marginTop: '24px', textAlign: 'center' }}>
          <p style={{ fontSize: '14px', color: '#64748B', margin: 0 }}>
            هل تتذكر كلمة المرور؟{' '}
            <button
              onClick={() => navigate('/login')}
              style={{
                background: 'none',
                border: 'none',
                color: '#16A34A',
                fontSize: '14px',
                fontWeight: 700,
                cursor: 'pointer',
                textDecoration: 'none',
              }}
            >
              عد إلى تسجيل الدخول
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
