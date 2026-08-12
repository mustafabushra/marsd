import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { Suspense, useState, useEffect } from 'react'
import DeferredSkeleton from './DeferredSkeleton'
import { useNavDrawer } from '../hooks/useNavDrawer'
import { SkeletonPage } from './Skeleton'
import { UserButton } from '@clerk/react'
import NotificationBell from './NotificationBell'
import { getSupabase } from '../lib/api'
import { useEntitlements } from '../hooks/useEntitlements'
// Only the two leading entries carry an icon. The grouped items below never
// did — six more were imported for a menu that no longer exists.
import { DashboardIcon } from './icons'

// Grouped by the work, not by the kind of screen.
//
// The first pass grouped by subject and that was already better than sorting by
// "analytics" and "advanced administration". The sharper reading is that an
// administrator does not want a documents screen — they want to review a
// company, or clear a queue, or check a batch of paperwork. Those are three
// different jobs and the menu should name them.
//
// Documents used to get their own top-level entry, on the reasoning that the
// work is document-shaped — you verify a hundred without opening a hundred
// companies. That reasoning still holds and the screen is unchanged; what
// changed is that it now sits with the other seven queues instead of alone,
// because "a queue of things waiting for a decision" describes it exactly, and
// a section of one was a section that only added a line to the menu.
//
// "المراجعة" rather than "مركز المراجعة", because there is one مركز in this
// menu and it is مركز العمل. Two things called a centre, one of which is a
// heading over a list and the other a screen, is the ambiguity this pass exists
// to remove.
//
// "إدارة الشركات" was "قائمة الشركات", which described the markup rather than
// the work — and left two neighbouring entries whose names did not say how they
// differed. They read one source, company_roster, through two lenses:
//
//   إدارة الشركات  — the registry as it stands. Who is listed, what the trust
//                     score says, which accounts are suspended, and the actions
//                     that change that.
//   سجلّ الشركات    — the same companies ordered by what they are waiting on.
//                     A queue, worked top to bottom until it is empty.
//
// Management goes first because it is the one you open when you already know
// which company you want.
//
// Paths are still untouched. Only names and grouping move.

// Two screens lead, and only two.
//
// مركز القيادة says whether anything is wrong and where to go; مركز العمل is
// the queue you work. That is the whole of a day, and everything below is
// opened on purpose rather than out of habit.
//
// المؤشرات used to sit here as a third. It answers «how are we doing» — a
// question worth asking weekly, not one you open the panel to ask — and a
// third permanent entry beside two daily ones invites the question of which
// of the three is the real starting point. It moves down to التحليلات, beside
// the other screens that answer that same question at other scales.
const TOP_ITEMS = [
  { label: 'مركز القيادة', icon: DashboardIcon, path: '/admin/command-center', badgeKey: 'urgent', badgeBg: '#DC2626' },
]

// One section heading, over the five groups that are the supervisory work.
//
// التحليلات and below are not under it: they are how the platform is run, not
// what is being watched. A heading that covers everything names nothing.
const GROUPS = [
  { key: 'companies', section: 'الكيانات والرقابة', title: 'الشركات',
    badgeKey: 'unclaimed', badgeWord: 'غير مطالب بها', badgeBg: '#F59E0B', items: [
    { label: 'كل الشركات', path: '/admin/companies' },
    { label: 'طلبات الشركات', path: '/admin/company-requests' },
    // The registry screen already filters on claimed_by; this is that filter as
    // a link rather than a thing you have to know to press.
    { label: 'الشركات غير المطالب بها', path: '/admin/companies?filter=unclaimed' },
    { label: 'البحث الموحد', path: '/admin/roster' },
  ] },

  // The queues, gathered and labelled as what they are.
  //
  // مركز العمل exists to be one queue over all of them — admin_work_items
  // returns every kind in one shape. But it was added beside these rather than
  // in front of them, and the menu gave no sign of the relationship: several
  // top-level entries, the same request visible in two of them, and nothing
  // saying which to open. That is a menu problem rather than a code one —
  // every one of these screens works, and each is where its own decision is
  // made, with the evidence.
  //
  // So nothing is removed. They are indented under a line that names the
  // relationship: work from مركز العمل, come here for one kind on its own.
  //
  // التحقق من الشركات was in that indented block and did not belong there. The
  // block promises that everything under it also appears in مركز العمل, and
  // this screen does not — because it is not a queue of requests at all.
  // Nobody asks to be verified; Marsad decides to audit, in bulk, and grants
  // or withdraws the badge. A promise that is true of seven entries and false
  // of the eighth is worse than no promise, so it gets its own line saying
  // what it actually is. The individual decision still lives in Company 360;
  // this is the screen for doing many at once.
  { key: 'review', title: 'المراجعة', badgeKey: 'pending', badgeWord: 'معلق', badgeBg: '#F59E0B', items: [
    { label: 'صندوق المراجعة', path: '/admin/work' },
    { label: 'طلبات الانضمام', path: '/admin/company-approval' },
    { label: 'طلبات الملكية', path: '/admin/claim-requests' },
    { label: 'التحقق من الشركات', path: '/admin/company-verification' },
  ] },

  { key: 'reports', title: 'التقارير', badgeKey: 'reviews', badgeWord: 'قيد المراجعة', badgeBg: '#F59E0B', items: [
    { label: 'التقارير', path: '/admin/reports' },
    // The one queue, narrowed to this kind — `?kind=` is read by مركز العمل.
    { label: 'تقارير قيد المراجعة', path: '/admin/work?kind=report_review' },
    { label: 'الاعتراضات', path: '/admin/disputes' },
    { label: 'مستودع الأدلة', path: '/admin/knowledge-base/reports' },
  ] },

  // The document screen's own tabs, as links. `?tab=` matches TABS in
  // AdminDocuments exactly — pending / expired / rejected.
  { key: 'documents', title: 'المستندات', badgeKey: 'docs', badgeWord: 'تنبيه', badgeBg: '#F59E0B', items: [
    { label: 'المستندات', path: '/admin/documents' },
    { label: 'المستندات قيد الفحص', path: '/admin/documents?tab=pending' },
    { label: 'المستندات المنتهية', path: '/admin/documents?tab=expired' },
    { label: 'المستندات المرفوضة', path: '/admin/documents?tab=rejected' },
  ] },

  { key: 'watch', title: 'المراقبة', badgeKey: 'trust', badgeWord: 'تنبيه ثقة', badgeBg: '#DC2626', items: [
    { label: 'قوائم المراقبة', path: '/admin/fraud-detection' },
    { label: 'تنبيهات مؤشر الثقة', path: '/admin/trust-score' },
    { label: 'تغييرات الشركات', path: '/admin/data-management' },
  ] },
  { key: 'analytics', title: 'التحليلات', items: [
    { label: 'مؤشر الثقة', path: '/admin/trust-score' },
    { label: 'تحليلات الشركات', path: '/admin/tenant-analytics' },
    { label: 'تحليلات التقارير', path: '/admin/report-analytics' },
  ] },

  { key: 'platform', title: 'المنصة', items: [
    { label: 'المستخدمون', path: '/admin/users' },
    { label: 'حسابات الشركات', path: '/admin/tenants' },
    { label: 'الاستيراد', path: '/admin/bulk-import' },
    { label: 'دليل الأنشطة', path: '/admin/activities' },
    { label: 'الإعدادات', path: '/admin/settings' },
  ] },

  { key: 'system', title: 'النظام', items: [
    { label: 'سجل النشاط', path: '/admin/logs' },
    { label: 'حالة النظام', path: '/admin/system-health' },
    // Both entries in the design resolve to سجل العمليات — it is the only
    // screen over audit_logs that exists. Left pointing at the real screen
    // rather than at a `?view=audit` that nothing reads.
    { label: 'Audit Log', path: '/admin/logs' },
  ] },

  // Everything the new menu does not name, kept reachable.
  //
  // These are working screens with working routes. Dropping the links would
  // not delete them — it would only mean the sole way in is to type the URL,
  // and a screen nobody can find is a screen that rots. Collapsed by default,
  // so the menu above still reads as the design intends.
  { key: 'more', title: 'أدوات إضافية', items: [
    { header: 'التقارير والبيانات' },
    { label: 'إضافة تقرير', path: '/admin/add-report', indent: true },
    { label: 'مستودع الشركات', path: '/admin/knowledge-base/companies', indent: true },
    { label: 'طلبات تصحيح من المستخدمين', path: '/admin/requests', badgeKey: 'requests', badgeBg: '#DC2626', indent: true },
    { label: 'إدارة البيانات', path: '/admin/data-management', indent: true },
    { label: '⚡ استيراد من السجل التجاري', path: '/admin/registry-import', indent: true },
    { label: 'تصدير البيانات', path: '/admin/data-export', indent: true },
    { header: 'الحسابات والاشتراكات' },
    { label: 'مسؤولو المنصة', path: '/admin/admin-users', indent: true },
    { label: 'سجل المساهمين', path: '/admin/fraud-detection', indent: true },
    { label: 'الباقات', path: '/admin/plans', indent: true },
    { label: 'الاشتراكات', path: '/admin/subscriptions', indent: true },
    { label: 'الشركاء', path: '/admin/partners', indent: true },
    { label: 'المدفوعات', path: '/admin/payments', indent: true },
    { header: 'التشغيل' },
    { label: 'الدعم الفني', path: '/admin/support', indent: true },
    { label: '🔒 نماذج البريد', path: '/admin/email-templates', indent: true },
    { label: '🔒 التكاملات', path: '/admin/integrations', indent: true },
  ] },
]

const SCREEN_LABELS = {
  '/admin': 'مؤشرات المنصة',
  '/admin/command-center': 'مركز الإجراءات',
  '/admin/work': 'صندوق المراجعة الموحد',
  '/admin/requests': 'طلبات تصحيح بيانات من المستخدمين',
  '/admin/reports': 'مراجعة التقارير',
  '/admin/company-requests': 'طلبات الشركات — تسجيل وملكية وتصحيح',
  '/admin/registry-import': 'استيراد من السجل التجاري',
  '/admin/add-report': 'إضافة تقرير باسم مرصد',
  '/admin/bulk-import': 'رفع دفعة شركات',
  '/admin/companies': 'إدارة الشركات',
  '/admin/users': 'إدارة المستخدمين',
  '/admin/logs': 'سجل العمليات',
  '/admin/admin-users': 'مسؤولو المنصة',
  '/admin/plans': 'إدارة الباقات',
  '/admin/payments': 'المدفوعات والاشتراكات',
  '/admin/partners': 'برنامج الشركاء',
  '/admin/activities': 'دليل الأنشطة الاقتصادية',
  '/admin/settings': 'الإعدادات',
  '/admin/report-analytics': 'تحليلات التقارير',
  '/admin/tenant-analytics': 'تحليلات الشركات',
  '/admin/trust-score': 'تحليلات مؤشر الثقة',
  '/admin/roster': 'سجلّ الشركات وحالاتها',
  '/admin/company': 'ملفّ الشركة',
  '/admin/disputes': 'الاعتراضات على التقارير',
  '/admin/documents': 'المستندات والحالة الرسمية',
  '/admin/data-export': 'تصدير البيانات',
  '/admin/company-approval': 'مراجعة طلبات التسجيل',
  '/admin/claim-requests': 'طلبات ملكية الشركات',
  '/admin/company-verification': 'التحقق من الشركات',
  '/admin/knowledge-base/companies': 'مستودع الشركات',
  '/admin/knowledge-base/reports': 'مستودع التقارير',
  '/admin/fraud-detection': 'سجل المساهمين ومعالجة البلاغات الكيدية',
  '/admin/integrations': 'التكاملات (قيد التطوير)',
  '/admin/email-templates': 'نماذج البريد (قيد التطوير)',
  '/admin/system-health': 'حالة النظام',
  '/admin/data-management': 'إدارة بيانات السجل التجاري',
  '/admin/support': 'بلاغات الدعم الفني',
}

export default function AdminShell({ user }) {
  const navigate = useNavigate()
  const { entitlements } = useEntitlements()

  // Whether this administrator also belongs to a company. Most do not.
  const hasCompany = !!entitlements?.tenantId
  const location = useLocation()
  const path = location.pathname

  // The sidebar is 268px of a 360px phone. Below 1024px the stylesheet takes it
  // out of the flow and this opens it. Closed on every navigation: leaving it
  // over the page the user just asked for is how this pattern usually goes
  // wrong.
  const [navOpen, setNavOpen] = useNavDrawer()
  useEffect(() => { setNavOpen(false) }, [path])

  // Several entries are the same screen carrying a filter — `?tab=expired`,
  // `?kind=report_review`. The router matches on pathname alone, so comparing
  // the whole string would leave every one of them permanently inactive.
  // Highlight on the path, then on the query only when the entry asks for one.
  const search = location.search
  const isActive = (full) => {
    const [p, q] = String(full).split('?')
    const onPath = p === '/admin' ? path === '/admin' : path === p || path.startsWith(p + '/')
    if (!onPath) return false
    if (!q) return true
    const want = new URLSearchParams(q)
    const have = new URLSearchParams(search)
    return [...want].every(([k, v]) => have.get(k) === v)
  }

  // For a group heading: is any child the current screen, ignoring filters.
  const onScreen = (full) => {
    const p = String(full).split('?')[0]
    return p === '/admin' ? path === '/admin' : path === p || path.startsWith(p + '/')
  }
  const currentLabel = SCREEN_LABELS[
    Object.keys(SCREEN_LABELS).sort((a, b) => b.length - a.length).find(isActive)
  ] || 'لوحة تحكم الإدارة'

  const [openGroups, setOpenGroups] = useState({})
  // Takes what the group is showing right now, rather than reading state that
  // is still undefined for a group opened by the active screen. Without it, the
  // first click on such a group writes `true` over an already-open group and
  // looks like the header does nothing.
  const toggleGroup = (key, isOpen) => setOpenGroups((s) => ({ ...s, [key]: !isOpen }))

  // Live badge counts.
  //
  // One RPC instead of three table reads. `admin_work_counts` already breaks
  // the queue down by kind, and it is the same function مركز الإجراءات reads —
  // so a badge here and a tile there cannot disagree, which is the failure this
  // shell had when each computed its own totals.
  const [counts, setCounts] = useState({})
  const urgent = counts.urgent || 0

  useEffect(() => {
    let alive = true
    const load = async () => {
      const supabase = getSupabase()

      // Each of the three is allowed to fail on its own. A badge that cannot be
      // computed is simply absent; it must never take the navigation with it.
      const work = await supabase.rpc('admin_work_counts').then((r) => r.data, () => null)
      const k = work?.by_kind || {}

      // Both company badges from one roster read, and from the same rows
      // مركز الإجراءات uses for its trust tile. Counting low trust from
      // `trust_scores` instead would include companies that are not approved,
      // and the badge would quietly disagree with the tile it sits beside.
      const roster = await supabase.rpc('company_roster')
        .then((r) => (r.data || []).filter((c) => c.approved), () => null)

      if (!alive) return
      setCounts({
        urgent: work?.all || 0,
        requests: k.data_update || 0,
        pending: (k.registration || 0) + (k.claim || 0) + (k.document_review || 0),
        reviews: (k.report_review || 0) + (k.dispute || 0),
        docs: k.document_review || 0,
        trust: (roster || []).filter((c) => c.trust_score != null && Number(c.trust_score) < 50).length,
        unclaimed: (roster || []).filter((c) => !c.claimed_by).length,
      })
    }
    load()
    return () => { alive = false }
  }, [path])

  return (
    <div dir="rtl" style={{ fontFamily: 'Tajawal, system-ui, sans-serif', background: '#F8FAFC', minHeight: '100vh', display: 'flex', color: '#0F172A' }}>
      {/* Skip link. Both shells put a sidebar of 15+ links before the content, so
          a keyboard user tabs through the entire navigation on every page before
          reaching anything. WCAG 2.4.1. Visible only when focused — it is for
          people who cannot see it. */}
      <a href="#main" style={{
        position: 'absolute', insetInlineStart: '-9999px', top: '8px', zIndex: 1000,
        background: '#1E2A52', color: '#fff', padding: '10px 18px', borderRadius: '9px',
        fontSize: '14px', fontWeight: 800, textDecoration: 'none',
      }} onFocus={(e) => { e.target.style.insetInlineStart = '8px' }}
         onBlur={(e) => { e.target.style.insetInlineStart = '-9999px' }}>
        تخطَّ إلى المحتوى
      </a>
      {/* Sidebar */}
      {/* Tapping beside an open overlay closes it — the expected way out. */}
      {navOpen && <div className="marsad-scrim" onClick={() => setNavOpen(false)} />}

      <aside className="marsad-sidebar" data-open={navOpen} style={{ width: '288px', background: '#0B1220', flex: 'none', display: 'flex', flexDirection: 'column', padding: '22px 16px', position: 'sticky', top: 0, height: '100vh', overflowY: 'auto' }}>
        {/* Logo */}
        <div onClick={() => navigate('/admin')} style={{ display: 'flex', alignItems: 'center', gap: '11px', padding: '0 8px 22px', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,.08)', marginBottom: '16px' }}>
          <span style={{ display: 'inline-flex', background: '#fff', borderRadius: '9px', padding: '5px', flex: 'none' }}>
            <svg width="26" height="26" viewBox="0 0 64 64">
              <defs>
                <linearGradient id="mkAd" x1="0" y1="1" x2="1" y2="0">
                  <stop offset="0" stopColor="#1E2A52" />
                  <stop offset=".55" stopColor="#1F6E43" />
                  <stop offset="1" stopColor="#16A34A" />
                </linearGradient>
              </defs>
              <circle cx="32" cy="32" r="22.5" fill="none" stroke="url(#mkAd)" strokeWidth="6.4" strokeLinecap="round" strokeDasharray="118 24" transform="rotate(-46 32 32)" />
              <path d="M22.5 33 l6.5 6.5 L41 26.5" fill="none" stroke="#16A34A" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <div>
            <div style={{ fontWeight: 900, fontSize: '20px', color: '#fff', lineHeight: 1 }}>مرصد</div>
            <div style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 700, letterSpacing: '.5px' }}>حوكمة وشفافية</div>
          </div>
        </div>

        {/* Portal switcher.
            One account can hold both jobs — running Marsad and belonging to a
            company on it — which is why CompanyRoute stopped redirecting staff
            away. The two portals were reached by a «return to the other one»
            button at the foot of each sidebar, which reads as an exit rather
            than a switch, and put the two halves of one product on different
            footings. Same navigation, said as what it is, at the top. */}
        <div role="tablist" aria-label="التبديل بين اللوحتين"
          style={{
            display: 'flex', gap: '4px', padding: '4px', marginBottom: '14px',
            background: 'rgba(255,255,255,.06)', borderRadius: '999px',
            border: '1px solid rgba(255,255,255,.10)',
          }}>
          <span role="tab" aria-selected="true"
            style={{
              flex: 1, textAlign: 'center', padding: '8px 10px', borderRadius: '999px',
              background: '#1E2A52', color: '#fff', fontSize: '12.5px', fontWeight: 800,
            }}>لوحة الإدارة</span>
          <button role="tab" aria-selected="false"
            onClick={() => navigate('/dashboard')}
            style={{
              flex: 1, textAlign: 'center', padding: '8px 10px', borderRadius: '999px',
              background: 'transparent', border: 0, color: '#94A3B8',
              fontSize: '12.5px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
            }}>لوحة الشركات</button>
        </div>

        {/* Who is looking. The header carried «وضع المسؤول» in a purple that
            belongs to no part of this identity; a role belongs beside the
            portal it applies to, not beside the page title. */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px', padding: '0 4px 14px',
          marginBottom: '14px', borderBottom: '1px solid rgba(255,255,255,.08)',
        }}>
          <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#16A34A', flex: 'none' }} />
          <span style={{ fontSize: '12px', color: '#CBD5E1', fontWeight: 700 }}>مشرف تدقيق وحوكمة</span>
        </div>

        {/* Nav */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
          {TOP_ITEMS.map((item) => {
            const Icon = item.icon
            const active = isActive(item.path)
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                style={{
                  background: active ? '#16A34A' : 'transparent', border: 0,
                  color: active ? '#fff' : '#CBD5E1', padding: '12px 15px', fontSize: '14.5px',
                  fontWeight: active ? 800 : 600, textAlign: 'right', cursor: 'pointer', borderRadius: '11px',
                  display: 'flex', alignItems: 'center', gap: '12px', fontFamily: 'inherit',
                }}
                onMouseEnter={(e) => { if (!active) { e.currentTarget.style.background = 'rgba(255,255,255,.06)'; e.currentTarget.style.color = '#fff' } }}
                onMouseLeave={(e) => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#CBD5E1' } }}
              >
                <span style={{ display: 'flex', alignItems: 'center', flex: 'none', color: 'inherit' }}><Icon /></span>
                <span style={{ flex: 1 }}>{item.label}</span>
                {item.badgeKey && counts[item.badgeKey] > 0 && (
                  <span style={{ background: item.badgeBg, color: '#fff', borderRadius: '999px', padding: '1px 8px', fontSize: '11px', fontWeight: 800 }}>{counts[item.badgeKey]}</span>
                )}
              </button>
            )
          })}

          {/* Collapsible groups */}
          {GROUPS.map((g) => {
            const hasActive = g.items.some((i) => i.path && onScreen(i.path))
            // «أدوات إضافية» stays shut unless you are standing in it. Every
            // other group opens when it holds the current screen.
            const open = openGroups[g.key] ?? hasActive
            const n = g.badgeKey ? counts[g.badgeKey] : 0
            return (
              <div key={g.key}>
                {/* A heading over the groups, not a group itself — it has no
                    items and nothing to collapse. */}
                {g.section && (
                  <div style={{
                    fontSize: '10.5px', fontWeight: 800, color: '#64748B',
                    letterSpacing: '.6px', padding: '18px 10px 2px',
                  }}>{g.section}</div>
                )}
                <div
                  onClick={() => toggleGroup(g.key, open)}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '11px 10px 11px 8px', marginTop: '8px', cursor: 'pointer', borderTop: '1px solid rgba(255,255,255,.06)', fontSize: '12px', fontWeight: 800, color: hasActive ? '#fff' : '#94A3B8' }}
                >
                  <span style={{ flex: 'none' }}>{g.title}</span>
                  {/* The number and what it counts. «2» alone tells you
                      something is there but not whether it needs you. */}
                  {n > 0 && (
                    <span style={{
                      background: g.badgeBg, color: '#fff', borderRadius: '999px',
                      padding: '2px 8px', fontSize: '10px', fontWeight: 800,
                      whiteSpace: 'nowrap', flex: 'none',
                    }}>{n} {g.badgeWord}</span>
                  )}
                  <span style={{ flex: 1 }} />
                  <span style={{ display: 'inline-block', transition: 'transform .15s', transform: `rotate(${open ? '180deg' : '0deg'})`, color: '#64748B', fontSize: '10px', flex: 'none' }}>▾</span>
                </div>
                <div style={{ display: open ? 'flex' : 'none', flexDirection: 'column', gap: '2px', paddingBottom: '4px' }}>
                  {g.items.map((it, idx) => {
                    if (it.header) {
                      return <div key={`h-${idx}`} style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', padding: '10px 15px 4px' }}>{it.header}</div>
                    }
                    const active = isActive(it.path)
                    return (
                      <button
                        key={`${it.path}-${idx}`}
                        onClick={() => navigate(it.path)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '10px',
                          padding: it.indent ? '10px 34px 10px 15px' : '10px 15px', borderRadius: '10px',
                          fontSize: '13.5px', fontWeight: active ? 800 : 600, cursor: 'pointer', border: 0,
                          width: '100%', textAlign: 'right', fontFamily: 'inherit',
                          background: active ? '#16A34A' : 'transparent', color: active ? '#fff' : '#94A3B8',
                        }}
                        onMouseEnter={(e) => { if (!active) { e.currentTarget.style.background = 'rgba(255,255,255,.06)'; e.currentTarget.style.color = '#fff' } }}
                        onMouseLeave={(e) => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#94A3B8' } }}
                      >
                        {it.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </nav>

        {/* Back to the company app.
            It always went to /dashboard, which needs a company — so for an
            administrator who has none it was a button leading to an empty
            screen, and once /dashboard started redirecting them it led straight
            back here. It now goes where there is something to see: the
            administrator's own dashboard if they have a company, and the search
            that opens every trust report if they do not. The label says which. */}
        <button
          onClick={() => navigate(hasCompany ? '/dashboard' : '/search')}
          style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)', borderRadius: '11px', padding: '11px 14px', color: '#CBD5E1', fontSize: '13.5px', fontWeight: 700, cursor: 'pointer', marginTop: '14px', fontFamily: 'inherit' }}
        >
          ↩ {hasCompany ? 'العودة لواجهة الشركة' : 'الانتقال للبحث وتقارير الثقة'}
        </button>
      </aside>

      {/* Main */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        {/* Same three-column header as the company shell — `1fr auto 1fr` centres
            the search by construction and pins each side to its own edge. Two
            shells that put the same control in two different places is one
            product that behaves like two. */}
        <header className="marsad-appbar" style={{ background: '#fff', borderBottom: '1px solid #E2E8F0', padding: '0 32px', minHeight: '68px', display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: '24px', position: 'sticky', top: 0, zIndex: 30 }}>
          <div className="marsad-nowrap" style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, justifySelf: 'start' }}>
            {/* Shown only where the sidebar is an overlay. */}
            <button
              className="marsad-nav-toggle"
              onClick={() => setNavOpen(true)}
              aria-label="فتح القائمة"
              aria-expanded={navOpen}
              style={{
                alignItems: 'center', justifyContent: 'center', background: '#F8FAFC',
                border: '1px solid #E2E8F0', borderRadius: '10px', width: '40px',
                height: '40px', fontSize: '17px', cursor: 'pointer',
                fontFamily: 'inherit', flex: 'none',
              }}>
              ☰
            </button>
            <div style={{ fontSize: '18px', fontWeight: 900, color: '#0F172A', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentLabel}</div>
            {/* The role moved to the sidebar, beside the portal it applies to.
                What belongs here is what needs doing: the two counts this shell
                already fetches, as one control that goes where the work is. It
                appears only when there is work — a permanent «0» is a thing the
                eye learns to skip, and then it skips the 7 as well. */}
            {urgent > 0 && (
              <button
                onClick={() => navigate('/admin/work')}
                title={`${urgent} عنصراً بانتظار قرار`}
                style={{
                  display: 'flex', alignItems: 'center', gap: '7px', flex: 'none',
                  background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '999px',
                  padding: '5px 12px 5px 8px', cursor: 'pointer', fontFamily: 'inherit',
                }}>
                <span style={{
                  background: '#DC2626', color: '#fff', borderRadius: '999px',
                  minWidth: '20px', height: '20px', display: 'inline-flex',
                  alignItems: 'center', justifyContent: 'center',
                  fontSize: '11.5px', fontWeight: 900, fontVariantNumeric: 'tabular-nums',
                  animation: 'marsadPulse 2s ease-in-out infinite',
                }}>{urgent}</span>
                <span style={{ fontSize: '12.5px', fontWeight: 800, color: '#B91C1C' }}>
                  يحتاج قراراً
                </span>
              </button>
            )}
          </div>

          {/* A keyboard shortcut nobody knows about is a shortcut nobody uses.
              Clickable as well as advertised, because not everyone reaches for
              the keyboard — and on a touch screen there is no Ctrl at all. */}
          <button className="marsad-command-button"
            onClick={() => window.dispatchEvent(
              new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))}
            title="ابحث أو نفّذ أمراً"
            style={{ display: 'flex', alignItems: 'center', gap: '11px', background: '#F8FAFC',
                     border: '1px solid #E2E8F0', borderRadius: '11px', padding: '12px 18px',
                     cursor: 'pointer', fontFamily: 'inherit', color: '#64748B', fontSize: '14px',
                     fontWeight: 600, width: 'min(520px, 100%)', minWidth: '340px' }}>
            <span style={{ flex: 'none' }}>🔍</span>
            <span style={{ flex: 1, textAlign: 'start', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              ابحث عن شركة أو نفّذ أمراً…
            </span>
            <kbd style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '5px',
                          padding: '1px 6px', fontSize: '10.5px', fontWeight: 800, direction: 'ltr',
                          color: '#94A3B8', flex: 'none' }}>
              Ctrl K
            </kbd>
          </button>

          {/* justifySelf pins the bell and the avatar to the corner of the
              header, whatever the title beside them does. */}
          <div className="marsad-appbar-actions" style={{ display: 'flex', alignItems: 'center', gap: '14px', justifySelf: 'end' }}>
            <NotificationBell />
            <UserButton
              afterSignOutUrl="/"
              appearance={{ elements: { avatarBox: 'w-10 h-10', userButtonBox: 'flex-row-reverse' } }}
            />
          </div>
        </header>

        {/* Content */}
        <main id="main" style={{ padding: '28px 32px', flex: 1 }}>
          {/* The boundary lives here, not around <Routes>. Around the routes it
              took the sidebar and header down on every navigation and rebuilt
              them — the page appeared to reload when only its content had
              changed. */}
          <Suspense fallback={<DeferredSkeleton><SkeletonPage /></DeferredSkeleton>}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  )
}
