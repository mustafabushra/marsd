/**
 * لغة التصميم البصرية للوحة الإدارة — بهوية مرصد.
 *
 * الأشكال والمسافات مأخوذة من نموذج service-7871.ai.studio، أما الألوان
 * والخطوط فمن مرصد نفسه: القيم أدناه هي حرفياً متغيّرات :root في
 * styles/index.css. مكتوبة هنا كـ JS لأن الأنماط في هذا المشروع inline،
 * ولا يمكن لـ inline style قراءة var() بلا عنصر أب يحملها.
 *
 * ⚠ إن تغيّر أي لون في :root فغيّره هنا معه. مصدر الحقيقة هو ملف CSS،
 *   وهذا الملف صدى له.
 *
 * لماذا ليست ستة ألوان كالنموذج: لوحة مرصد أربعة ألوان تحمل معنى، لا طيف
 * زخرفي. فالبلاطات تتلوّن بما تعنيه — أحمر لِما هو غير سليم، برتقالي لِما
 * ينتظر قراراً، كحلي للإجراء الرسمي. تكرار اللون هنا مقصود: يجمع البلاطات
 * حسب الإلحاح بدل أن يمنح كل واحدة لوناً لا يقول شيئاً.
 */

// ---------------------------------------------------------------------------
// هوية مرصد — مطابقة لـ :root في styles/index.css
// ---------------------------------------------------------------------------
export const NAVY = '#1E2A52'
export const GREEN = '#16A34A'
export const RED = '#DC2626'
export const ORANGE = '#F59E0B'

/** الرماديات كما يستخدمها مرصد اليوم. */
export const S = {
  50: '#F8FAFC',   // --color-sky
  100: '#F1F5F9',
  200: '#E2E8F0',  // --color-gray-light
  300: '#CBD5E1',
  400: '#94A3B8',  // --color-gray-mid
  500: '#64748B',  // --color-gray-dark
  600: '#475569',  // --color-text-secondary
  700: '#334155',
  800: '#1E293B',
  900: '#0F172A',  // --color-text-primary
  950: '#080D1A',
}

/** الشريط الجانبي — أعمق من كل الرماديات، كما كان في مرصد. */
export const SIDEBAR = '#0B1220'

/** الكحلي بدرجاته — لون الإجراء الأساسي. */
export const BRAND = {
  50: '#EEF2F8', 100: '#D8E0EE', 200: '#B6C3DC',
  400: '#4A5A87', 500: '#2C3B69', 600: NAVY, 700: '#17203E', 800: '#111931',
}

/** الأخضر — الحالة النشطة والموثَّقة. */
export const OK = {
  50: '#F0FDF4', 100: '#DCFCE7', 200: '#BBF7D0',
  400: '#4ADE80', 500: '#22C55E', 600: GREEN, 700: '#15803D',
}

/**
 * درجات البلاطات الملوّنة — ثلاث نبرات تحمل معنى.
 */
export const TONE = {
  red:    { bg: '#FEF2F2', bd: '#FECACA', fg: RED,    tx: '#991B1B', hover: '#FEE2E2' },
  orange: { bg: '#FFFBEB', bd: '#FDE68A', fg: '#B45309', tx: '#92400E', hover: '#FEF3C7' },
  navy:   { bg: BRAND[50], bd: BRAND[100], fg: NAVY,  tx: BRAND[800], hover: BRAND[100] },
  green:  { bg: OK[50],    bd: OK[200],    fg: OK[700], tx: '#166534', hover: OK[100] },
}

/** شارات الأقسام على الشريط الداكن — من ألوان مرصد لا من طيف Tailwind. */
export const DARK_BADGE = {
  orange: { bg: 'rgba(245,158,11,.18)', fg: '#FCD34D', bd: 'rgba(245,158,11,.32)' },
  red:    { bg: 'rgba(220,38,38,.18)',  fg: '#FCA5A5', bd: 'rgba(220,38,38,.32)' },
  green:  { bg: 'rgba(22,163,74,.18)',  fg: '#86EFAC', bd: 'rgba(22,163,74,.32)' },
  sky:    { bg: 'rgba(148,163,184,.18)', fg: '#CBD5E1', bd: 'rgba(148,163,184,.32)' },
}

/** خط مرصد. */
export const FONT = 'Tajawal, system-ui, -apple-system, sans-serif'

export const card = {
  background: '#fff',
  border: `1px solid ${S[200]}`,
  borderRadius: '16px',
  boxShadow: '0 1px 2px 0 rgba(15,23,42,.05)',
  minWidth: 0,
}

export const innerCard = {
  background: S[50],
  border: `1px solid ${S[100]}`,
  borderRadius: '12px',
}

export const btnBase = {
  borderRadius: '12px',
  fontFamily: 'inherit',
  cursor: 'pointer',
  fontSize: '13px',
  fontWeight: 800,
  padding: '10px 20px',
  transition: 'background .15s',
  border: 0,
}

export const btnPrimary = { ...btnBase, background: NAVY, color: '#fff' }
export const btnGhost = {
  ...btnBase, background: '#fff', color: S[700],
  border: `1.5px solid ${S[200]}`, fontWeight: 700,
}

// أسماء متوافقة مع ما كُتب سابقاً، حتى لا يبقى استيراد معلّق.
export const BLUE = BRAND
export const EMERALD = { 50: OK[50], 200: OK[200], 500: OK[600], 600: OK[600], 700: OK[700] }
