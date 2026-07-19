import Link from 'next/link'
import Button from '@/components/Button'
import { CheckCircle, TrendingUp, Lock, Users, BarChart3, Search } from 'lucide-react'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white" dir="rtl">
      {/* Navigation */}
      <nav className="sticky top-0 z-40 bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-7 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center text-white font-bold">
              ✓
            </div>
            <span className="text-2xl font-900 text-slate-900">مرصد</span>
          </div>

          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-slate-600 hover:text-slate-900 font-medium">
              المميزات
            </a>
            <a href="#pricing" className="text-slate-600 hover:text-slate-900 font-medium">
              الأسعار
            </a>
            <a href="/about" className="text-slate-600 hover:text-slate-900 font-medium">
              من نحن
            </a>
            <a href="/faq" className="text-slate-600 hover:text-slate-900 font-medium">
              أسئلة شائعة
            </a>
          </div>

          <div className="flex items-center gap-3">
            <Link href="/auth/login">
              <Button variant="ghost">تسجيل الدخول</Button>
            </Link>
            <Link href="/auth/register">
              <Button>إنشاء حساب</Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-7 py-20 text-center">
        <h1 className="text-5xl md:text-6xl font-900 text-slate-900 mb-4">
          منصة تقييم موثوقية الأعمال
        </h1>
        <p className="text-xl text-slate-600 mb-8 max-w-2xl mx-auto">
          اكتشف درجة ثقة الشركات من خلال البيانات الحكومية والتقارير المجتمعية المتحققة منها
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
          <Link href="/auth/register">
            <Button size="lg">ابدأ الآن مجاناً</Button>
          </Link>
          <a href="#features">
            <Button variant="outline" size="lg">
              اعرف المزيد
            </Button>
          </a>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-12 border-t border-slate-200">
          <div>
            <p className="text-4xl font-900 text-slate-900">10,000+</p>
            <p className="text-slate-600 mt-2">شركة مسجلة</p>
          </div>
          <div>
            <p className="text-4xl font-900 text-slate-900">50,000+</p>
            <p className="text-slate-600 mt-2">مستخدم نشط</p>
          </div>
          <div>
            <p className="text-4xl font-900 text-slate-900">100,000+</p>
            <p className="text-slate-600 mt-2">تقرير موثوق</p>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="bg-slate-50 py-20">
        <div className="max-w-7xl mx-auto px-7">
          <h2 className="text-4xl font-900 text-slate-900 text-center mb-16">المميزات الرئيسية</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              {
                icon: <Search className="text-blue-600" size={32} />,
                title: 'بحث قوي',
                description: 'ابحث عن أي شركة وحصل على درجة ثقة شاملة فوراً',
              },
              {
                icon: <BarChart3 className="text-green-600" size={32} />,
                title: 'تقارير متقدمة',
                description: 'تحليلات عميقة تجمع بين البيانات الرسمية والمجتمعية',
              },
              {
                icon: <Lock className="text-purple-600" size={32} />,
                title: 'التقارير المجهولة',
                description: 'شارك تجربتك بأمان دون الكشف عن هويتك',
              },
              {
                icon: <TrendingUp className="text-orange-600" size={32} />,
                title: 'المقارنة والتحليل',
                description: 'قارن بين عدة شركات واتخذ قرارات مستنيرة',
              },
              {
                icon: <Users className="text-red-600" size={32} />,
                title: 'مجتمع موثوق',
                description: 'انضم لآلاف المستخدمين الذين يثقون بمرصد',
              },
              {
                icon: <CheckCircle className="text-teal-600" size={32} />,
                title: 'تحقق معتمد',
                description: 'نظام تحقق صارم للتقارير لضمان الموثوقية',
              },
            ].map((feature, idx) => (
              <div key={idx} className="bg-white p-8 rounded-lg border border-slate-200 hover:shadow-lg transition">
                <div className="mb-4">{feature.icon}</div>
                <h3 className="text-xl font-700 text-slate-900 mb-2">{feature.title}</h3>
                <p className="text-slate-600">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="max-w-7xl mx-auto px-7 py-20 text-center">
        <h2 className="text-4xl font-900 text-slate-900 mb-4">هل أنت مستعد للبدء؟</h2>
        <p className="text-xl text-slate-600 mb-8">
          انضم إلى آلاف المستخدمين الذين يثقون بمرصد في تقييم الشركات
        </p>

        <Link href="/auth/register">
          <Button size="lg">إنشاء حساب مجاني</Button>
        </Link>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 text-white py-12">
        <div className="max-w-7xl mx-auto px-7">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center font-bold">
                  ✓
                </div>
                <span className="text-xl font-900">مرصد</span>
              </div>
              <p className="text-slate-400">منصة تقييم موثوقية الأعمال</p>
            </div>

            <div>
              <h4 className="font-700 mb-4">المنتج</h4>
              <ul className="space-y-2 text-slate-400">
                <li><a href="#" className="hover:text-white">المميزات</a></li>
                <li><a href="/pricing" className="hover:text-white">الأسعار</a></li>
                <li><a href="/security" className="hover:text-white">الأمان</a></li>
              </ul>
            </div>

            <div>
              <h4 className="font-700 mb-4">الشركة</h4>
              <ul className="space-y-2 text-slate-400">
                <li><a href="/about" className="hover:text-white">من نحن</a></li>
                <li><a href="/blog" className="hover:text-white">المدونة</a></li>
                <li><a href="/contact" className="hover:text-white">التواصل</a></li>
              </ul>
            </div>

            <div>
              <h4 className="font-700 mb-4">قانوني</h4>
              <ul className="space-y-2 text-slate-400">
                <li><a href="/terms" className="hover:text-white">الشروط</a></li>
                <li><a href="/privacy" className="hover:text-white">الخصوصية</a></li>
                <li><a href="/cookies" className="hover:text-white">الكوكيز</a></li>
              </ul>
            </div>
          </div>

          <div className="border-t border-slate-800 pt-8 text-center text-slate-400">
            <p>&copy; 2024 مرصد. جميع الحقوق محفوظة.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
