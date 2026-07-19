import Link from 'next/link'
import Button from '@/components/Button'
import Badge from '@/components/Badge'
import { Check } from 'lucide-react'

export default function PricingPage() {
  const plans = [
    {
      name: 'مجاني',
      price: 0,
      description: 'للبدء والتعرف على المنصة',
      features: [
        'البحث عن الشركات',
        '5 استعلامات شهرية',
        'إضافة التقارير',
        'عرض الدرجات',
      ],
      cta: 'ابدأ الآن',
      highlighted: false,
    },
    {
      name: 'احترافي',
      price: 99,
      description: 'للمحترفين والشركات الصغيرة',
      features: [
        'البحث المتقدم',
        '100 استعلام شهري',
        'إضافة التقارير',
        'المقارنة بين الشركات',
        'التقارير المتقدمة',
        'دعم الأولويات',
      ],
      cta: 'اشترك الآن',
      highlighted: true,
    },
    {
      name: 'مؤسسي',
      price: 499,
      description: 'للشركات والمؤسسات الكبرى',
      features: [
        'البحث غير محدود',
        'استعلامات غير محدودة',
        'إضافة التقارير',
        'المقارنة والتحليل',
        'التقارير المتقدمة',
        'دعم مخصص 24/7',
        'واجهات برمجية (API)',
        'تحليلات متقدمة',
      ],
      cta: 'تواصل معنا',
      highlighted: false,
    },
  ]

  return (
    <div className="min-h-screen bg-white" dir="rtl">
      {/* Navigation */}
      <nav className="bg-white border-b border-slate-200 px-7 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center text-white font-bold">
            ✓
          </div>
          <span className="text-2xl font-900 text-slate-900">مرصد</span>
        </Link>
      </nav>

      {/* Hero */}
      <div className="max-w-6xl mx-auto px-7 py-16 text-center">
        <h1 className="text-5xl font-900 text-slate-900 mb-4">الأسعار البسيطة والشفافة</h1>
        <p className="text-xl text-slate-600 mb-8">اختر الخطة التي تناسب احتياجاتك</p>
      </div>

      {/* Plans */}
      <div className="max-w-6xl mx-auto px-7 pb-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`rounded-lg border ${
                plan.highlighted
                  ? 'border-2 border-green-500 shadow-xl scale-105'
                  : 'border-slate-200'
              } p-8 flex flex-col`}
            >
              {plan.highlighted && (
                <div className="mb-4">
                  <Badge variant="success">الأشهر</Badge>
                </div>
              )}

              <h2 className="text-2xl font-700 text-slate-900 mb-2">{plan.name}</h2>
              <p className="text-slate-600 text-sm mb-6">{plan.description}</p>

              <div className="mb-6">
                <span className="text-4xl font-900 text-slate-900">{plan.price}</span>
                <span className="text-slate-600"> ر.س/شهر</span>
              </div>

              <Button
                fullWidth
                variant={plan.highlighted ? 'default' : 'outline'}
                className="mb-8"
              >
                {plan.cta}
              </Button>

              <div className="space-y-3 flex-1">
                {plan.features.map((feature) => (
                  <div key={feature} className="flex items-start gap-2">
                    <Check size={20} className="text-green-600 flex-shrink-0 mt-0.5" />
                    <span className="text-sm text-slate-600">{feature}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* FAQ */}
      <div className="bg-slate-50 py-16">
        <div className="max-w-4xl mx-auto px-7">
          <h2 className="text-3xl font-900 text-slate-900 text-center mb-12">أسئلة شائعة</h2>

          <div className="space-y-6">
            {[
              {
                q: 'هل يمكن تغيير الخطة لاحقاً؟',
                a: 'نعم، يمكنك الترقية أو الانتقال إلى خطة أقل في أي وقت. سيتم احتساب الفرق تناسبياً.',
              },
              {
                q: 'هل تقدمون ضمان استرجاع المال؟',
                a: 'نعم، نقدم ضمان استرجاع المال لمدة 30 يوماً من عند الاشتراك بدون أسئلة.',
              },
              {
                q: 'هل هناك خصم للاشتراكات السنوية؟',
                a: 'نعم، احصل على خصم 20% عند الاشتراك السنوي بدلاً من الشهري.',
              },
              {
                q: 'كيف يتم الدفع؟',
                a: 'نقبل جميع بطاقات الائتمان الرئيسية وخدمات الدفع الإلكترونية المحلية.',
              },
            ].map((item, idx) => (
              <div key={idx} className="bg-white rounded-lg border border-slate-200 p-6">
                <h3 className="font-700 text-slate-900 mb-2">{item.q}</h3>
                <p className="text-slate-600">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
