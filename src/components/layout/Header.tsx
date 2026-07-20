import React, { useState } from 'react'

interface HeaderProps {
  searchQuery?: string
  onSearch?: (query: string) => void
  userEmail?: string
  onProfileClick?: () => void
  notificationCount?: number
}

const Header: React.FC<HeaderProps> = ({
  searchQuery = '',
  onSearch,
  userEmail = 'user@example.com',
  onProfileClick,
  notificationCount = 0,
}) => {
  const [isProfileOpen, setIsProfileOpen] = useState(false)

  const containerStyles: React.CSSProperties = {
    backgroundColor: '#fff',
    borderBottom: '1px solid #E2E8F0',
    padding: '16px 28px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontFamily: 'Tajawal, sans-serif',
  }

  const searchStyles: React.CSSProperties = {
    flex: 1,
    maxWidth: '400px',
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  }

  const searchInputStyles: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px 10px 36px',
    border: '1.5px solid #E2E8F0',
    borderRadius: '8px',
    fontSize: '14px',
    backgroundColor: '#F8FAFC',
  }

  const rightActionsStyles: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '24px',
  }

  const notificationBadgeStyles: React.CSSProperties = {
    position: 'relative',
    cursor: 'pointer',
  }

  const badgeStyles: React.CSSProperties = {
    position: 'absolute',
    top: '-8px',
    right: '-8px',
    backgroundColor: '#DC2626',
    color: '#fff',
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '11px',
    fontWeight: 700,
  }

  const profileButtonStyles: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    backgroundColor: 'transparent',
    border: 'none',
    cursor: 'pointer',
    fontSize: '14px',
    color: '#1E2A52',
    fontWeight: 600,
  }

  const dropdownStyles: React.CSSProperties = {
    position: 'absolute',
    top: '100%',
    right: 0,
    backgroundColor: '#fff',
    border: '1px solid #E2E8F0',
    borderRadius: '8px',
    minWidth: '200px',
    boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
    zIndex: 1000,
    marginTop: '8px',
  }

  const dropdownItemStyles: React.CSSProperties = {
    padding: '12px 16px',
    borderBottom: '1px solid #F1F5F9',
    cursor: 'pointer',
    fontSize: '14px',
    color: '#1E2A52',
  }

  return (
    <header style={containerStyles}>
      <div style={searchStyles}>
        <svg
          style={{ position: 'absolute', left: '10px', width: '18px', height: '18px', color: '#94A3B8' }}
          fill="currentColor"
          viewBox="0 0 24 24"
        >
          <path d="M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16zm0 14a6 6 0 1 1 0-12 6 6 0 0 1 0 12z" />
          <path d="M16.3 14.9l4.4 4.4a1 1 0 1 1-1.4 1.4l-4.4-4.4a1 1 0 0 1 1.4-1.4z" />
        </svg>
        <input
          type="text"
          placeholder="ابحث عن شركة..."
          value={searchQuery}
          onChange={(e) => onSearch?.(e.target.value)}
          style={searchInputStyles}
        />
      </div>

      <div style={rightActionsStyles}>
        <div style={notificationBadgeStyles}>
          <div style={{ fontSize: '20px' }}>🔔</div>
          {notificationCount > 0 && <div style={badgeStyles}>{notificationCount}</div>}
        </div>

        <div style={{ position: 'relative' }}>
          <button style={profileButtonStyles} onClick={() => setIsProfileOpen(!isProfileOpen)}>
            <div>{userEmail.split('@')[0]}</div>
            <div>▼</div>
          </button>

          {isProfileOpen && (
            <div style={dropdownStyles}>
              <div style={dropdownItemStyles}>👤 الملف الشخصي</div>
              <div style={dropdownItemStyles}>⚙️ الإعدادات</div>
              <div style={{ ...dropdownItemStyles, color: '#DC2626' }}>🚪 تسجيل الخروج</div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

export default Header
