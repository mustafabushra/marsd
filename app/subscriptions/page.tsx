'use client'

import { useEffect, useState } from 'react'
import { Check, X, Loader, AlertCircle } from 'lucide-react'
import Card from '@/components/Card'
import Button from '@/components/Button'
import Badge from '@/components/Badge'
import { apiClient } from '@/lib/api'

interface SubscriptionPlan {
  id: string
  name: string
  price: number
  period: 'monthly' | 'yearly'
  description: string
  features: Array<{ name: string; included: boolean }>
  isCurrent?: boolean
  highlighted?: boolean
}

interface CurrentSubscription {
  planId: string
  planName: string
  startDate: string
  endDate: string
  status: string
  queriesUsed: number
  queriesLimit: number
}

const DEFAULT_PLANS: SubscriptionPlan[] = [
  {
    id: 'free',
    name: 'مجاني',
    price: 0,
    period: 'monthly',
    description: 'للبدء والتعرف على المنصة',
    features: [
      { name: 'البحث عن الشركات', included: true },
      { name: 'عدد الاستعلامات: 5/شهر', included: true },
      { name: 'إضافة التقارير', included: true },
      { name: 'المقارنة بين الشركات', included: false },
      { name: 'الوصول للتقارير المتقدمة', included: false },
      { name: 'دعم الأولويات', included: false },
    ],
    highlighted: false,
  },
  {
    id: 'professional',
    name: 'احترافي',
    price: 99,
    period: 'monthly',
    description: 'للمحترفين والشركات الصغيرة',
    features: [
      { name: 'البحث عن الشركات', included: true },
      { name: 'عدد الاستعلامات: 100/شهر', included: true },
      { name: 'إضافة التقارير', included: true },
      { name: 'المقارنة بين الشركات', included: true },
      { name: 'الوصول للتقارير المتقدمة', included: true },
      { name: 'دعم الأولويات', included: false },
    ],
    highlighted: true,
  },
  {
    id: 'enterprise',
    name: 'مؤسسي',
    price: 499,
    period: 'monthly',
    description: 'للشركات والمؤسسات الكبرى',
    features: [
      { name: 'البحث عن الشركات', included: true },
      { name: 'عدد الاستعلامات: غير محدود', included: true },
      { name: 'إضافة التقارير', included: true },
      { name: 'المقارنة بين الشركات', included: true },
      { name: 'الوصول للتقارير المتقدمة', included: true },
      { name: 'دعم الأولويات', included: true },
    ],
    highlighted: false,
  },
]

export default function SubscriptionsPage() {
  const [plans, setPlans] = useState<SubscriptionPlan[]>(DEFAULT_PLANS)
  const [currentSubscription, setCurrentSubscription] = useState<CurrentSubscription | null>(null)
  const [loading, setLoading] = useState(true)
  const [upgrading, setUpgrading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchSubscriptionData()
  }, [])

  const fetchSubscriptionData = async () => {
    try {
      setLoading(true)
      setError(null)

      // Fetch current subscription
      const subscription = await apiClient.getUserSubscription()
      const sub = subscription as any
      if (sub) {
        setCurrentSubscription({
          planId: sub.planId || 'free',
          planName: sub.planName || 'مجاني',
          startDate: sub.startDate || new Date().toISOString(),
          endDate: sub.endDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          status: sub.status || 'active',
          queriesUsed: sub.queriesUsed || 2,
          queriesLimit: sub.queriesLimit || 5,
        })
      }

      // Fetch available plans
      const plansRes = await apiClient.getSubscriptionPlans()
      const plansData = (plansRes as any)?.data || []
      if (plansData && Array.isArray(plansData) && plansData.length > 0) {
        const updatedPlans = DEFAULT_PLANS.map((plan) => ({
          ...plan,
          isCurrent: (sub as any)?.planId === plan.id,
        }))
        setPlans(updatedPlans)
      }
    } catch (err) {
      console.error('Failed to fetch subscription data:', err)
      setError('فشل في تحميل بيانات الاشتراك')
    } finally {
      setLoading(false)
    }
  }

  const handleUpgrade = async (planId: string) => {
    try {
      setUpgrading(planId)
      setError(null)

      await apiClient.upgradePlan(planId)

      // Show success and refresh data
      alert('تم تحديث الاشتراك بنجاح')
      await fetchSubscriptionData()
    } catch (err) {
      setError('فشل في تحديث الاشتراك. يرجى المحاولة مرة أخرى.')
      console.error('Upgrade failed:', err)
    } finally {
      setUpgrading(null)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Card className="flex flex-col items-center gap-4">
          <Loader className="animate-spin text-blue-600" size={32} />
          <p className="text-slate-600">جاري تحميل بيانات الاشتراك...</p>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-7 py-6">
        <div>
          <h1 className="text-3xl font-900 text-slate-900">الاشتراكات والخطط</h1>
          <p className="text-slate-600">اختر الخطة المناسبة لاحتياجاتك</p>
        </div>
      </div>

      {/* Content */}
      <main className="p-7">
        {error && (
          <Card className="mb-8 bg-red-50 border border-red-200">
            <div className="flex items-center gap-3">
              <AlertCircle className="text-red-600" size={20} />
              <p className="text-red-700">{error}</p>
            </div>
          </Card>
        )}

        {/* Current Subscription Info */}
        {currentSubscription && (
          <Card className="mb-8 bg-blue-50 border-blue-200">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-700 text-slate-900">خطتك الحالية</h3>
                <p className="text-slate-600">
                  {currentSubscription.planName} • {currentSubscription.queriesUsed} من {currentSubscription.queriesLimit} الاستعلامات المستخدمة
                </p>
              </div>
              <Badge variant="info">نشط</Badge>
            </div>
            <div className="mt-3 w-full bg-slate-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all"
                style={{
                  width: `${(currentSubscription.queriesUsed / currentSubscription.queriesLimit) * 100}%`,
                }}
              ></div>
            </div>
          </Card>
        )}

        {/* Pricing Plans */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map((plan) => (
            <Card
              key={plan.id}
              className={`flex flex-col transition-transform ${
                plan.highlighted ? 'border-2 border-green-500 shadow-lg' : ''
              } ${plan.isCurrent ? 'border-2 border-blue-500' : ''}`}
            >
              {plan.highlighted && (
                <div className="mb-4 text-center">
                  <Badge variant="success">الأفضل</Badge>
                </div>
              )}

              <div className="mb-6">
                <h2 className="text-2xl font-700 text-slate-900 mb-1">{plan.name}</h2>
                <p className="text-slate-600 text-sm mb-4">{plan.description}</p>

                <div className="flex items-baseline gap-1 mb-4">
                  <span className="text-4xl font-900 text-slate-900">{plan.price}</span>
                  <span className="text-slate-600">ر.س/شهر</span>
                </div>

                {plan.isCurrent ? (
                  <Button fullWidth variant="outline" disabled>
                    الخطة الحالية
                  </Button>
                ) : (
                  <Button
                    fullWidth
                    variant={plan.highlighted ? 'default' : 'outline'}
                    onClick={() => handleUpgrade(plan.id)}
                    disabled={upgrading === plan.id}
                  >
                    {upgrading === plan.id
                      ? 'جاري التحديث...'
                      : plan.price === 0
                        ? 'استخدم مجاناً'
                        : 'الترقية الآن'}
                  </Button>
                )}
              </div>

              {/* Features List */}
              <div className="space-y-3 pt-6 border-t border-slate-200">
                {plan.features.map((feature) => (
                  <div key={feature.name} className="flex items-start gap-2">
                    {feature.included ? (
                      <Check size={18} className="text-green-600 flex-shrink-0 mt-0.5" />
                    ) : (
                      <X size={18} className="text-slate-300 flex-shrink-0 mt-0.5" />
                    )}
                    <span
                      className={`text-sm ${
                        feature.included ? 'text-slate-900' : 'text-slate-400 line-through'
                      }`}
                    >
                      {feature.name}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>

        {/* Payment History */}
        <div className="mt-12">
          <Card>
            <h2 className="text-2xl font-700 text-slate-900 mb-6">سجل الدفع</h2>
            <div className="space-y-3">
              <div className="flex justify-between items-center p-3 bg-slate-50 rounded">
                <div>
                  <p className="font-600 text-slate-900">خطة احترافية</p>
                  <p className="text-sm text-slate-600">15 يونيو 2024</p>
                </div>
                <p className="font-700 text-slate-900">99 ر.س</p>
              </div>
              <div className="flex justify-between items-center p-3 bg-slate-50 rounded">
                <div>
                  <p className="font-600 text-slate-900">خطة مجانية</p>
                  <p className="text-sm text-slate-600">15 مايو 2024</p>
                </div>
                <p className="font-700 text-slate-900">مجاني</p>
              </div>
            </div>
          </Card>
        </div>

        {/* FAQ Section */}
        <div className="mt-12">
          <Card>
            <h2 className="text-2xl font-700 text-slate-900 mb-6">أسئلة شائعة</h2>

            <div className="space-y-6">
              <div>
                <h3 className="font-700 text-slate-900 mb-2">هل يمكن تغيير الخطة لاحقاً؟</h3>
                <p className="text-slate-600 text-sm">نعم، يمكنك الترقية أو الانتقال إلى خطة أقل في أي وقت. سيتم احتساب الفرق تناسبياً.</p>
              </div>

              <div>
                <h3 className="font-700 text-slate-900 mb-2">ما السياسة المتبعة للاسترجاع؟</h3>
                <p className="text-slate-600 text-sm">نحن نقدم ضمان استرجاع المال لمدة 30 يوماً من عند الاشتراك بدون أسئلة.</p>
              </div>

              <div>
                <h3 className="font-700 text-slate-900 mb-2">هل هناك خصم للاشتراكات السنوية؟</h3>
                <p className="text-slate-600 text-sm">نعم! احصل على خصم 20% عند الاشتراك السنوي بدلاً من الشهري.</p>
              </div>

              <div>
                <h3 className="font-700 text-slate-900 mb-2">هل هناك دعم للعملاء؟</h3>
                <p className="text-slate-600 text-sm">نعم، فريق دعمنا متاح 24/7 عبر البريد الإلكتروني والدردشة المباشرة.</p>
              </div>
            </div>
          </Card>
        </div>
      </main>
    </div>
  )
}
