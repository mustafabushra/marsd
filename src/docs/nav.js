/**
 * شجرة التوثيق — مصدر واحد.
 *
 * ============================================================================
 * لماذا ملفّ واحد لا أربعة
 * ============================================================================
 * الشريط الجانبي، ومسار التنقّل (breadcrumb)، وأزرار «السابق/التالي»، وخريطة
 * الموقع، وفهرس البحث — خمسة أشياء تصف الترتيب نفسه. وخمس نسخ منه تفترق عند
 * أول صفحة تُضاف: تظهر في الشريط ولا تظهر في «التالي»، أو تُفهرَس ولا تُعرض.
 *
 * فالترتيب هنا مرّة واحدة، وكلّها تُشتقّ منه.
 *
 * ============================================================================
 * والعناوين هنا لا في المحتوى
 * ============================================================================
 * عنوان الصفحة في الشريط قد يختلف عن عنوانها في أعلاها: «رفع المستندات» في
 * الصفحة و«الرفع» في الشريط الضيّق. فالقصير هنا، والكامل في ملفّ المحتوى.
 */

/**
 * كل مجموعة: `{ id, title, audience, pages: [{ slug, title }] }`
 *
 * و`slug` هو المسار تحت `/docs` وتحت `content/docs/<lang>/` معاً — فاسم الملف
 * هو العنوان، ولا خريطة ثالثة بينهما تُنسى.
 *
 * ============================================================================
 * الجمهور مُعلَن
 * ============================================================================
 * DOC للمستخدمين أوّلاً: من يبحث عن شركة، أو يرفع مستنداً، أو يقرأ درجة ثقة.
 * وقسمٌ واحد فيه — الواجهة البرمجية — مكتوبٌ لمن يتكامل برمجياً.
 *
 * وخلطهما بلا إشارة يُتعب الطرفين: المستخدم يقرأ SQL لا يعنيه، والمطوّر يبحث
 * عن مرجع بين شروحٍ عامّة. فالوسم `audience` يجعل ذلك مرئياً في الشريط.
 */
export const NAV = [
  {
    id: 'getting-started',
    title: { ar: 'البداية', en: 'Getting started' },
    audience: 'user',
    pages: [
      { slug: 'getting-started/introduction', title: { ar: 'مقدّمة', en: 'Introduction' } },
      { slug: 'getting-started/quickstart', title: { ar: 'البدء السريع', en: 'Quickstart' } },
    ],
  },
  {
    id: 'companies',
    title: { ar: 'الشركات', en: 'Companies' },
    audience: 'user',
    pages: [
      { slug: 'companies/search', title: { ar: 'البحث', en: 'Search' } },
      { slug: 'companies/profile', title: { ar: 'ملفّ الشركة', en: 'Company profile' } },
      { slug: 'companies/trust-score', title: { ar: 'درجة الثقة', en: 'Trust score' } },
      { slug: 'companies/monitoring', title: { ar: 'المتابعة', en: 'Monitoring' } },
    ],
  },
  {
    id: 'documents',
    title: { ar: 'المستندات', en: 'Documents' },
    audience: 'user',
    pages: [
      { slug: 'documents/overview', title: { ar: 'نظرة عامّة', en: 'Overview' } },
      { slug: 'documents/upload', title: { ar: 'الرفع', en: 'Upload' } },
      { slug: 'documents/verification', title: { ar: 'التدقيق', en: 'Verification' } },
      { slug: 'documents/security', title: { ar: 'أمن المستندات', en: 'Security' } },
      { slug: 'documents/status', title: { ar: 'الحالات', en: 'Status' } },
    ],
  },
  {
    id: 'security',
    title: { ar: 'الأمن', en: 'Security' },
    audience: 'user',
    pages: [
      { slug: 'security/overview', title: { ar: 'نظرة عامّة', en: 'Overview' } },
      { slug: 'security/authentication', title: { ar: 'المصادقة', en: 'Authentication' } },
      { slug: 'security/authorization', title: { ar: 'التصريح', en: 'Authorization' } },
      { slug: 'security/file-security', title: { ar: 'بوّابة الملفّات', en: 'File security' } },
      { slug: 'security/malware-scanning', title: { ar: 'فحص البرمجيات الخبيثة', en: 'Malware scanning' } },
      { slug: 'security/quarantine', title: { ar: 'الحجر', en: 'Quarantine' } },
      { slug: 'security/storage', title: { ar: 'التخزين', en: 'Storage' } },
    ],
  },
  {
    id: 'api',
    title: { ar: 'الواجهة البرمجية', en: 'API' },
    audience: 'developer',
    pages: [
      { slug: 'api/overview', title: { ar: 'نظرة عامّة', en: 'Overview' } },
      { slug: 'api/authentication', title: { ar: 'المصادقة', en: 'Authentication' } },
      { slug: 'api/companies', title: { ar: 'الشركات', en: 'Companies' } },
      { slug: 'api/documents', title: { ar: 'المستندات', en: 'Documents' } },
      { slug: 'api/verification', title: { ar: 'التدقيق', en: 'Verification' } },
      { slug: 'api/webhooks', title: { ar: 'Webhooks', en: 'Webhooks' } },
    ],
  },
  {
    id: 'dashboard',
    title: { ar: 'لوحة التحكّم', en: 'Dashboard' },
    audience: 'user',
    pages: [
      { slug: 'dashboard/overview', title: { ar: 'نظرة عامّة', en: 'Overview' } },
      { slug: 'dashboard/companies', title: { ar: 'الشركات', en: 'Companies' } },
      { slug: 'dashboard/documents', title: { ar: 'المستندات', en: 'Documents' } },
      { slug: 'dashboard/reports', title: { ar: 'التقارير', en: 'Reports' } },
      { slug: 'dashboard/settings', title: { ar: 'الإعدادات', en: 'Settings' } },
    ],
  },
]

/** كل الصفحات على التوالي — لِما يحتاج ترتيباً خطّياً. */
export const FLAT = NAV.flatMap((g) =>
  g.pages.map((p) => ({ ...p, group: g.id, groupTitle: g.title })))

export const pageAt = (slug) => FLAT.find((p) => p.slug === slug) || null

/** الجارتان في الترتيب — لأزرار «السابق» و«التالي». */
export const neighbours = (slug) => {
  const i = FLAT.findIndex((p) => p.slug === slug)
  if (i < 0) return { prev: null, next: null }
  return { prev: FLAT[i - 1] || null, next: FLAT[i + 1] || null }
}

export const groupOf = (slug) => NAV.find((g) => g.pages.some((p) => p.slug === slug)) || null

/** المسار الظاهر في العنوان: `/docs/...` بالعربية و`/docs/en/...` بالإنجليزية. */
export const hrefFor = (slug, lang) => (lang === 'en' ? `/docs/en/${slug}` : `/docs/${slug}`)

/** أول صفحة — وجهة `/docs` المجرّدة. */
export const HOME_SLUG = FLAT[0].slug
