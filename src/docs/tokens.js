/**
 * رموز التوثيق — امتدادٌ لهويّة مرصد لا هويّة ثانية.
 *
 * ============================================================================
 * لماذا امتداد لا نظام مستقلّ
 * ============================================================================
 * DOC داخل مرصد لا بجانبه. فلونه الأساسي هو لون مرصد، وخطّه خطّه (Tajawal
 * محمَّل في index.html)، وحدود بطاقاته من BORDER_RADIUS نفسه.
 *
 * وما يُضاف هنا مقصورٌ على ما يحتاجه التوثيق ولا وجود له في التطبيق: مقاسات
 * نصّ القراءة الطويلة، وعرض عمود المحتوى، وألوان كتل الشيفرة.
 *
 * ============================================================================
 * عرض القراءة
 * ============================================================================
 * ٧٢٠ بكسل تقريباً — ما يقارب ٧٥ إلى ٩٠ حرفاً في السطر بالعربية عند هذا
 * المقاس. أوسع من ذلك يُتعب تتبّع السطر، وأضيق يُكثر القفز.
 */
import { COLORS, BORDER_RADIUS } from '../theme/themeConstants'

export const DOC = {
  // من هويّة مرصد
  brand: COLORS.primary,          // #1E2A52
  accent: COLORS.success,         // #16A34A
  border: COLORS.border,          // #E2E8F0

  // نصّ
  ink: '#0F172A',
  body: '#334155',
  muted: '#64748B',
  faint: '#94A3B8',

  // أسطح
  bg: '#FFFFFF',
  subtle: '#F8FAFC',
  rail: '#FCFDFE',

  // كتل الشيفرة — داكنة دائماً، وهو مقصود: الشيفرة تُقرأ كوحدة مستقلّة عن
  // الصفحة، والتباين الثابت يجعل التلوين مقروءاً في كل سياق.
  code: {
    bg: '#0F172A',
    ink: '#E2E8F0',
    dim: '#64748B',
    keyword: '#93C5FD',
    string: '#86EFAC',
    number: '#FCD34D',
    comment: '#64748B',
    punct: '#94A3B8',
    tabBg: '#1E293B',
  },

  radius: BORDER_RADIUS,

  // مقاسات
  readWidth: '720px',
  sidebarWidth: '268px',
  tocWidth: '236px',
  headerHeight: '60px',

  // نصّ القراءة الطويلة
  text: {
    size: '15.5px',
    line: 1.95,
    h1: '30px',
    h2: '21px',
    h3: '17px',
    small: '13px',
    mono: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
  },
}

/** ألوان النداءات الخمسة. */
export const CALLOUT = {
  info: { bg: '#EFF6FF', border: '#BFDBFE', ink: '#1E3A8A', mark: '#1D4ED8', label: { ar: 'معلومة', en: 'Note' } },
  tip: { bg: '#F0FDF4', border: '#BBF7D0', ink: '#14532D', mark: '#16A34A', label: { ar: 'نصيحة', en: 'Tip' } },
  success: { bg: '#ECFDF5', border: '#A7F3D0', ink: '#065F46', mark: '#059669', label: { ar: 'تمّ', en: 'Success' } },
  warning: { bg: '#FFFBEB', border: '#FDE68A', ink: '#92400E', mark: '#B45309', label: { ar: 'تنبيه', en: 'Warning' } },
  danger: { bg: '#FEF2F2', border: '#FECACA', ink: '#7F1D1D', mark: '#B91C1C', label: { ar: 'تحذير', en: 'Danger' } },
}

/** ألوان طرق HTTP في مرجع الواجهة. */
export const METHOD = {
  GET: { bg: '#EFF6FF', ink: '#1D4ED8' },
  POST: { bg: '#ECFDF5', ink: '#15803D' },
  PUT: { bg: '#FFFBEB', ink: '#B45309' },
  PATCH: { bg: '#FFFBEB', ink: '#B45309' },
  DELETE: { bg: '#FEF2F2', ink: '#B91C1C' },
}
