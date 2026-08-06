import { Navigate, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { Suspense, useEffect, useState } from 'react'
import DeferredSkeleton from './DeferredSkeleton'
import { SkeletonPage } from './Skeleton'
import { UserButton } from '@clerk/react'
import NotificationBell from './NotificationBell'
import { useClerkOrganization } from '../hooks/useClerkOrganization'
import { useCompanyOnboarding } from '../hooks/useCompanyOnboarding'
import { useUserRole } from '../hooks/useUserRole'
import { useEntitlements } from '../hooks/useEntitlements'
import {
  DashboardIcon,
  SearchIcon,
  BuildingIcon,
  DocumentIcon,
  ListIcon,
  EyeIcon,
  CompareIcon,
  UsersIcon,
  CreditCardIcon,
  SettingsIcon,
  BellIcon
} from './icons'

/**
 * `gate` — CompanyStatusRouter has not yet decided whether this person belongs
 * here. The chrome is drawn so it does not appear and disappear around the
 * decision, and the content area holds a skeleton rather than the page, because
 * mounting the page would show a dashboard to someone about to be redirected.
 */
export default function CompanyShell({ user, gate = false }) {
  const navigate = useNavigate()
  const location = useLocation()

  // The sidebar is 268px of a 360px phone. Below 1024px the stylesheet takes it
  // out of the flow and this opens it. Closed on every navigation: leaving it
  // over the page the user just asked for is how this pattern usually goes
  // wrong.
  const [navOpen, setNavOpen] = useState(false)
  useEffect(() => { setNavOpen(false) }, [location.pathname])
  const { organizationName, userRole } = useClerkOrganization()
  const { needsOnboarding, loading } = useCompanyOnboarding()
  const { isPlatformAdmin, role, loading: roleLoading } = useUserRole()
  const { entitlements, loading: entLoading } = useEntitlements()

  // Marsad staff have no tenant, and that is not an unfinished sign-up. This was
  // the last of four places reading the same absence the same way.
  const isStaff = isPlatformAdmin || role === 'reviewer'

  // Whether this account belongs to a company is a different question from what
  // it is allowed to see. One account may hold both jobs.
  const hasCompany = !!entitlements?.tenantId

  const onDashboard = location.pathname.startsWith('/dashboard')

  // This used to render a loading message and stop there — no navigation ever
  // followed, so a user who reached it sat on "جاري التحميل..." forever. Do the
  // redirect the comment always promised.
  if (!loading && !roleLoading && !isStaff && needsOnboarding && onDashboard) {
    return <Navigate to="/company-onboarding" replace />
  }

  // Only when there is genuinely no company behind it. Redirecting every staff
  // member off /dashboard made "العودة لواجهة الشركة" bounce straight back to
  // the panel it came from — the button navigates here, and this sent it back.
  // An administrator who also belongs to a company has a real dashboard, and
  // gets it.
  if (!roleLoading && !entLoading && isStaff && !hasCompany && onDashboard) {
    return <Navigate to="/search" replace />
  }

  const screenLabels = {
    '/dashboard': 'لوحة التحكم',
    '/search': 'البحث عن الشركات',
    '/add-company': 'إضافة شركة للسجل',
    '/add-report': 'إضافة تقرير',
    '/my-reports': 'تقاريري المرسلة',
    '/my-companies': 'الشركات المُرسلة',
    '/trust-report': 'تقرير الشركة الكامل',
    '/watchlist': 'قوائم المراقبة',
    '/compare': 'مقارنة الشركات',
    '/users': 'إدارة المستخدمين',
    '/subscription': 'إدارة الاشتراك',
    '/profile': 'ملف الشركة',
    '/reports-about-us': 'تقارير عن شركتك',
    '/notifications': 'الإشعارات',
  }

  const matchedLabelKey = Object.keys(screenLabels).find(
    (key) => location.pathname === key || location.pathname.startsWith(key + '/')
  )
  const currentScreenLabel = screenLabels[matchedLabelKey] || 'لوحة التحكم'

  return (
    <div dir="rtl" style={{ fontFamily: 'Tajawal, system-ui, sans-serif', background: '#F8FAFC', display: 'flex', minHeight: '100vh', color: '#0F172A' }}>
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
      {/* Tapping beside an open overlay closes it — the expected way out, and
          the only one for a reader who does not think to look for the ☰ again. */}
      {navOpen && <div className="marsad-scrim" onClick={() => setNavOpen(false)} />}

      {/* Sidebar */}
      <aside className="marsad-sidebar" data-open={navOpen} style={{
        width: '268px',
        background: '#1E2A52',
        flex: 'none',
        display: 'flex',
        flexDirection: 'column',
        padding: '22px 16px',
        position: 'sticky',
        top: 0,
        height: '100vh',
        overflowY: 'auto'
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '11px', padding: '0 8px 22px', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,.1)', marginBottom: '16px' }}>
          <span style={{ display: 'inline-flex', background: '#fff', borderRadius: '9px', padding: '5px', flex: 'none' }}>
            <svg width="26" height="26" viewBox="0 0 64 64">
              <defs>
                <linearGradient id="mkCo" x1="0" y1="1" x2="1" y2="0">
                  <stop offset="0" stopColor="#1E2A52"></stop>
                  <stop offset=".55" stopColor="#1F6E43"></stop>
                  <stop offset="1" stopColor="#16A34A"></stop>
                </linearGradient>
              </defs>
              <circle cx="32" cy="32" r="22.5" fill="none" stroke="url(#mkCo)" strokeWidth="6.4" strokeLinecap="round" strokeDasharray="118 24" transform="rotate(-46 32 32)"></circle>
              <path d="M22.5 33 l6.5 6.5 L41 26.5" fill="none" stroke="#16A34A" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round"></path>
              <path d="M40 20.5 L50.5 13.5" fill="none" stroke="#16A34A" strokeWidth="6" strokeLinecap="round"></path>
              <path d="M45 12 L52 11 L51 18 Z" fill="#16A34A"></path>
            </svg>
          </span>
          <span style={{ fontWeight: 900, fontSize: '22px', color: '#fff' }}>مرصد</span>
        </div>

        {/* Nav Items.
            Two thirds of these are about a company the viewer belongs to — its
            reports, its watchlist, its users, its plan. A staff member with no
            company reaches "لا توجد شركة مرتبطة بحسابك" on every one, so they
            are not offered: a menu entry is a promise, and six of them leading
            nowhere is the same defect as a button with no handler. What is left
            is what works without a company, which is also what staff come here
            for. */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
          {[
            { label: 'لوحة التحكم', icon: DashboardIcon, path: '/dashboard', needsCompany: true },
            { label: 'البحث عن الشركات', icon: SearchIcon, path: '/search' },
            { label: 'إضافة شركة للسجل', icon: BuildingIcon, path: '/add-company' },
            { label: 'إضافة تقرير', icon: DocumentIcon, path: '/add-report', needsCompany: true },
            { label: 'تقاريري المرسلة', icon: ListIcon, path: '/my-reports', needsCompany: true },
            { label: 'الشركات المُرسلة', icon: BuildingIcon, path: '/my-companies', needsCompany: true },
            { label: 'تقارير عن شركتك', icon: DocumentIcon, path: '/reports-about-us', needsCompany: true },
            { label: 'قوائم المراقبة', icon: EyeIcon, path: '/watchlist', needsCompany: true },
            { label: 'مقارنة الشركات', icon: CompareIcon, path: '/compare' },
            { label: 'الإشعارات', icon: BellIcon, path: '/notifications' },
            { label: 'إدارة المستخدمين', icon: UsersIcon, path: '/users', needsCompany: true },
            { label: 'إدارة الاشتراك', icon: CreditCardIcon, path: '/subscription', needsCompany: true },
            { label: 'ملف الشركة', icon: SettingsIcon, path: '/profile', needsCompany: true },
          ].filter(item => !item.needsCompany || hasCompany || !isStaff).map(item => {
            const IconComponent = item.icon
            const isActive =
              location.pathname === item.path || location.pathname.startsWith(item.path + '/')
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                style={{
                  background: isActive ? '#16A34A' : 'transparent',
                  border: 0,
                  color: isActive ? '#fff' : '#CBD5E1',
                  padding: '12px 15px',
                  fontSize: '14.5px',
                  fontWeight: isActive ? 800 : 600,
                  textAlign: 'right',
                  cursor: 'pointer',
                  borderRadius: '11px',
                  transition: 'all .2s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  fontFamily: 'inherit'
                }}
                onMouseEnter={e => {
                  if (isActive) return
                  e.currentTarget.style.background = 'rgba(255,255,255,.08)'
                  e.currentTarget.style.color = '#fff'
                }}
                onMouseLeave={e => {
                  if (isActive) return
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.color = '#CBD5E1'
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', flex: 'none', color: 'inherit' }}>
                  <IconComponent />
                </span>
                {item.label}
              </button>
            )
          })}
        </nav>

        {/* The box at the foot of the sidebar.
            For a company it is the plan; for Marsad staff neither the company
            name nor the plan exists, and the way back to the panel did not
            either — the admin sidebar sends staff here and nothing sent them
            back, so reading one trust report meant being stranded in the
            company interface. */}
        {isStaff ? (
          <div style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)', borderRadius: '14px', padding: '16px', marginTop: '14px' }}>
            <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#fff', marginBottom: '4px' }}>
              إدارة مرصد
            </div>
            <div style={{ fontSize: '12px', color: '#64748B', marginBottom: '12px', lineHeight: 1.8 }}>
              تتصفّح واجهة الشركات — بلا حدود ولا خصم
            </div>
            <button
              onClick={() => navigate('/admin')}
              style={{ width: '100%', background: '#16A34A', color: '#fff', border: 0, borderRadius: '9px', padding: '9px', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              ↩ العودة للوحة الإدارة
            </button>
          </div>
        ) : (
          <div style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)', borderRadius: '14px', padding: '16px', marginTop: '14px' }}>
            <div style={{ fontSize: '14px', fontWeight: 800, color: '#fff', marginBottom: '5px' }}>
              {organizationName || 'الشركة'}
            </div>
            <div style={{ fontSize: '12.5px', color: '#64748B', marginBottom: '12px' }}>
              دور: {userRole || 'عضو'}
            </div>
            <button onClick={() => navigate('/subscription')} style={{ width: '100%', background: '#16A34A', color: '#fff', border: 0, borderRadius: '9px', padding: '9px', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>إدارة الباقة</button>
          </div>
        )}
      </aside>

      {/* Main */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <header style={{
          background: '#fff',
          borderBottom: '1px solid #E2E8F0',
          padding: '0 32px',
          height: '68px',
          // A three-column grid rather than a flex row.
          //
          // Flex splits what is left over, so the centre column is only truly
          // centred while both sides happen to be the same width — and the
          // moment the page title grows, the search box drifts and the avatar
          // stops sitting in the corner. `1fr auto 1fr` fixes both at once: the
          // middle is centred by construction, and each side owns its edge.
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr',
          alignItems: 'center',
          gap: '24px',
          position: 'sticky',
          top: 0,
          zIndex: 30
        }}>
          <div className="marsad-nowrap" style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: '10px', justifySelf: 'start' }}>
            {/* Shown only where the sidebar is an overlay. The stylesheet
                decides that; this is the way to open it. */}
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
            <span style={{ minWidth: 0, fontSize: '18px', fontWeight: 900, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {currentScreenLabel}
            </span>
          </div>

          {/* Opens the command palette rather than the search page.
              The palette searches the registry as well as the application, so
              typing a company's name still finds the company — which is what
              stops the new behaviour from making this label a lie. It also
              answers «كيف أضيف تقرير» in the same keystroke.

              Still a button, not only a shortcut: there is no Ctrl on a phone,
              and a keyboard shortcut nobody is told about is one nobody uses. */}
          <button
            onClick={() => window.dispatchEvent(
              new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))}
            title="ابحث عن شركة أو نفّذ أمراً"
            style={{
              display: 'flex', alignItems: 'center', gap: '11px',
              background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '11px',
              padding: '12px 18px', fontSize: '14px', color: '#64748B',
              cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit',
              // The grid's middle column sizes to this. 340 is the floor —
              // chosen by hand because the box felt cramped, and a box that can
              // shrink below the number somebody picked for comfort has not
              // fixed anything.
              width: 'min(520px, 100%)', minWidth: '340px',
            }}>
            <div style={{ color: 'inherit', display: 'flex', alignItems: 'center', flex: 'none' }}>
              <SearchIcon />
            </div>
            <span style={{ flex: 1, textAlign: 'start', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              ابحث عن شركة أو نفّذ أمراً…
            </span>
            <kbd style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '5px', padding: '1px 6px', fontSize: '10.5px', fontWeight: 800, direction: 'ltr', color: '#94A3B8', flex: 'none' }}>
              Ctrl K
            </kbd>
          </button>

          {/* justifySelf pins this to the far edge of the header, so the bell
              and the avatar sit in the corner whatever the title does. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '18px', justifySelf: 'end' }}>
            <NotificationBell />
            <UserButton
              afterSignOutUrl="/"
              appearance={{
                elements: {
                  avatarBox: 'w-10 h-10',
                  userButtonBox: 'flex-row-reverse',
                }
              }}
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
            {gate ? <DeferredSkeleton><SkeletonPage /></DeferredSkeleton> : <Outlet />}
          </Suspense>
        </main>
      </div>
    </div>
  )
}
