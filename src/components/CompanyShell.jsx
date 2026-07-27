import { Navigate, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { UserButton } from '@clerk/react'
import { useClerkOrganization } from '../hooks/useClerkOrganization'
import { useCompanyOnboarding } from '../hooks/useCompanyOnboarding'
import { useUserRole } from '../hooks/useUserRole'
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

export default function CompanyShell({ user }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { organizationName, userRole } = useClerkOrganization()
  const { needsOnboarding, loading } = useCompanyOnboarding()
  const { isPlatformAdmin, role, loading: roleLoading } = useUserRole()

  // Marsad staff have no tenant, and that is not an unfinished sign-up. This was
  // the last of four places reading the same absence the same way.
  const isStaff = isPlatformAdmin || role === 'reviewer'

  // This used to render a loading message and stop there — no navigation ever
  // followed, so a user who reached it sat on "جاري التحميل..." forever. Do the
  // redirect the comment always promised.
  if (!loading && !roleLoading && !isStaff && needsOnboarding && location.pathname.startsWith('/dashboard')) {
    return <Navigate to="/company-onboarding" replace />
  }

  // A company dashboard belonging to no company is an empty screen. Staff land
  // on the panel that is theirs; every other company route stays open to them,
  // because reading a trust report is the job.
  if (!roleLoading && isStaff && location.pathname.startsWith('/dashboard')) {
    return <Navigate to="/admin" replace />
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
  }

  const matchedLabelKey = Object.keys(screenLabels).find(
    (key) => location.pathname === key || location.pathname.startsWith(key + '/')
  )
  const currentScreenLabel = screenLabels[matchedLabelKey] || 'لوحة التحكم'

  return (
    <div dir="rtl" style={{ fontFamily: 'Tajawal, system-ui, sans-serif', background: '#F8FAFC', display: 'flex', minHeight: '100vh', color: '#0F172A' }}>
      {/* Sidebar */}
      <aside style={{
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

        {/* Nav Items */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
          {[
            { label: 'لوحة التحكم', icon: DashboardIcon, path: '/dashboard' },
            { label: 'البحث عن الشركات', icon: SearchIcon, path: '/search' },
            { label: 'إضافة شركة للسجل', icon: BuildingIcon, path: '/add-company' },
            { label: 'إضافة تقرير', icon: DocumentIcon, path: '/add-report' },
            { label: 'تقاريري المرسلة', icon: ListIcon, path: '/my-reports' },
            { label: 'الشركات المُرسلة', icon: BuildingIcon, path: '/my-companies' },
            { label: 'قوائم المراقبة', icon: EyeIcon, path: '/watchlist' },
            { label: 'مقارنة الشركات', icon: CompareIcon, path: '/compare' },
            { label: 'إدارة المستخدمين', icon: UsersIcon, path: '/users' },
            { label: 'إدارة الاشتراك', icon: CreditCardIcon, path: '/subscription' },
            { label: 'ملف الشركة', icon: SettingsIcon, path: '/profile' },
          ].map(item => {
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

        {/* Subscription Box */}
        <div style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)', borderRadius: '14px', padding: '16px', marginTop: '14px' }}>
          <div style={{ fontSize: '14px', fontWeight: 800, color: '#fff', marginBottom: '5px' }}>
            {organizationName || 'الشركة'}
          </div>
          <div style={{ fontSize: '12.5px', color: '#94A3B8', marginBottom: '12px' }}>
            دور: {userRole || 'عضو'}
          </div>
          <button onClick={() => navigate('/subscription')} style={{ width: '100%', background: '#16A34A', color: '#fff', border: 0, borderRadius: '9px', padding: '9px', fontSize: '13px', fontWeight: 800, cursor: 'pointer' }}>إدارة الباقة</button>
        </div>
      </aside>

      {/* Main */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <header style={{
          background: '#fff',
          borderBottom: '1px solid #E2E8F0',
          padding: '0 32px',
          height: '68px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'sticky',
          top: 0,
          zIndex: 30
        }}>
          <div style={{ fontSize: '18px', fontWeight: 900, color: '#0F172A' }}>
            {currentScreenLabel}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
            <button onClick={() => navigate('/search')} style={{ display: 'flex', alignItems: 'center', gap: '9px', background: '#F1F5F9', border: 0, borderRadius: '10px', padding: '9px 16px', fontSize: '14px', color: '#64748B', cursor: 'pointer', fontWeight: 600, minWidth: '240px' }}>
              <div style={{ color: 'inherit', display: 'flex', alignItems: 'center' }}>
                <SearchIcon />
              </div>
              ابحث عن شركة...
            </button>
            <div style={{ position: 'relative', cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#475569' }}>
              <BellIcon />
              <span style={{ position: 'absolute', top: '-3px', left: '-3px', width: '9px', height: '9px', background: '#DC2626', borderRadius: '50%', border: '2px solid #fff' }}></span>
            </div>
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
        <main style={{ padding: '28px 32px', flex: 1 }}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
