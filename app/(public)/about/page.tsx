import Link from 'next/link'
import Button from '@/components/Button'

export default function AboutPage() {
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

      {/* Content */}
      <div className="max-w-4xl mx-auto px-7 py-16">
        <h1 className="text-5xl font-900 text-slate-900 mb-8">من نحن</h1>

        <div className="prose max-w-none space-y-6 text-lg text-slate-600">
          <p>
            <strong>مرصد</strong> هي منصة رائدة في تقييم موثوقية الأعمال، تجمع بين البيانات الحكومية الرسمية والتقارير المجتمعية الموثوقة لتقديم صورة شاملة عن أي شركة.
          </p>

          <h2 className="text-2xl font-900 text-slate-900 mt-8">رؤيتنا</h2>
          <p>
            نؤمن بأن المستهلكين والمتعاملين يحق لهم الوصول إلى معلومات موثوقة وشفافة عن الشركات والمؤسسات. نسعى لبناء اقتصاد أكثر ثقة وكفاءة حيث يتمكن كل شخص من اتخاذ قرارات مستنيرة.
          </p>

          <h2 className="text-2xl font-900 text-slate-900 mt-8">قيمنا</h2>
          <ul className="list-disc list-inside space-y-2">
            <li><strong>الشفافية:</strong> نعتقد أن الشفافية هي أساس الثقة</li>
            <li><strong>الموثوقية:</strong> كل بيانة يتم التحقق منها بدقة</li>
            <li><strong>الخصوصية:</strong> حماية بيانات المستخدمين أولويتنا</li>
            <li><strong>الابتكار:</strong> نستمر في تطوير تقنيات أفضل</li>
            <li><strong>العدالة:</strong> نعامل جميع الشركات بنفس المعايير</li>
          </ul>

          <h2 className="text-2xl font-900 text-slate-900 mt-8">قصتنا</h2>
          <p>
            بدأت مرصد من حاجة بسيطة: توفير طريقة سهلة وموثوقة للتحقق من سمعة الشركات. مع الوقت، نمت المنصة لتصبح المرجع الموثوق للملايين من المستخدمين.
          </p>

          <h2 className="text-2xl font-900 text-slate-900 mt-8">فريقنا</h2>
          <p>
            يتكون فريقنا من خبراء في مجالات متنوعة بما فيها البيانات، التكنولوجيا، الأمان، والامتثال التنظيمي. نعمل معاً لضمان أفضل خدمة لمستخدمينا.
          </p>
        </div>

        <div className="mt-16 bg-slate-50 p-8 rounded-lg text-center">
          <h3 className="text-2xl font-700 text-slate-900 mb-4">هل تريد الانضمام إلينا؟</h3>
          <p className="text-slate-600 mb-6">نحن نبحث عن مواهب استثنائية لمساعدتنا في تحقيق رؤيتنا</p>
          <Button>
            <Link href="/careers">اعرف الوظائف المتاحة</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
