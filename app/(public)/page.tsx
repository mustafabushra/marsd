import Link from 'next/link'
import Button from '@/components/Button'
import { Check, BarChart3, Search } from 'lucide-react'

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

          <div className="hidden md:flex items-center gap-8 text-sm">
            <a href="#" className="text-slate-600 hover:text-slate-900 font-medium">
              الرئيسية
            </a>
            <a href="#" className="text-slate-600 hover:text-slate-900 font-medium">
              المنصة
            </a>
            <a href="#" className="text-slate-600 hover:text-slate-900 font-medium">
              الأسئلة الشائعة
            </a>
            <a href="#" className="text-slate-600 hover:text-slate-900 font-medium">
              السياسة الشاملة
            </a>
            <a href="#" className="text-slate-600 hover:text-slate-900 font-medium">
              الدليل
            </a>
            <a href="#" className="text-slate-600 hover:text-slate-900 font-medium">
              عن المنصة
            </a>
            <a href="#" className="text-slate-600 hover:text-slate-900 font-medium">
              تواصل معنا
            </a>
          </div>

          <div className="flex items-center gap-3">
            <Link href="/auth/login">
              <Button variant="outline" size="sm">تسجيل الدخول</Button>
            </Link>
            <Link href="/auth/register">
              <Button size="sm">إنشاء حساب</Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section - Matching Design */}
      <section className="max-w-7xl mx-auto px-7 py-20">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Left Side - Circle Score */}
          <div className="flex justify-center">
            <div className="bg-slate-50 p-8 rounded-lg">
              <div className="w-48 h-48 rounded-full border-8 border-green-500 flex items-center justify-center mx-auto mb-6 relative bg-white">
                <div className="text-center">
                  <div className="text-6xl font-900 text-slate-900">94</div>
                  <div className="text-sm text-slate-600 mt-2">مؤشر الثقة</div>
                </div>
              </div>

              <div className="text-center">
                <p className="text-sm text-green-600 font-600 mb-4">● موثوقية عالية</p>
                <div className="mb-2">
                  <p className="text-xs text-slate-600 mb-2">نسبة الالتزام بالدفعات</p>
                  <div className="w-full bg-slate-200 rounded-full h-2">
                    <div className="bg-green-500 h-2 rounded-full" style={{ width: '96%' }}></div>
                  </div>
                  <p className="text-xs text-slate-600 mt-1">96%</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Side - Hero Text */}
          <div>
            <div className="inline-block bg-cyan-50 px-3 py-1 rounded-full mb-4">
              <p className="text-cyan-700 text-sm font-600">منصة متخصصة لتقييم موثوقية الأعمال</p>
            </div>

            <h1 className="text-4xl md:text-5xl font-900 text-slate-900 mb-6 leading-tight">
              اعرف موثوقية شركات التجاريين<br />قبل التعامل معهم
            </h1>

            <p className="text-slate-600 mb-8 leading-relaxed text-lg">
              منصة "مرصد" تحتف موثوقية شركات لكل شركة من خلال بيانات رسمية والتقارير المجتمعية المتحققة منها والتحليلات الشاملة للمخاطر
            </p>

            <div className="flex items-center gap-6 mb-8">
              <Link href="/auth/register">
                <Button size="lg" className="bg-green-600 hover:bg-green-700">ابدأ مجاناً</Button>
              </Link>
              <a href="#" className="text-slate-600 hover:text-slate-900 font-600 text-sm">
                شاهد كيف تعمل
              </a>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-6 pt-8 border-t border-slate-200">
              <div>
                <p className="text-3xl font-900 text-slate-900">+12,400</p>
                <p className="text-slate-600 text-sm mt-1">شركة مسجلة</p>
              </div>
              <div>
                <p className="text-3xl font-900 text-slate-900">+38,900</p>
                <p className="text-slate-600 text-sm mt-1">تقرير مضافة</p>
              </div>
              <div>
                <p className="text-3xl font-900 text-slate-900">99.2%</p>
                <p className="text-slate-600 text-sm mt-1">درجة البيانات الرسمية</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it Works Section */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-7">
          <h2 className="text-4xl font-900 text-slate-900 text-center mb-16">كيف تعمل المنصة؟</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-16 h-16 bg-slate-100 rounded-lg flex items-center justify-center mx-auto mb-6">
                <Search className="text-slate-900" size={32} />
              </div>
              <h3 className="text-xl font-700 text-slate-900 mb-3">ابحث عن شركة</h3>
              <p className="text-slate-600">ابحث عن اسم الشركة في نظام البيانات الخاص بنا</p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 bg-slate-100 rounded-lg flex items-center justify-center mx-auto mb-6">
                <BarChart3 className="text-slate-900" size={32} />
              </div>
              <h3 className="text-xl font-700 text-slate-900 mb-3">اطلع على التقييم</h3>
              <p className="text-slate-600">معلومات شاملة وتحليلات دقيقة قائمة على بيانات وتقارير مسجلة</p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 bg-slate-100 rounded-lg flex items-center justify-center mx-auto mb-6">
                <Check className="text-slate-900" size={32} />
              </div>
              <h3 className="text-xl font-700 text-slate-900 mb-3">اتخذ قرارً آمناً</h3>
              <p className="text-slate-600">قرر بثقة عند التعامل مع الشركات بناءً على بيانات موثوقة</p>
            </div>
          </div>
        </div>
      </section>

      {/* Trust Score Section */}
      <section className="bg-slate-50 py-20">
        <div className="max-w-7xl mx-auto px-7">
          <h2 className="text-4xl font-900 text-slate-900 text-center mb-4">كيف يُحسب مؤشر الثقة؟</h2>
          <p className="text-slate-600 text-center mb-12 max-w-2xl mx-auto">
            ثلاث شطورات متخصصة تسوق دراستها موثوقياً يتسب الثقة
          </p>

          <div className="mb-12">
            <div className="flex items-center gap-4 mb-6">
              <div className="flex-1 h-3 bg-slate-700 rounded-full"></div>
              <div className="flex-1 h-3 bg-green-600 rounded-full"></div>
              <div className="flex-1 h-3 bg-slate-400 rounded-full"></div>
            </div>

            <div className="grid grid-cols-3 gap-6">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-3 h-3 rounded-full bg-slate-700"></div>
                  <p className="font-600 text-slate-900">البيانات الرسمية</p>
                </div>
                <p className="text-sm text-slate-600">من السجلات الحكومية والجهات الرسمية المعتمدة</p>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-3 h-3 rounded-full bg-green-600"></div>
                  <p className="font-600 text-slate-900">تقارير المجتمع</p>
                </div>
                <p className="text-sm text-slate-600">تقارير موثقة من قبل مستخدمين مسجلين مصدقين</p>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-3 h-3 rounded-full bg-slate-400"></div>
                  <p className="font-600 text-slate-900">تقييم الخدمة</p>
                </div>
                <p className="text-sm text-slate-600">من خلال تقييمات والتجارب المباشرة للمستخدمين</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-green-600 py-20 rounded-2xl mx-7 my-20">
        <div className="max-w-2xl mx-auto text-center text-white">
          <h2 className="text-3xl font-900 mb-4">جاهز لاتخاذ قرارات تجارية أكثر أماناً؟</h2>
          <p className="mb-8 text-green-50">
            ابدأ الآن واستفيد "عرف" لكي تحمي اختياراتك التجارية بناءً على بيانات موثوقة
          </p>
          <Link href="/auth/register">
            <Button variant="outline" className="bg-white text-green-600 hover:bg-slate-100">
              إنشاء حساب مجاني
            </Button>
          </Link>
        </div>
      </section>

      {/* Dark Section - معلومات إضافية */}
      <section className="bg-slate-900 text-white py-20">
        <div className="max-w-7xl mx-auto px-7">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            <div>
              <h3 className="text-2xl font-900 mb-6">معلومات عن "مرصد"</h3>
              <p className="text-slate-300 mb-4">
                هذه منصة متخصصة تقيم موثوقية الشركات والمتاجر الإلكترونية بناءً على البيانات الرسمية والتقارير المجتمعية المتحققة منها
              </p>
              <div className="space-y-2 text-slate-300">
                <p>✓ بيانات من جهات حكومية معتمدة</p>
                <p>✓ تقارير من مستخدمين مسجلين مصدقين</p>
                <p>✓ تحليلات شاملة وموثوقة</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-8">
              <div>
                <div className="text-3xl font-900 text-white mb-2">1M+</div>
                <p className="text-slate-300">تقرير موثوق</p>
              </div>
              <div>
                <div className="text-3xl font-900 text-white mb-2">50K+</div>
                <p className="text-slate-300">مستخدم نشط</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-950 text-white py-12 border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-7">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center font-bold">
                  ✓
                </div>
                <span className="text-xl font-900">مرصد</span>
              </div>
              <p className="text-slate-400 text-sm">منصة تقييم موثوقية الأعمال</p>
            </div>

            <div>
              <h4 className="font-700 mb-4 text-sm">المنصة</h4>
              <ul className="space-y-2 text-slate-400 text-sm">
                <li><a href="#" className="hover:text-white">الدليل</a></li>
                <li><a href="#" className="hover:text-white">الأسعار</a></li>
                <li><a href="#" className="hover:text-white">الأمان</a></li>
              </ul>
            </div>

            <div>
              <h4 className="font-700 mb-4 text-sm">الشركة</h4>
              <ul className="space-y-2 text-slate-400 text-sm">
                <li><a href="#" className="hover:text-white">عن المنصة</a></li>
                <li><a href="#" className="hover:text-white">المدونة</a></li>
                <li><a href="#" className="hover:text-white">تواصل معنا</a></li>
              </ul>
            </div>

            <div>
              <h4 className="font-700 mb-4 text-sm">قانوني</h4>
              <ul className="space-y-2 text-slate-400 text-sm">
                <li><a href="#" className="hover:text-white">الشروط</a></li>
                <li><a href="#" className="hover:text-white">الخصوصية</a></li>
                <li><a href="#" className="hover:text-white">سياسة الاستخدام</a></li>
              </ul>
            </div>
          </div>

          <div className="border-t border-slate-800 pt-8 text-center text-slate-500 text-sm">
            <p>&copy; 2024 مرصد. جميع الحقوق محفوظة.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
