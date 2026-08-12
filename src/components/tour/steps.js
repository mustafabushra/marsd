/**
 * The tour, written against elements that exist.
 *
 * ============================================================================
 * Every anchor here was read out of the source, not assumed
 * ============================================================================
 * Each `target` is a `data-tour` attribute placed on an element that is already
 * on the screen — the sidebar entries CompanyShell renders, the KPI row and the
 * two panels CompanyDashboard renders, the notification bell and the command
 * button in the header, and the support launcher. Nothing here describes a
 * feature Marsad does not have.
 *
 * ============================================================================
 * A missing anchor is normal, not a failure
 * ============================================================================
 * Half of these elements are conditional. CompanyShell hides every
 * company-scoped nav entry from a staff account with no company; «إضافة تقرير»
 * is disabled without the entitlement; the dashboard is not even reachable for
 * an account with no tenant. So a step whose target is absent is skipped
 * silently and the tour renumbers itself. A tour that stops on a missing
 * element would break for exactly the people who have the least idea what to do
 * next.
 *
 * `route` is where the step is shown. The tour only ever runs on /dashboard, so
 * steps that describe another screen point at the sidebar entry that leads
 * there rather than navigating away mid-explanation — being moved between pages
 * by a tooltip is disorienting, and coming back is on the reader.
 */

export const TOUR_VERSION = 'company-v1'

export const STEPS = [
  {
    id: 'welcome',
    target: '[data-tour="dash-greeting"]',
    title: 'أهلاً بك في مرصد',
    body: 'جولة قصيرة على ما تستطيع فعله هنا. تقدر توقفها في أي لحظة، وتعيدها متى شئت من زرّ «جولة تعريفية».',
    placement: 'bottom',
  },
  {
    id: 'kpis',
    target: '[data-tour="dash-kpis"]',
    title: 'نشاطك في أرقام',
    body: 'ملخّص ما قدّمته وما يخصّ شركتك. الأرقام هنا تتحدّث مباشرةً من سجلّاتك — لا تُدخل يدوياً.',
    placement: 'bottom',
  },
  {
    id: 'search',
    target: '[data-tour="nav-search"]',
    title: 'ابحث عن أي شركة',
    body: 'بالاسم أو رقم السجل التجاري أو الرقم الموحّد. يبحث في سجلّ مرصد وفي السجل التجاري الرسمي معاً — وإن لم تكن الشركة مضافة، تضيفها من نتيجة البحث نفسها.',
    placement: 'start',
  },
  {
    id: 'add-report',
    target: '[data-tour="nav-add-report"]',
    title: 'شارك تجربتك',
    body: 'تقرير عن تعاملك مع شركة: هل سُدّد في موعده، وهل تأخّر، وكم. تجربتك هي ما يبني مؤشر الثقة لغيرك.',
    placement: 'start',
  },
  {
    id: 'reports-about-us',
    target: '[data-tour="nav-reports-about-us"]',
    title: 'ما يُقال عن شركتك',
    body: 'التقارير التي قدّمها آخرون عن شركتك. تراها كاملةً، وتستطيع الاعتراض على ما تراه غير صحيح.',
    placement: 'start',
  },
  {
    id: 'watchlist',
    target: '[data-tour="nav-watchlist"]',
    title: 'راقب من يهمّك',
    body: 'ضع الشركات التي تتعامل معها في قائمة مراقبة، ويصلك تنبيه حين يتغيّر مؤشر ثقتها.',
    placement: 'start',
  },
  {
    id: 'quick-actions',
    target: '[data-tour="dash-quick-actions"]',
    title: 'أسرع طريق',
    body: 'أكثر ما يُستخدَم، في ضغطة واحدة من هنا.',
    placement: 'start',
  },
  {
    id: 'activity',
    target: '[data-tour="dash-activity"]',
    title: 'آخر ما جرى',
    body: 'أحدث الأحداث المرتبطة بحسابك وشركتك، مرتّبةً بالأحدث.',
    placement: 'top',
  },
  {
    id: 'notifications',
    target: '[data-tour="hdr-notifications"]',
    title: 'التنبيهات',
    body: 'قرار على تقرير، أو تغيّر في مؤشر شركة تراقبها، أو طلب من إدارة مرصد — كلّه يصل هنا.',
    placement: 'bottom',
  },
  {
    id: 'command',
    target: '[data-tour="hdr-command"]',
    title: 'اختصار لكل شيء',
    body: 'اضغط Ctrl + K في أي وقت للبحث عن شركة أو الانتقال إلى أي شاشة دون استخدام القائمة.',
    placement: 'bottom',
  },
  {
    id: 'support',
    target: '[data-tour="support-fab"]',
    title: 'إن واجهتك مشكلة',
    body: 'هذا الزرّ يرافقك في كل شاشة. صف المشكلة وأرفق لقطة شاشة — تصل إلى إدارة مرصد مع الصفحة التي كنت فيها.',
    placement: 'top',
  },
]
