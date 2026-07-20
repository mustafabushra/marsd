/**
 * Register Form Component
 * Handles company registration with validation
 */

import React, { useState } from 'react'
import { register } from '../../lib/api'
import Button from '../common/Button'
import Input from '../ui/Input'
import { RegisterFormProps } from '../../types'
import Card from '../common/Card'

interface FormErrors {
  [key: string]: string
}

interface FormValues {
  name: string
  ownerName: string
  email: string
  crNumber: string
  sector: string
  city: string
  phone: string
  password: string
  confirmPassword: string
}

const SECTORS = [
  'مقاولات',
  'تجارة',
  'تقنية',
  'توريد',
  'خدمات',
  'صناعة',
  'طاقة',
  'الرعاية الصحية',
]

const CITIES = [
  'الرياض',
  'جدة',
  'الدمام',
  'الخبر',
  'القاهرة',
  'الإسكندرية',
  'مكة',
  'المدينة',
]

const RegisterForm: React.FC<RegisterFormProps> = ({
  onSuccess,
  onError,
  isLoading: externalLoading = false,
}) => {
  const [values, setValues] = useState<FormValues>({
    name: '',
    ownerName: '',
    email: '',
    crNumber: '',
    sector: '',
    city: '',
    phone: '',
    password: '',
    confirmPassword: '',
  })

  const [errors, setErrors] = useState<FormErrors>({})
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(false)
  const [generalError, setGeneralError] = useState('')

  const isLoading = loading || externalLoading

  const validateForm = (): FormErrors => {
    const newErrors: FormErrors = {}

    if (!values.name.trim()) {
      newErrors.name = 'اسم الشركة مطلوب'
    }

    if (!values.ownerName.trim()) {
      newErrors.ownerName = 'اسم المالك مطلوب'
    }

    if (!values.email) {
      newErrors.email = 'البريد الإلكتروني مطلوب'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) {
      newErrors.email = 'البريد الإلكتروني غير صحيح'
    }

    if (!values.crNumber) {
      newErrors.crNumber = 'رقم السجل التجاري مطلوب'
    } else if (!/^\d{10}$/.test(values.crNumber)) {
      newErrors.crNumber = 'رقم السجل التجاري يجب أن يكون 10 أرقام'
    }

    if (!values.sector) {
      newErrors.sector = 'القطاع مطلوب'
    }

    if (!values.city) {
      newErrors.city = 'المدينة مطلوبة'
    }

    if (!values.phone) {
      newErrors.phone = 'رقم الهاتف مطلوب'
    } else if (!/^\d{9,}$/.test(values.phone.replace(/\D/g, ''))) {
      newErrors.phone = 'رقم الهاتف غير صحيح'
    }

    if (!values.password) {
      newErrors.password = 'كلمة المرور مطلوبة'
    } else if (values.password.length < 8) {
      newErrors.password = 'كلمة المرور يجب أن تكون 8 أحرف على الأقل'
    }

    if (!values.confirmPassword) {
      newErrors.confirmPassword = 'تأكيد كلمة المرور مطلوب'
    } else if (values.password !== values.confirmPassword) {
      newErrors.confirmPassword = 'كلمات المرور غير متطابقة'
    }

    return newErrors
  }

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target
    setValues(prev => ({ ...prev, [name]: value }))
    // Clear error for this field when user starts typing
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }))
    }
  }

  const handleBlur = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name } = e.target
    setTouched(prev => ({ ...prev, [name]: true }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setGeneralError('')

    const newErrors = validateForm()
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      setTouched({
        name: true,
        ownerName: true,
        email: true,
        crNumber: true,
        sector: true,
        city: true,
        phone: true,
        password: true,
        confirmPassword: true,
      })
      return
    }

    setLoading(true)
    try {
      const response = await register({
        name: values.name,
        commercialNumber: values.crNumber,
        sector: values.sector,
        city: values.city,
        phone: values.phone,
        email: values.email,
        password: values.password,
      })
      if (response.user || response.tenant) {
        onSuccess?.(response.user || response.tenant)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'فشل إنشاء الحساب'
      setGeneralError(message)
      onError?.(message)
    } finally {
      setLoading(false)
    }
  }

  const containerStyles: React.CSSProperties = {
    width: '100%',
    maxWidth: '700px',
    margin: '0 auto',
  }

  const formStyles: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  }

  const gridStyles: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
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

  const selectStyles: React.CSSProperties = {
    padding: '12px',
    borderRadius: '8px',
    border: errors[Object.keys(errors)[0]] ? '1.5px solid #DC2626' : '1.5px solid #E2E8F0',
    fontSize: '14px',
    fontFamily: 'Tajawal, sans-serif',
    color: '#1E2A52',
  }

  return (
    <div style={containerStyles}>
      <Card padding={32} border shadow>
        <div style={{ marginBottom: '24px' }}>
          <h1 style={titleStyles}>إنشاء حساب</h1>
          <p style={subtitleStyles}>قم بتسجيل شركتك للبدء</p>
        </div>

        <form onSubmit={handleSubmit} style={formStyles}>
          {generalError && <div style={errorStyles}>{generalError}</div>}

          <div style={gridStyles}>
            <Input
              label="اسم الشركة"
              name="name"
              placeholder="شركتك"
              value={values.name}
              onChange={handleChange}
              onBlur={handleBlur}
              error={touched.name ? errors.name : ''}
              disabled={isLoading}
            />

            <Input
              label="اسم المالك"
              name="ownerName"
              placeholder="اسمك الكامل"
              value={values.ownerName}
              onChange={handleChange}
              onBlur={handleBlur}
              error={touched.ownerName ? errors.ownerName : ''}
              disabled={isLoading}
            />
          </div>

          <Input
            label="البريد الإلكتروني"
            name="email"
            type="email"
            placeholder="your@email.com"
            value={values.email}
            onChange={handleChange}
            onBlur={handleBlur}
            error={touched.email ? errors.email : ''}
            disabled={isLoading}
            fullWidth
          />

          <div style={gridStyles}>
            <Input
              label="رقم السجل التجاري"
              name="crNumber"
              placeholder="1010123456"
              value={values.crNumber}
              onChange={handleChange}
              onBlur={handleBlur}
              error={touched.crNumber ? errors.crNumber : ''}
              disabled={isLoading}
            />

            <Input
              label="رقم الهاتف"
              name="phone"
              type="tel"
              placeholder="0501234567"
              value={values.phone}
              onChange={handleChange}
              onBlur={handleBlur}
              error={touched.phone ? errors.phone : ''}
              disabled={isLoading}
            />
          </div>

          <div style={gridStyles}>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600 }}>
                القطاع
              </label>
              <select
                name="sector"
                value={values.sector}
                onChange={handleChange}
                onBlur={handleBlur}
                style={selectStyles}
                disabled={isLoading}
              >
                <option value="">اختر القطاع</option>
                {SECTORS.map(sector => (
                  <option key={sector} value={sector}>
                    {sector}
                  </option>
                ))}
              </select>
              {touched.sector && errors.sector && (
                <span style={{ color: '#DC2626', fontSize: '12px' }}>{errors.sector}</span>
              )}
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600 }}>
                المدينة
              </label>
              <select
                name="city"
                value={values.city}
                onChange={handleChange}
                onBlur={handleBlur}
                style={selectStyles}
                disabled={isLoading}
              >
                <option value="">اختر المدينة</option>
                {CITIES.map(city => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))}
              </select>
              {touched.city && errors.city && (
                <span style={{ color: '#DC2626', fontSize: '12px' }}>{errors.city}</span>
              )}
            </div>
          </div>

          <div style={gridStyles}>
            <Input
              label="كلمة المرور"
              name="password"
              type="password"
              placeholder="••••••••"
              value={values.password}
              onChange={handleChange}
              onBlur={handleBlur}
              error={touched.password ? errors.password : ''}
              disabled={isLoading}
            />

            <Input
              label="تأكيد كلمة المرور"
              name="confirmPassword"
              type="password"
              placeholder="••••••••"
              value={values.confirmPassword}
              onChange={handleChange}
              onBlur={handleBlur}
              error={touched.confirmPassword ? errors.confirmPassword : ''}
              disabled={isLoading}
            />
          </div>

          <Button
            type="submit"
            variant="primary"
            size="md"
            fullWidth
            disabled={isLoading}
            loading={isLoading}
          >
            {isLoading ? 'جاري التسجيل...' : 'إنشاء الحساب'}
          </Button>
        </form>

        <div style={{ marginTop: '16px', textAlign: 'center', fontSize: '14px' }}>
          لديك حساب بالفعل؟{' '}
          <a href="/login" style={{ color: '#16A34A', textDecoration: 'none', fontWeight: 600 }}>
            سجل الدخول
          </a>
        </div>
      </Card>
    </div>
  )
}

export default RegisterForm
