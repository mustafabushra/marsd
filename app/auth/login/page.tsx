'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Button from '@/components/Button'
import Input from '@/components/Input'
import Alert from '@/components/Alert'
import Card from '@/components/Card'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      // Validate input
      if (!email || !password) {
        setError('البريد الإلكتروني وكلمة المرور مطلوبين')
        setIsLoading(false)
        return
      }

      // Simulate login
      await new Promise((resolve) => setTimeout(resolve, 800))

      // Store auth token
      localStorage.setItem('auth_token', 'demo-token-' + Date.now())
      localStorage.setItem('user_email', email)

      // Redirect to dashboard
      router.push('/dashboard')
    } catch (err) {
      setError('فشل تسجيل الدخول. حاول مرة أخرى.')
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-blue-50 to-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-5xl font-black text-green-600 mb-2">مرصد</h1>
          <p className="text-slate-600 text-lg">منصة تقييم موثوقية الأعمال</p>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <h2 className="text-3xl font-bold text-slate-900 mb-2 text-center">تسجيل الدخول</h2>
          <p className="text-slate-600 text-center mb-8">أدخل بيانات حسابك للمتابعة</p>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg mb-6">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">البريد الإلكتروني</label>
              <input
                type="email"
                placeholder="example@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">كلمة المرور</label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 rounded border-slate-300" />
                <span className="text-sm text-slate-600">تذكرني</span>
              </label>
              <Link href="#" className="text-sm text-green-600 hover:text-green-700 font-medium">
                هل نسيت كلمة المرور؟
              </Link>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg transition mt-8"
            >
              {isLoading ? 'جاري الدخول...' : 'تسجيل الدخول'}
            </button>
          </form>

          {/* Divider */}
          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-slate-500">أو</span>
            </div>
          </div>

          {/* Register Link */}
          <p className="text-center text-slate-600 text-sm">
            ليس لديك حساب؟{' '}
            <Link href="/auth/register" className="text-green-600 font-bold hover:text-green-700">
              إنشاء حساب جديد
            </Link>
          </p>
        </div>

        {/* Info Box */}
        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-800 text-center">
            <strong>💡 للاختبار:</strong> استخدم أي بريد إلكتروني وأي كلمة مرور
          </p>
        </div>
      </div>
    </div>
  )
}
