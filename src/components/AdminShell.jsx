import { Outlet, useNavigate } from 'react-router-dom'
import { UserButton } from '@clerk/react'
import { useClerkOrganization } from '../hooks/useClerkOrganization'
import {
  DashboardIcon,
  DocumentIcon,
  ListIcon,
  UploadIcon,
  BuildingIcon,
  UsersIcon,
  LogIcon
} from './icons'

export default function AdminShell({ user, onLogout }) {
  const navigate = useNavigate()
  const { organizationName, userRole } = useClerkOrganization()

  const menuItems = [
    { label: 'لوحة التحكم', icon: DashboardIcon, path: '/admin' },
    { label: 'طلبات الشركات', icon: DocumentIcon, path: '/admin/requests' },
    { label: 'مراجعة التقارير', icon: ListIcon, path: '/admin/reports' },
    { label: 'رفع دفعة', icon: UploadIcon, path: '/admin/bulk-import' },
    { label: 'الشركات', icon: BuildingIcon, path: '/admin/companies' },
    { label: 'المستخدمون', icon: UsersIcon, path: '/admin/users' },
    { label: 'السجلات', icon: LogIcon, path: '/admin/logs' },
    { divider: true, label: 'الإدارة' },
    { label: 'مسؤولي المنصة', path: '/admin/admin-users' },
    { label: 'الباقات', path: '/admin/plans' },
    { label: 'المدفوعات', path: '/admin/payments' },
    { label: 'الإعدادات', path: '/admin/settings' },
    { divider: true, label: 'التحليلات' },
    { label: 'تحليلات التقارير', path: '/admin/report-analytics' },
    { label: 'تحليلات الشركات', path: '/admin/tenant-analytics' },
    { label: 'مؤشر الثقة', path: '/admin/trust-score' },
    { divider: true, label: 'الإدارة المتقدمة' },
    { label: 'نماذج البريد', path: '/admin/email-templates' },
    { label: 'تصدير البيانات', path: '/admin/data-export' },
    { label: 'النزاعات', path: '/admin/disputes' },
    { label: 'التحقق من الشركات', path: '/admin/company-verification' },
    { divider: true, label: 'المراقبة' },
    { label: 'حالة النظام', path: '/admin/system-health' },
    { label: 'كشف الاحتيال', path: '/admin/fraud-detection' },
    { label: 'التكاملات', path: '/admin/integrations' },
    { label: 'النسخ الاحتياطية', path: '/admin/backup' },
  ]

  return (
    <div dir="rtl" style={{ fontFamily: 'Tajawal, system-ui, sans-serif', background: '#F8FAFC', minHeight: '100vh', display: 'flex', color: '#0F172A' }}>
      {/* Sidebar */}
      <aside style={{
        width: '280px',
        background: '#0F172A',
        borderLeft: '1px solid #1a1f3a',
        height: '100vh',
        position: 'fixed',
        right: 0,
        overflowY: 'auto'
      }}>
        {/* Logo */}
        <div style={{ padding: '28px 20px', borderBottom: '1px solid rgba(255,255,255,.1)' }}>
          <div
            onClick={() => navigate('/admin')}
            style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}
          >
            <svg width="32" height="32" viewBox="0 0 64 64">
              <defs>
                <linearGradient id="mkAdmin" x1="0" y1="1" x2="1" y2="0">
                  <stop offset="0" stopColor="#DC2626" />
                  <stop offset=".55" stopColor="#DC2626" />
                  <stop offset="1" stopColor="#EF4444" />
                </linearGradient>
              </defs>
              <circle cx="32" cy="32" r="22.5" fill="none" stroke="url(#mkAdmin)" strokeWidth="6.4" strokeLinecap="round" strokeDasharray="118 24" transform="rotate(-46 32 32)" />
              <path d="M22.5 33 l6.5 6.5 L41 26.5" fill="none" stroke="#FCA5A5" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span style={{ fontWeight: 900, fontSize: '18px', color: '#fff' }}>مرصد إدارة</span>
          </div>
        </div>

        {/* Admin Badge */}
        <div style={{
          margin: '16px',
          background: 'rgba(220, 38, 38, .2)',
          border: '1px solid rgba(220, 38, 38, .4)',
          borderRadius: '8px',
          padding: '12px 16px',
          fontSize: '12px',
          color: '#FCA5A5',
          textAlign: 'center'
        }}>
          <div style={{ marginBottom: '4px' }}>لوحة الإدارة</div>
          <div style={{ fontSize: '11px', opacity: 0.9 }}>{userRole || 'admin'}</div>
        </div>

        {/* Nav Items */}
        <nav style={{ padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {menuItems.map((item, idx) => {
            if (item.divider) {
              return (
                <div key={`divider-${idx}`} style={{
                  margin: '12px 0 8px 0',
                  padding: '8px 0 0 0',
                  borderTop: '1px solid rgba(255,255,255,.1)',
                  fontSize: '11px',
                  color: '#64748B',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  {item.label}
                </div>
              )
            }

            const IconComponent = item.icon
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                style={{
                  background: 'transparent',
                  border: 0,
                  color: '#CBD5E1',
                  padding: '12px 14px',
                  fontSize: '14px',
                  fontWeight: 600,
                  textAlign: 'right',
                  cursor: 'pointer',
                  borderRadius: '8px',
                  transition: 'all .2s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '11px',
                  justifyContent: 'flex-end'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'rgba(220, 38, 38, .2)'
                  e.currentTarget.style.color = '#FCA5A5'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.color = '#CBD5E1'
                }}
              >
                {item.label}
                {IconComponent && (
                  <span style={{ display: 'flex', alignItems: 'center', flex: 'none', color: 'inherit' }}>
                    <IconComponent />
                  </span>
                )}
              </button>
            )
          })}
        </nav>

        {/* Clerk UserButton */}
        <div style={{
          position: 'absolute',
          bottom: '20px',
          left: '16px',
          right: '16px',
          display: 'flex',
          justifyContent: 'center'
        }}>
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
      </aside>

      {/* Main */}
      <div style={{ marginRight: '280px', flex: 1 }}>
        {/* Header */}
        <header style={{
          background: '#fff',
          borderBottom: '1px solid #E2E8F0',
          padding: '16px 28px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          position: 'sticky',
          top: 0,
          zIndex: 30
        }}>
          <div>
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
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            fontSize: '13px',
            color: '#64748B'
          }}>
            <span style={{
              background: '#FEE2E2',
              color: '#DC2626',
              padding: '4px 10px',
              borderRadius: '4px',
              fontWeight: 700
            }}>
              مسؤول النظام
            </span>
          </div>
        </header>

        {/* Content */}
        <main style={{ padding: '28px' }}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
