/**
 * Login Form Component
 * Handles user authentication with email and password
 */

import React, { useState } from 'react'
import { login } from '../../lib/api'
import Button from '../common/Button'
import Input from '../ui/Input'
import { LoginFormProps } from '../../types'
import Card from '../common/Card'

const LoginForm: React.FC<LoginFormProps> = ({
  onSuccess,
  onError,
  isLoading: externalLoading = false,
}) => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [touched, setTouched] = useState({ email: false, password: false })

  const isLoading = loading || externalLoading

  const validateEmail = (value: string) => {
    if (!value) return 'البريد الإلكتروني مطلوب'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'البريد الإلكتروني غير صحيح'
    return ''
  }

  const validatePassword = (value: string) => {
    if (!value) return 'كلمة المرور مطلوبة'
    if (value.length < 6) return 'كلمة المرور يجب أن تكون 6 أحرف على الأقل'
    return ''
  }

  const emailError = touched.email ? validateEmail(email) : ''
  const passwordError = touched.password ? validatePassword(password) : ''

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    // Validate
    const emailErr = validateEmail(email)
    const passwordErr = validatePassword(password)

    if (emailErr || passwordErr) {
      setTouched({ email: true, password: true })
      return
    }

    setLoading(true)
    try {
      const response = await login(email, password)
      if (response.user) {
        onSuccess?.(response.user)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'فشل تسجيل الدخول'
      setError(message)
      onError?.(message)
    } finally {
      setLoading(false)
    }
  }

  const containerStyles: React.CSSProperties = {
    width: '100%',
    maxWidth: '500px',
    margin: '0 auto',
  }

  const formStyles: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  }

  const titleStyles: React.CSSProperties = {
    fontSize: '28px',
    fontWeight: 700,
    color: '#1E2A52',
    fontFamily: 'Tajawal, sans-serif',
    margin: '0 0 8px 0',
  }

  const subtitleStyles: React.CSSProperties = {
    fontSize: '14px',
    color: '#475569',
    fontFamily: 'Tajawal, sans-serif',
    margin: '0 0 20px 0',
  }

  const errorStyles: React.CSSProperties = {
    padding: '12px 16px',
    backgroundColor: '#FEE2E2',
    border: '1px solid #FECACA',
    borderRadius: '8px',
    color: '#991B1B',
    fontSize: '14px',
    fontFamily: 'Tajawal, sans-serif',
  }

  const linkStyles: React.CSSProperties = {
    fontSize: '14px',
    color: '#475569',
    fontFamily: 'Tajawal, sans-serif',
    textAlign: 'center',
  }

  const linkAnchorStyles: React.CSSProperties = {
    color: '#16A34A',
    textDecoration: 'none',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'color 0.2s',
  }

  return (
    <div style={containerStyles}>
      <Card padding={32} border shadow>
        <div style={{ marginBottom: '24px' }}>
          <h1 style={titleStyles}>تسجيل الدخول</h1>
          <p style={subtitleStyles}>أدخل بيانات حسابك للمتابعة</p>
        </div>

        <form onSubmit={handleSubmit} style={formStyles}>
          {error && <div style={errorStyles}>{error}</div>}

          <Input
            label="البريد الإلكتروني"
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onBlur={() => setTouched(prev => ({ ...prev, email: true }))}
            error={emailError}
            disabled={isLoading}
            fullWidth
          />

          <Input
            label="كلمة المرور"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onBlur={() => setTouched(prev => ({ ...prev, password: true }))}
            error={passwordError}
            disabled={isLoading}
            fullWidth
          />

          <Button
            type="submit"
            variant="primary"
            size="md"
            fullWidth
            disabled={isLoading || Boolean(emailError || passwordError)}
            loading={isLoading}
          >
            {isLoading ? 'جاري التحميل...' : 'تسجيل الدخول'}
          </Button>
        </form>

        <div style={linkStyles}>
          ليس لديك حساب؟{' '}
          <a href="/register" style={linkAnchorStyles}>
            قم بالتسجيل
          </a>
        </div>
      </Card>
    </div>
  )
}

export default LoginForm
