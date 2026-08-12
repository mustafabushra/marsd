import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { Suspense, useState, useEffect } from 'react'
import DeferredSkeleton from './DeferredSkeleton'
import { useNavDrawer } from '../hooks/useNavDrawer'
import { SkeletonPage } from './Skeleton'
import { UserButton } from '@clerk/react'
import NotificationBell from './NotificationBell'
import { getSupabase } from '../lib/api'
import { useEntitlements } from '../hooks/useEntitlements'
import {
  DashboardIcon,
  DocumentIcon,
  ListIcon,
  UploadIcon,
  BuildingIcon,
  UsersIcon,
  LogIcon,
} from './icons'

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

// مركز العمل had a route and no way in. It was reachable only by typing the
// URL, which means the one screen that answers «what should I do next» was
// invisible to anyone who did not already know it existed. It sits beside
// مركز القيادة because they are the same job split in two: the command centre
// says what the state of things is, the work centre is the queue you work.
// The two screens a day is worked from lead, and the charts follow them.
//
// «لوحة التحكم» sat first and «مركز القيادة» second, which read as two names
// for one thing and made people ask which was the real one. They answer
// different questions — the charts answer «how are we doing», the command
// centre answers «is anything wrong and where do I go» — and the names did not
// say that. «المؤشرات» does, and it goes below the two screens that are opened
// every morning rather than above them.
const TOP_ITEMS = [
  { label: 'مركز القيادة', icon: DashboardIcon, path: '/admin/command-center' },
  { label: 'مركز العمل', icon: DashboardIcon, path: '/admin/work' },
  { label: 'المؤشرات', icon: DashboardIcon, path: '/admin' },
]

const GROUPS = [
  { key: 'companies', title: 'الشركات', items: [
    { label: 'إدارة الشركات', path: '/admin/companies' },
    { label: 'سجلّ الشركات', path: '/admin/roster' },
    { label: 'مستودع الشركات', path: '/admin/knowledge-base/companies' },
  ] },

  // The eight queues, gathered and labelled as what they are.
  //
  // مركز العمل exists to be one queue over all of them — admin_work_items
  // returns the six kinds in one shape. But it was added beside these rather
  // than in front of them, and the menu gave no sign of the relationship:
  // seven top-level entries, the same request visible in two of them, and
  // nothing saying which to open. That is the confusion, and it is a menu
  // problem rather than a code one — every one of these screens works, and
  // each is where its own decision is made, with the evidence.
  //
  // So nothing is removed. They are indented under a line that names the
  // relationship: work from مركز العمل, come here for one kind on its own.
  { key: 'review', title: 'المراجعة', items: [
    { header: 'كلّها تجتمع في «مركز العمل»' },
    { label: 'مراجعة التسجيل', path: '/admin/company-approval', indent: true },
    { label: 'طلبات الشركات', path: '/admin/company-requests', indent: true },
    { label: 'طلبات الملكية', path: '/admin/claim-requests', indent: true },
    { label: 'التحقق من الشركات', path: '/admin/company-verification', indent: true },
    { label: 'المستندات والحالة الرسمية', path: '/admin/documents', indent: true },
    { label: 'مراجعة التقارير', path: '/admin/reports', badgeKey: 'reviews', badgeBg: '#F59E0B', indent: true },
    { label: 'الاعتراضات', path: '/admin/disputes', indent: true },
    // Renamed. «طلبات إضافة وتعديل» beside «طلبات الشركات» were two vague
    // names over two different tables, and reading either one told you nothing
    // about which held what. This one is company_data_requests: a person on the
    // search page asking Marsad to add or correct a company that is already
    // listed. The other is a company's own request about itself.
    { label: 'طلبات تصحيح من المستخدمين', path: '/admin/requests', badgeKey: 'requests', badgeBg: '#DC2626', indent: true },
  ] },

  { key: 'reports', title: 'التقارير', items: [
    { label: 'إضافة تقرير', path: '/admin/add-report' },
    { label: 'مستودع التقارير', path: '/admin/knowledge-base/reports' },
  ] },
  { key: 'analytics', title: 'التحليلات', items: [
    { label: 'تحليلات الشركات', path: '/admin/tenant-analytics' },
    { label: 'تحليلات التقارير', path: '/admin/report-analytics' },
    { label: 'مؤشر الثقة', path: '/admin/trust-score' },
  ] },
  { key: 'billing', title: 'الاشتراكات', items: [
    { label: 'الباقات', path: '/admin/plans' },
    { label: 'الاشتراكات', path: '/admin/subscriptions' },
    { label: 'الشركاء', path: '/admin/partners' },
    { label: 'المدفوعات', path: '/admin/payments' },
  ] },
  { key: 'platform', title: 'المنصة', items: [
    // إدارة البيانات goes above the two importers because it is where you look
    // to find out what the register currently is, and the importers are how you
    // change it. Reading before writing.
    { label: 'إدارة البيانات', path: '/admin/data-management' },
    { label: 'الاستيراد الجماعي', path: '/admin/bulk-import' },
    { label: '⚡ استيراد من السجل التجاري', path: '/admin/registry-import' },
    { label: 'المستخدمون', path: '/admin/users' },
    { label: 'حسابات الشركات', path: '/admin/tenants' },
    { label: 'مسؤولو المنصة', path: '/admin/admin-users' },
    { label: 'الدعم الفني', path: '/admin/support' },
    { label: 'دليل الأنشطة', path: '/admin/activities' },
    { label: 'الإعدادات', path: '/admin/settings' },
    { header: 'المراقبة' },
    { label: 'السجلات', path: '/admin/logs', indent: true },
    { label: 'حالة النظام', path: '/admin/system-health', indent: true },
    { label: 'سجل المساهمين', path: '/admin/fraud-detection', indent: true },
    { header: 'أدوات' },
    { label: 'تصدير البيانات', path: '/admin/data-export', indent: true },
    { label: '🔒 نماذج البريد', path: '/admin/email-templates', indent: true },
    { label: '🔒 التكاملات', path: '/admin/integrations', indent: true },
  ] },
]

const SCREEN_LABELS = {
  '/admin': 'المؤشرات',
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

  const isActive = (p) => (p === '/admin' ? path === '/admin' : path === p || path.startsWith(p + '/'))
  const currentLabel = SCREEN_LABELS[
    Object.keys(SCREEN_LABELS).sort((a, b) => b.length - a.length).find(isActive)
  ] || 'لوحة تحكم الإدارة'

  const [openGroups, setOpenGroups] = useState({})
  const toggleGroup = (key) => setOpenGroups((s) => ({ ...s, [key]: !s[key] }))

  // Live badge counts (real pending work)
  const [counts, setCounts] = useState({ requests: 0, reviews: 0 })
  // What the urgent-action control shows. Summed from the counts already
  // fetched rather than a third query — two numbers that must agree with the
  // sidebar badges beside them.
  const urgent = (counts.requests || 0) + (counts.reviews || 0)
  useEffect(() => {
    const load = async () => {
      try {
        const supabase = getSupabase()
        const [pendingCompanies, pendingData, pendingReports] = await Promise.all([
          supabase.from('companies').select('id', { count: 'exact', head: true }).eq('approved', false),
          supabase.from('company_data_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending').then((r) => r, () => ({ count: 0 })),
          supabase.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'pending_review'),
        ])
        setCounts({
          requests: (pendingCompanies.count || 0) + (pendingData.count || 0),
          reviews: pendingReports.count || 0,
        })
      } catch (e) { /* non-blocking */ }
    }
    load()
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
            const hasActive = g.items.some((i) => i.path && isActive(i.path))
            const open = openGroups[g.key] || hasActive
            return (
              <div key={g.key}>
                <div
                  onClick={() => toggleGroup(g.key)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 10px 11px 8px', marginTop: '8px', cursor: 'pointer', borderTop: '1px solid rgba(255,255,255,.06)', fontSize: '12px', fontWeight: 800, color: hasActive ? '#fff' : '#94A3B8' }}
                >
                  <span>{g.title}</span>
                  <span style={{ display: 'inline-block', transition: 'transform .15s', transform: `rotate(${open ? '180deg' : '0deg'})`, color: '#64748B', fontSize: '10px' }}>▾</span>
                </div>
                <div style={{ display: open ? 'flex' : 'none', flexDirection: 'column', gap: '2px', paddingBottom: '4px' }}>
                  {g.items.map((it, idx) => {
                    if (it.header) {
                      return <div key={`h-${idx}`} style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', padding: '10px 15px 4px' }}>{it.header}</div>
                    }
                    const active = isActive(it.path)
                    return (
                      <button
                        key={it.path}
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
