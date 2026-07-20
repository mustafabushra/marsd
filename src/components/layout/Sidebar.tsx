import React from 'react'

interface SidebarProps {
  activeRoute?: string
  onNavigate?: (route: string) => void
  onLogout?: () => void
}

const Sidebar: React.FC<SidebarProps> = ({ activeRoute = '/', onNavigate, onLogout }) => {
  const containerStyles: React.CSSProperties = {
    width: '268px',
    backgroundColor: '#1E2A52',
    color: '#fff',
    padding: '22px 16px',
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    position: 'sticky',
    top: 0,
    overflowY: 'auto',
    fontFamily: 'Tajawal, sans-serif',
  }

  const logoStyles: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '11px',
    padding: '0 8px 22px',
    borderBottom: '1px solid rgba(255,255,255,0.1)',
    marginBottom: '16px',
    cursor: 'pointer',
  }

  const menuStyles: React.CSSProperties = {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  }

  const menuItemStyles = (isActive: boolean): React.CSSProperties => ({
    padding: '12px 16px',
    borderRadius: '8px',
    backgroundColor: isActive ? 'rgba(255,255,255,0.1)' : 'transparent',
    borderLeft: isActive ? '3px solid #16A34A' : 'none',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 600,
    transition: 'all 0.2s ease',
    color: '#fff',
  })

  const logoutButtonStyles: React.CSSProperties = {
    padding: '12px 16px',
    backgroundColor: '#DC2626',
    border: 'none',
    borderRadius: '8px',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 700,
    marginTop: 'auto',
  }

  const menuItems = [
    { label: 'لوحة التحكم', route: '/' },
    { label: 'البحث', route: '/search' },
    { label: 'تقاريري', route: '/my-reports' },
    { label: 'المراقبة', route: '/watchlist' },
    { label: 'المقارنة', route: '/compare' },
    { label: 'طلبات الأعمال', route: '/business-requests' },
    { label: 'الإشعارات', route: '/notifications' },
    { label: 'الاشتراك', route: '/subscription' },
    { label: 'الحساب', route: '/profile' },
  ]

  return (
    <aside style={containerStyles}>
      <div style={logoStyles} onClick={() => onNavigate?.('/')}>
        <div style={{ fontSize: '24px' }}>✓</div>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 900 }}>مرصد</div>
          <div style={{ fontSize: '10px', opacity: 0.7 }}>Marsad</div>
        </div>
      </div>

      <nav style={menuStyles}>
        {menuItems.map((item) => (
          <button
            key={item.route}
            style={{ ...menuItemStyles(activeRoute === item.route), textAlign: 'right' }}
            onClick={() => onNavigate?.(item.route)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <button style={logoutButtonStyles} onClick={onLogout}>
        تسجيل الخروج
      </button>
    </aside>
  )
}

export default Sidebar
