import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { UserButton } from '@clerk/react'
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
  BellIcon,
} from './icons'

const TOP_ITEMS = [
  { label: 'لوحة التحكم', icon: DashboardIcon, path: '/admin' },
  { label: 'طلبات الشركات', icon: DocumentIcon, path: '/admin/requests', badgeKey: 'requests', badgeBg: '#DC2626' },
  { label: 'مراجعة التقارير', icon: ListIcon, path: '/admin/reports', badgeKey: 'reviews', badgeBg: '#F59E0B' },
  { label: 'رفع دفعة', icon: UploadIcon, path: '/admin/bulk-import' },
  { label: 'الشركات', icon: BuildingIcon, path: '/admin/companies' },
  { label: 'المستخدمون', icon: UsersIcon, path: '/admin/users' },
  { label: 'السجلات', icon: LogIcon, path: '/admin/logs' },
]

const GROUPS = [
  { key: 'admin', title: 'الإدارة', items: [
    { label: 'مسؤولو المنصة', path: '/admin/admin-users' },
    { label: 'الباقات', path: '/admin/plans' },
    { label: 'المدفوعات والاشتراكات', path: '/admin/payments' },
    { label: 'الإعدادات', path: '/admin/settings' },
  ] },
  { key: 'analytics', title: 'التحليلات', items: [
    { label: 'تحليلات التقارير', path: '/admin/report-analytics' },
    { label: 'تحليلات الشركات', path: '/admin/tenant-analytics' },
    { label: 'مؤشر الثقة', path: '/admin/trust-score' },
  ] },
  { key: 'advanced', title: 'الإدارة المتقدمة', items: [
    { label: 'سجلّ الشركات', path: '/admin/roster' },
    { label: 'الاعتراضات', path: '/admin/disputes' },
    { label: 'المستندات والحالة الرسمية', path: '/admin/documents' },
    { label: 'تصدير البيانات', path: '/admin/data-export' },
    { label: '🔒 نماذج البريد', path: '/admin/email-templates' },
    { header: 'مراجعات' },
    { label: 'مراجعة التسجيل', path: '/admin/company-approval', indent: true },
    { label: 'طلبات الملكية', path: '/admin/claim-requests', indent: true },
    { label: 'التحقق من الشركات', path: '/admin/company-verification', indent: true },
  ] },
  { key: 'repos', title: '📚 مستودعات المعرفة', items: [
    { label: '🏢 مستودع الشركات', path: '/admin/knowledge-base/companies' },
    { label: '📋 مستودع التقارير', path: '/admin/knowledge-base/reports' },
  ] },
  { key: 'monitoring', title: 'المراقبة', items: [
    { label: 'حالة النظام', path: '/admin/system-health' },
    { label: 'سجل المساهمين', path: '/admin/fraud-detection' },
    { label: '🔒 التكاملات', path: '/admin/integrations' },
  ] },
]

const SCREEN_LABELS = {
  '/admin': 'لوحة تحكم الإدارة',
  '/admin/requests': 'مراجعة طلبات الشركات',
  '/admin/reports': 'مراجعة التقارير',
  '/admin/bulk-import': 'رفع دفعة شركات',
  '/admin/companies': 'إدارة الشركات',
  '/admin/users': 'إدارة المستخدمين',
  '/admin/logs': 'سجل العمليات',
  '/admin/admin-users': 'مسؤولو المنصة',
  '/admin/plans': 'إدارة الباقات',
  '/admin/payments': 'المدفوعات والاشتراكات',
  '/admin/settings': 'الإعدادات',
  '/admin/report-analytics': 'تحليلات التقارير',
  '/admin/tenant-analytics': 'تحليلات الشركات',
  '/admin/trust-score': 'تحليلات مؤشر الثقة',
  '/admin/roster': 'سجلّ الشركات وحالاتها',
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
}

export default function AdminShell({ user }) {
  const navigate = useNavigate()
  const { entitlements } = useEntitlements()

  // Whether this administrator also belongs to a company. Most do not.
  const hasCompany = !!entitlements?.tenantId
  const location = useLocation()
  const path = location.pathname

  const isActive = (p) => (p === '/admin' ? path === '/admin' : path === p || path.startsWith(p + '/'))
  const currentLabel = SCREEN_LABELS[
    Object.keys(SCREEN_LABELS).sort((a, b) => b.length - a.length).find(isActive)
  ] || 'لوحة تحكم الإدارة'

  const [openGroups, setOpenGroups] = useState({})
  const toggleGroup = (key) => setOpenGroups((s) => ({ ...s, [key]: !s[key] }))

  // Live badge counts (real pending work)
  const [counts, setCounts] = useState({ requests: 0, reviews: 0 })
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
      {/* Sidebar */}
      <aside style={{ width: '268px', background: '#0B1220', flex: 'none', display: 'flex', flexDirection: 'column', padding: '22px 16px', position: 'sticky', top: 0, height: '100vh', overflowY: 'auto' }}>
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
            <div style={{ fontSize: '11px', color: '#A78BFA', fontWeight: 800, letterSpacing: '.5px' }}>لوحة الإدارة</div>
          </div>
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
        <header style={{ background: '#fff', borderBottom: '1px solid #E2E8F0', padding: '0 32px', height: '68px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 30 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ fontSize: '18px', fontWeight: 900, color: '#0F172A' }}>{currentLabel}</div>
            <span style={{ background: '#F5F3FF', color: '#7C3AED', borderRadius: '7px', padding: '4px 11px', fontSize: '12px', fontWeight: 800 }}>وضع المسؤول</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ position: 'relative', cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#475569' }}>
              <BellIcon />
              <span style={{ position: 'absolute', top: '-3px', left: '-3px', width: '9px', height: '9px', background: '#DC2626', borderRadius: '50%', border: '2px solid #fff' }}></span>
            </div>
            <UserButton
              afterSignOutUrl="/"
              appearance={{ elements: { avatarBox: 'w-10 h-10', userButtonBox: 'flex-row-reverse' } }}
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
