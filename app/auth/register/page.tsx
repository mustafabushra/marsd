'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Button from '@/components/Button'
import Input from '@/components/Input'
import Alert from '@/components/Alert'
import Card from '@/components/Card'

export default function RegisterPage() {
  const router = useRouter()
  const [formData, setFormData] = useState({
    fullName: '',
    companyName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
  })
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (formData.password !== formData.confirmPassword) {
      setError('كلمات المرور غير متطابقة')
      return
    }

    setIsLoading(true)

    try {
      await new Promise((resolve) => setTimeout(resolve, 1000))
      localStorage.setItem('auth_token', 'demo-token-' + Date.now())
      router.push('/dashboard')
    } catch (err) {
      setError('فشل إنشاء الحساب. حاول مرة أخرى.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card className="border-0 shadow-xl">
      <h2 className="text-2xl font-700 text-slate-900 mb-1 text-center">إنشاء حساب جديد</h2>
      <p className="text-slate-600 text-sm text-center mb-6">ابدأ رحلتك مع مرصد اليوم</p>

      {error && (
        <Alert variant="error" className="mb-6">
          {error}
        </Alert>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="الاسم الكامل"
          type="text"
          name="fullName"
          placeholder="أحمد محمد"
          value={formData.fullName}
          onChange={handleChange}
          required
        />

        <Input
          label="اسم الشركة"
          type="text"
          name="companyName"
          placeholder="شركتي"
          value={formData.companyName}
          onChange={handleChange}
          required
        />

        <Input
          label="البريد الإلكتروني"
          type="email"
          name="email"
          placeholder="you@example.com"
          value={formData.email}
          onChange={handleChange}
          required
        />

        <Input
          label="رقم الهاتف"
          type="tel"
          name="phone"
          placeholder="+966501234567"
          value={formData.phone}
          onChange={handleChange}
          required
        />

        <Input
          label="كلمة المرور"
          type="password"
          name="password"
          placeholder="••••••••"
          value={formData.password}
          onChange={handleChange}
          required
        />

        <Input
          label="تأكيد كلمة المرور"
          type="password"
          name="confirmPassword"
          placeholder="••••••••"
          value={formData.confirmPassword}
          onChange={handleChange}
          required
        />

        <label className="flex items-start gap-2 cursor-pointer pt-2">
          <input type="checkbox" className="w-4 h-4 rounded mt-1" required />
          <span className="text-xs text-slate-600">
            أوافق على{' '}
            <Link href="/terms" className="text-blue-600 hover:text-blue-700">
              شروط الخدمة
            </Link>{' '}
            و
            <Link href="/privacy" className="text-blue-600 hover:text-blue-700">
              سياسة الخصوصية
            </Link>
          </span>
        </label>

        <Button fullWidth isLoading={isLoading} type="submit" className="mt-6">
          إنشاء الحساب
        </Button>
      </form>

      <p className="text-center text-slate-600 text-sm mt-6">
        لديك حساب بالفعل؟{' '}
        <Link href="/auth/login" className="text-blue-600 font-medium hover:text-blue-700">
          تسجيل الدخول
        </Link>
      </p>
    </Card>
  )
}
