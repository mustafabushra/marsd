
// mockPricingTiers lived here and drove the public /pricing page: four cards of
// hand-written prices that said 99 ر.س where the plan row says 1499, and listed
// three plans that are switched off. The page now reads public_plans(), so the
// prices a visitor sees are the prices in the system. mockKPIs went with it —
// nothing had rendered it in a long time.
export const mockCompanies = [
  {
    id: 1,
    name: 'شركة نجد للمقاولات',
    sector: 'مقاولات',
    city: 'الرياض',
    registry: '1010123456',
    trustScore: 82,
    reports: 12,
    risk: 'منخفض',
    lastUpdate: '2026-07-10',
    gaugeBg: 'conic-gradient(#16A34A 0% 82%, #E2E8F0 82% 100%)',
  },
  {
    id: 2,
    name: 'الرياض للتجارة',
    sector: 'تجارة',
    city: 'الرياض',
    registry: '1010789456',
    trustScore: 65,
    reports: 5,
    risk: 'متوسط',
    lastUpdate: '2026-07-08',
    gaugeBg: 'conic-gradient(#F59E0B 0% 65%, #E2E8F0 65% 100%)',
  },
  {
    id: 3,
    name: 'التقنية المتقدمة',
    sector: 'تقنية',
    city: 'جدة',
    registry: '1010456789',
    trustScore: 45,
    reports: 2,
    risk: 'عالي',
    lastUpdate: '2026-07-05',
    gaugeBg: 'conic-gradient(#DC2626 0% 45%, #E2E8F0 45% 100%)',
  },
  {
    id: 4,
    name: 'الشرق للتوريد',
    sector: 'توريد',
    city: 'الدمام',
    registry: '1010111222',
    trustScore: 78,
    reports: 8,
    risk: 'منخفض',
    lastUpdate: '2026-07-09',
    gaugeBg: 'conic-gradient(#16A34A 0% 78%, #E2E8F0 78% 100%)',
  },
  {
    id: 5,
    name: 'الخليج للخدمات',
    sector: 'خدمات',
    city: 'الرياض',
    registry: '1010333444',
    trustScore: 91,
    reports: 15,
    risk: 'منخفض جداً',
    lastUpdate: '2026-07-11',
    gaugeBg: 'conic-gradient(#16A34A 0% 91%, #E2E8F0 91% 100%)',
  },
  {
    id: 6,
    name: 'شركة الخليج العربي',
    sector: 'استيراد/تصدير',
    city: 'الرياض',
    registry: '1010555666',
    trustScore: 0,
    reports: 0,
    risk: 'بيانات غير كافية',
    lastUpdate: null,
    gaugeBg: 'conic-gradient(#94A3B8 0% 0%, #E2E8F0 0% 100%)',
  },
]


export const mockActivity = [
  {
    title: 'تقرير معتمد — شركة الرياض للتجارة',
    time: 'قبل ساعتين',
    dot: '#16A34A',
  },
  {
    title: 'بحث عن شركة جديدة',
    time: 'قبل 4 ساعات',
    dot: '#F59E0B',
  },
  {
    title: 'إضافة شركة للسجل',
    time: 'أمس',
    dot: '#3B82F6',
  },
  {
    title: 'ترقية الباقة إلى الاحترافية',
    time: 'قبل 3 أيام',
    dot: '#16A34A',
  },
  {
    title: 'إنشاء حساب',
    time: 'قبل 5 أيام',
    dot: '#8B5CF6',
  },
]


export const mockFAQs = [
  // This answer described a three-layer model that did not exist: the score was
  // computed entirely from approved community reports, and published on a public
  // page as 50% community — under a sentence promising it was hard to
  // manipulate. Migration 062 built the layers. The wording below now describes
  // what runs, and says what each layer is made of, because a percentage a
  // reader cannot check is the same claim in a shorter form.
  {
    q: 'كيف يُحسب مؤشر الثقة؟',
    a: 'من ثلاث طبقات. البيانات الرسمية (30%): حالة السجل التجاري وتوثيق مرصد للشركة. تجربة المجتمع (50%): التقارير المعتمَدة من إدارة مرصد فقط — نسبة السداد الكامل ترفع، وحالات عدم السداد وأيام التأخير تخفض. تحليل المنصّة (20%): تنوّع الجهات المُبلِّغة وحداثة التقارير واكتمال سجلّ الشركة. وتنوّع المُبلِّغين تحديداً هو ما يجعل المؤشر صعب التلاعب: ستة تقارير من جهة واحدة رأيٌ مكرَّر، وستة من ست جهات نمط.',
  },
  {
    q: 'متى يظهر مؤشر الثقة لشركة؟',
    a: 'يحتاج تقريرين معتمَدين على الأقل. أقلّ من ذلك تُعرض الشركة بـ«بيانات غير كافية» — وهذا ليس تقييماً منخفضاً بل غياب تقييم. من تقريرين إلى أربعة يكون المؤشر أوّلياً، ومن خمسة فأكثر يصبح كاملاً.',
  },
  {
    q: 'هل يؤثّر تقرير قيد المراجعة على المؤشر؟',
    a: 'لا. التقرير لا يدخل الحساب إلا بعد اعتماده من إدارة مرصد، والتقرير المرفوض لا يؤثّر إطلاقاً. وإذا قُبل اعتراض شركة على تقرير، يخرج من الحساب ويُعاد احتساب مؤشرها.',
  },
  {
    q: 'هل بيانات الشركات المُبلّغ عنها سرية؟',
    a: 'نعم، لا تُعرض أبداً أسماء الشركات المبلّغة. تظهر المؤشرات بشكل مجمّع وسرّي فقط، لحماية المساهمين وتشجيع المشاركة الصادقة.',
  },
  {
    q: 'كم تكلفة الاشتراك؟',
    a: 'نوفر 4 باقات: مجاني (تقارير 3 شركات/شهر)، أساسي (99 ر.س)، احترافي (299 ر.س)، ومؤسسات (مخصص). بالإضافة إلى برنامج الشركاء المختارة. اختر ما يناسب احتياجاتك.',
  },
  {
    q: 'هل يمكنني تغيير الباقة؟',
    a: 'نعم، يمكنك ترقية أو تخفيف الباقة في أي وقت. التغيير يسري من اليوم التالي.',
  },
  {
    q: 'ماذا عن سياسة الاسترجاع؟',
    a: 'نوفر ضمان استرجاع 30 يوم. إذا لم تكن راضياً، نسترجع كامل المبلغ بدون أسئلة.',
  },
  {
    q: 'هل هناك دعم تقني؟',
    a: 'نعم، جميع الباقات تشمل دعماً عبر البريد. الباقة الاحترافية والمؤسسات تشمل دعماً أولوياً.',
  },
  {
    q: 'هل يمكنني تصدير التقارير؟',
    a: 'نعم، في الباقات الأساسية والاحترافية يمكنك تحميل التقارير كـ PDF.',
  },
  {
    q: 'هل هناك تكامل مع نظام حسابات؟',
    a: 'نعم، نوفر API في باقة المؤسسات. اتصل بنا لمعرفة التفاصيل.',
  },
]
