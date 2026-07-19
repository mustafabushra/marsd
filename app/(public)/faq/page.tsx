'use client'
import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import { useState } from 'react'

export default function FAQPage() {
  const faqs = [
    {
      category: 'الحساب والتسجيل',
      items: [
        {
          q: 'كيف أنشئ حساباً جديداً؟',
          a: 'انقر على "إنشاء حساب" في الصفحة الرئيسية، ثم أدخل بيانات الشركة والبريد الإلكتروني وكلمة المرور. ستتلقى رسالة تأكيد على بريدك الإلكتروني.',
        },
        {
          q: 'هل يمكن استخدام حساب واحد لعدة موظفين؟',
          a: 'نعم، يمكنك إضافة موظفين إلى حسابك من خلال إعدادات الشركة. كل موظف سيحصل على اسم مستخدم وكلمة مرور منفصلة.',
        },
        {
          q: 'نسيت كلمة المرور. كيف أستعيدها؟',
          a: 'انقر على "نسيت كلمة المرور" في صفحة تسجيل الدخول وأدخل بريدك الإلكتروني. ستتلقى رابطاً لإعادة تعيين كلمة المرور.',
        },
      ],
    },
    {
      category: 'البحث والشركات',
      items: [
        {
          q: 'كيف أبحث عن شركة؟',
          a: 'استخدم شريط البحث في الصفحة الرئيسية أو توجه إلى صفحة البحث. يمكنك البحث باسم الشركة أو القطاع أو المدينة.',
        },
        {
          q: 'ما هي درجة الثقة؟',
          a: 'درجة الثقة عبارة عن رقم من 0-100 يعكس موثوقية الشركة. تُحسب بناءً على البيانات الحكومية (30%)، التقارير المجتمعية (50%)، والتحليلات (20%).',
        },
        {
          q: 'كيف أضيف شركة جديدة؟',
          a: 'انقر على "إضافة شركة" من لوحة التحكم وملأ النموذج بمعلومات الشركة. بعد المراجعة من فريقنا، ستظهر الشركة في المنصة.',
        },
        {
          q: 'كيف أستورد شركات متعددة؟',
          a: 'استخدم ميزة "الاستيراج الجماعي" من قائمة الشركات. حضر ملف CSV يحتوي على بيانات الشركات واتبع خطوات الاستيراج الأربع.',
        },
      ],
    },
    {
      category: 'التقارير والتقييمات',
      items: [
        {
          q: 'كيف أرسل تقرير؟',
          a: 'انقر على "إضافة تقرير" واختر الشركة. صف تجربتك بصراحة. تقارير مجهولة وآمنة تماماً.',
        },
        {
          q: 'هل يمكن للآخرين معرفة من أرسل التقرير؟',
          a: 'لا، جميع التقارير مجهولة تماماً. نحن لا نكشف هوية المرسل تحت أي ظرف من الظروف.',
        },
        {
          q: 'كم من الوقت تستغرق مراجعة التقرير؟',
          a: 'عادة ما تستغرق المراجعة من 24 إلى 48 ساعة. نتحقق من جميع التقارير للتأكد من أنها حقيقية وموثوقة.',
        },
        {
          q: 'هل يمكن حذف تقريري؟',
          a: 'نعم، يمكنك طلب حذف تقريرك من خلال قسم التقارير الخاص بك أو التواصل معنا عبر البريد الإلكتروني.',
        },
      ],
    },
    {
      category: 'الاشتراكات والميزات',
      items: [
        {
          q: 'ما الفرق بين الخطط المختلفة؟',
          a: 'الخطة المجانية توفر 5 استعلامات شهرية. الخطة الاحترافية توفر 100 استعلام والمقارنة. الخطة المؤسسية توفر استعلامات غير محدودة.',
        },
        {
          q: 'هل يمكن تغيير الخطة لاحقاً؟',
          a: 'نعم، يمكنك الترقية أو الانتقال إلى خطة أقل في أي وقت. سيتم احتساب الفرق تناسبياً.',
        },
        {
          q: 'هل هناك ضمان استرجاع المال؟',
          a: 'نعم، نقدم ضمان استرجاع المال لمدة 30 يوماً من عند الاشتراك بدون أسئلة.',
        },
      ],
    },
    {
      category: 'الأمان والخصوصية',
      items: [
        {
          q: 'هل بيانات حسابي آمنة؟',
          a: 'نعم، نستخدم تشفير SSL/TLS ومعايير أمان دولية لحماية بيانات حسابك.',
        },
        {
          q: 'هل تبيع بيانات المستخدمين؟',
          a: 'لا، أبداً. نحن لا نبيع أو نشاركي بيانات المستخدمين مع أي طرف ثالث.',
        },
        {
          q: 'كيف أحذف حسابي؟',
          a: 'يمكنك حذف حسابك من صفحة الإعدادات. سيؤدي هذا إلى حذف جميع بياناتك بشكل دائم.',
        },
      ],
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

      {/* Header */}
      <div className="max-w-4xl mx-auto px-7 py-16 text-center">
        <h1 className="text-5xl font-900 text-slate-900 mb-4">الأسئلة الشائعة</h1>
        <p className="text-xl text-slate-600">
          جد إجابات على أسئلتك الشائعة حول مرصد
        </p>
      </div>

      {/* FAQs */}
      <div className="max-w-4xl mx-auto px-7 pb-16">
        {faqs.map((section, idx) => (
          <div key={idx} className="mb-12">
            <h2 className="text-2xl font-700 text-slate-900 mb-6">{section.category}</h2>

            <div className="space-y-4">
              {section.items.map((faq, fidx) => (
                <FAQItem key={fidx} question={faq.q} answer={faq.a} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div className="bg-slate-50 py-12">
        <div className="max-w-4xl mx-auto px-7 text-center">
          <h3 className="text-2xl font-700 text-slate-900 mb-4">لم تجد إجابة؟</h3>
          <p className="text-slate-600 mb-6">
            تواصل معنا مباشرة وسنرد على استفسارك في أسرع وقت ممكن
          </p>
          <a
            href="/contact"
            className="inline-block px-6 py-3 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 transition"
          >
            تواصل معنا
          </a>
        </div>
      </div>
    </div>
  )
}

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition"
      >
        <span className="text-lg font-600 text-slate-900 text-right">{question}</span>
        <ChevronDown
          size={20}
          className={`text-slate-600 flex-shrink-0 transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200">
          <p className="text-slate-700 text-right">{answer}</p>
        </div>
      )}
    </div>
  )
}
