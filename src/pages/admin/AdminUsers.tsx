/**
 * Admin Users Management Page
 * View and manage all users across tenants
 */

import React, { useState, useEffect } from 'react'
import { AdminUser, Pagination } from '../../types'
import Button from '../../components/common/Button'

const AdminUsers: React.FC = () => {
  const token = localStorage.getItem('accessToken')
  const userRole = localStorage.getItem('userRole')
  const [users, setUsers] = useState<AdminUser[]>([])
  const [filters, setFilters] = useState({
    role: 'all',
    status: 'all',
    search: '',
  })
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null)
  const [formData, setFormData] = useState({
    email: '',
    name: '',
    role: 'user',
    isActive: true,
  })
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState<Pagination | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!token || userRole !== 'platform_admin') {
      window.location.href = '/login'
      return
    }

    fetchUsers(1)
  }, [])

  const fetchUsers = async (pageNum: number) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.append('page', pageNum.toString())
      params.append('limit', '20')
      if (filters.role !== 'all') {
        params.append('role', filters.role)
      }
      if (filters.status !== 'all') {
        params.append('isActive', filters.status === 'active' ? 'true' : 'false')
      }
      if (filters.search) {
        params.append('search', filters.search)
      }

      const response = await fetch(`/api/admin/users?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!response.ok) {
        throw new Error('Failed to fetch users')
      }

      const data = await response.json()
      setUsers(data.users || [])
      setPagination(data.pagination)
      setPage(pageNum)
    } catch (error) {
      console.error('Error fetching users:', error)
      alert('فشل جلب بيانات المستخدمين')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateUser = async () => {
    if (!formData.email || !formData.name) {
      alert('يرجى ملء جميع الحقول المطلوبة')
      return
    }

    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      })

      if (response.ok) {
        await fetchUsers(page)
        setShowCreateModal(false)
        setFormData({ email: '', name: '', role: 'user', isActive: true })
        alert('تم إنشاء المستخدم بنجاح')
      }
    } catch (error) {
      alert('فشل إنشاء المستخدم')
    }
  }

  const handleEditUser = (user: AdminUser) => {
    setSelectedUser(user)
    setFormData({
      email: user.email,
      name: user.name,
      role: user.role,
      isActive: user.isActive,
    })
    setShowEditModal(true)
  }

  const handleUpdateUser = async () => {
    if (!selectedUser) return

    try {
      const response = await fetch(`/api/admin/users/${selectedUser.id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      })

      if (response.ok) {
        await fetchUsers(page)
        setShowEditModal(false)
        setSelectedUser(null)
        alert('تم تحديث بيانات المستخدم')
      }
    } catch (error) {
      alert('فشل تحديث بيانات المستخدم')
    }
  }

  const handleDeleteUser = async (userId: string) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا المستخدم؟')) {
      return
    }

    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })

      if (response.ok) {
        await fetchUsers(page)
        alert('تم حذف المستخدم')
      }
    } catch (error) {
      alert('فشل حذف المستخدم')
    }
  }

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'platform_admin':
        return { bg: '#ECFDF5', color: '#15803D', text: 'مسؤول النظام' }
      case 'company_admin':
        return { bg: '#F0F4FF', color: '#1E40AF', text: 'مسؤول الشركة' }
      case 'user':
        return { bg: '#F3E8FF', color: '#6B21A8', text: 'مستخدم' }
      default:
        return { bg: '#F1F5F9', color: '#64748B', text: role }
    }
  }

  const getStatusBadge = (isActive: boolean) => {
    return isActive
      ? { bg: '#ECFDF5', color: '#15803D', text: 'نشط' }
      : { bg: '#FEE2E2', color: '#991B1B', text: 'غير نشط' }
  }

  const roleBadgeStyles = (role: string): React.CSSProperties => {
    const badge = getRoleBadge(role)
    return {
      display: 'inline-block',
      padding: '6px 12px',
      borderRadius: '6px',
      fontSize: '12px',
      fontWeight: 600,
      backgroundColor: badge.bg,
      color: badge.color,
    }
  }

  const statusBadgeStyles = (isActive: boolean): React.CSSProperties => {
    const badge = getStatusBadge(isActive)
    return {
      display: 'inline-block',
      padding: '6px 12px',
      borderRadius: '6px',
      fontSize: '12px',
      fontWeight: 600,
      backgroundColor: badge.bg,
      color: badge.color,
    }
  }

  return (
    <div style={containerStyles}>
      <div style={contentWrapperStyles}>
        {/* Header */}
        <div style={headerWrapperStyles}>
          <div style={headerStyles}>
            <h1 style={titleStyles}>إدارة المستخدمين</h1>
            <p style={subtitleStyles}>عرض وإدارة جميع المستخدمين على المنصة</p>
          </div>
          <Button variant="primary" onClick={() => setShowCreateModal(true)}>
            + إنشاء مستخدم جديد
          </Button>
        </div>

        {/* Filters */}
        <div style={filterContainerStyles}>
          <div style={filterGroupStyles}>
            <label style={filterLabelStyles}>البحث عن مستخدم</label>
            <input
              type="text"
              placeholder="ابحث بالاسم أو البريد الإلكتروني..."
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              style={filterInputStyles}
            />
          </div>

          <div style={filterGroupStyles}>
            <label style={filterLabelStyles}>الدور</label>
            <select
              value={filters.role}
              onChange={(e) => setFilters({ ...filters, role: e.target.value })}
              style={filterSelectStyles}
            >
              <option value="all">الكل</option>
              <option value="platform_admin">مسؤول النظام</option>
              <option value="company_admin">مسؤول الشركة</option>
              <option value="user">مستخدم</option>
            </select>
          </div>

          <div style={filterGroupStyles}>
            <label style={filterLabelStyles}>الحالة</label>
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              style={filterSelectStyles}
            >
              <option value="all">الكل</option>
              <option value="active">نشط</option>
              <option value="inactive">غير نشط</option>
            </select>
          </div>

          <div style={{ alignSelf: 'flex-end' }}>
            <Button variant="primary" onClick={() => fetchUsers(1)}>
              بحث
            </Button>
          </div>
        </div>

        {/* Users Table */}
        <div style={tableContainerStyles}>
          <table style={tableStyles}>
            <thead>
              <tr style={tableHeadRowStyles}>
                <th style={thStyles}>الاسم</th>
                <th style={thStyles}>البريد الإلكتروني</th>
                <th style={thStyles}>الدور</th>
                <th style={thStyles}>الحالة</th>
                <th style={thStyles}>آخر دخول</th>
                <th style={thStyles}>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '24px', color: '#64748B' }}>
                    جاري التحميل...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '24px', color: '#64748B' }}>
                    لا توجد مستخدمين
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id} style={tableRowStyles}>
                    <td style={tdStyles}>{user.name}</td>
                    <td style={tdStyles}>{user.email}</td>
                    <td style={tdStyles}>
                      <div style={roleBadgeStyles(user.role)}>
                        {getRoleBadge(user.role).text}
                      </div>
                    </td>
                    <td style={tdStyles}>
                      <div style={statusBadgeStyles(user.isActive)}>
                        {getStatusBadge(user.isActive).text}
                      </div>
                    </td>
                    <td style={tdStyles}>
                      {user.lastLogin
                        ? new Date(user.lastLogin).toLocaleDateString('ar-SA')
                        : 'لم يسجل دخول'}
                    </td>
                    <td style={tdStyles}>
                      <div style={actionButtonsStyles}>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleEditUser(user)}
                        >
                          تعديل
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => handleDeleteUser(user.id)}
                        >
                          حذف
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {/* Pagination */}
          {pagination && (
            <div style={paginationStyles}>
              <div style={paginationTextStyles}>
                الصفحة {page} من {pagination.pages} • إجمالي {pagination.total} مستخدم
              </div>
              <div style={paginationButtonsStyles}>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => fetchUsers(Math.max(1, page - 1))}
                  disabled={page === 1}
                >
                  السابق
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => fetchUsers(Math.min(pagination.pages, page + 1))}
                  disabled={page >= pagination.pages}
                >
                  التالي
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create User Modal */}
      {showCreateModal && (
        <div style={modalOverlayStyles} onClick={() => setShowCreateModal(false)}>
          <div style={modalStyles} onClick={(e) => e.stopPropagation()}>
            <h2 style={modalTitleStyles}>إنشاء مستخدم جديد</h2>

            <div style={formGroupStyles}>
              <label style={formLabelStyles}>الاسم</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                style={formInputStyles}
                placeholder="أدخل اسم المستخدم"
              />
            </div>

            <div style={formGroupStyles}>
              <label style={formLabelStyles}>البريد الإلكتروني</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                style={formInputStyles}
                placeholder="أدخل البريد الإلكتروني"
              />
            </div>

            <div style={formGroupStyles}>
              <label style={formLabelStyles}>الدور</label>
              <select
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                style={formInputStyles}
              >
                <option value="user">مستخدم</option>
                <option value="company_admin">مسؤول الشركة</option>
                <option value="platform_admin">مسؤول النظام</option>
              </select>
            </div>

            <div style={modalButtonsStyles}>
              <Button variant="secondary" onClick={() => setShowCreateModal(false)}>
                إلغاء
              </Button>
              <Button variant="primary" onClick={handleCreateUser}>
                إنشاء المستخدم
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {showEditModal && selectedUser && (
        <div style={modalOverlayStyles} onClick={() => setShowEditModal(false)}>
          <div style={modalStyles} onClick={(e) => e.stopPropagation()}>
            <h2 style={modalTitleStyles}>تعديل بيانات المستخدم</h2>

            <div style={formGroupStyles}>
              <label style={formLabelStyles}>الاسم</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                style={formInputStyles}
              />
            </div>

            <div style={formGroupStyles}>
              <label style={formLabelStyles}>البريد الإلكتروني</label>
              <input
                type="email"
                value={formData.email}
                disabled
                style={{
                  ...formInputStyles,
                  backgroundColor: '#F1F5F9',
                  cursor: 'not-allowed',
                }}
              />
            </div>

            <div style={formGroupStyles}>
              <label style={formLabelStyles}>الدور</label>
              <select
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                style={formInputStyles}
              >
                <option value="user">مستخدم</option>
                <option value="company_admin">مسؤول الشركة</option>
                <option value="platform_admin">مسؤول النظام</option>
              </select>
            </div>

            <div style={formGroupStyles}>
              <label style={formCheckboxLabelStyles}>
                <input
                  type="checkbox"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  style={{ marginLeft: '8px' }}
                />
                المستخدم نشط
              </label>
            </div>

            <div style={modalButtonsStyles}>
              <Button variant="secondary" onClick={() => setShowEditModal(false)}>
                إلغاء
              </Button>
              <Button variant="primary" onClick={handleUpdateUser}>
                حفظ التغييرات
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Styles
const containerStyles: React.CSSProperties = {
  background: '#F8FAFC',
  minHeight: '100vh',
  padding: '32px',
  fontFamily: 'Tajawal, sans-serif',
}

const contentWrapperStyles: React.CSSProperties = {
  maxWidth: '1400px',
  margin: '0 auto',
}

const headerWrapperStyles: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  marginBottom: '32px',
}

const headerStyles: React.CSSProperties = {
  textAlign: 'right',
  flex: 1,
}

const titleStyles: React.CSSProperties = {
  fontSize: '32px',
  fontWeight: 900,
  color: '#0F172A',
  margin: '0 0 8px 0',
}

const subtitleStyles: React.CSSProperties = {
  color: '#64748B',
  fontSize: '14px',
  margin: 0,
}

const filterContainerStyles: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #E2E8F0',
  borderRadius: '12px',
  padding: '24px',
  marginBottom: '24px',
  display: 'grid',
  gridTemplateColumns: '1fr 1fr 1fr auto',
  gap: '16px',
  alignItems: 'flex-end',
}

const filterGroupStyles: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
}

const filterLabelStyles: React.CSSProperties = {
  fontSize: '13px',
  fontWeight: 700,
  color: '#64748B',
}

const filterInputStyles: React.CSSProperties = {
  padding: '10px 12px',
  border: '1.5px solid #E2E8F0',
  borderRadius: '8px',
  fontSize: '14px',
  fontFamily: 'Tajawal, sans-serif',
}

const filterSelectStyles: React.CSSProperties = {
  padding: '10px 12px',
  border: '1.5px solid #E2E8F0',
  borderRadius: '8px',
  fontSize: '14px',
  fontFamily: 'Tajawal, sans-serif',
  backgroundColor: '#fff',
  cursor: 'pointer',
}

const tableContainerStyles: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #E2E8F0',
  borderRadius: '12px',
  overflow: 'hidden',
}

const tableStyles: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontFamily: 'Tajawal, sans-serif',
}

const tableHeadRowStyles: React.CSSProperties = {
  backgroundColor: '#F8FAFC',
  borderBottom: '2px solid #E2E8F0',
}

const thStyles: React.CSSProperties = {
  padding: '16px',
  textAlign: 'right',
  fontSize: '14px',
  fontWeight: 700,
  color: '#1E2A52',
}

const tableRowStyles: React.CSSProperties = {
  borderBottom: '1px solid #E2E8F0',
  height: '70px',
  backgroundColor: '#fff',
}

const tdStyles: React.CSSProperties = {
  padding: '16px',
  fontSize: '14px',
  color: '#1E2A52',
  textAlign: 'right',
}

const actionButtonsStyles: React.CSSProperties = {
  display: 'flex',
  gap: '8px',
}

const paginationStyles: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '16px',
  borderTop: '1px solid #E2E8F0',
  gap: '8px',
}

const paginationTextStyles: React.CSSProperties = {
  fontSize: '14px',
  color: '#475569',
  fontFamily: 'Tajawal, sans-serif',
}

const paginationButtonsStyles: React.CSSProperties = {
  display: 'flex',
  gap: '8px',
}

const modalOverlayStyles: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
}

const modalStyles: React.CSSProperties = {
  background: '#fff',
  borderRadius: '12px',
  padding: '32px',
  maxWidth: '500px',
  width: '90%',
  boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
}

const modalTitleStyles: React.CSSProperties = {
  fontSize: '20px',
  fontWeight: 900,
  color: '#0F172A',
  margin: '0 0 24px 0',
  textAlign: 'right',
}

const formGroupStyles: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  marginBottom: '16px',
}

const formLabelStyles: React.CSSProperties = {
  fontSize: '13px',
  fontWeight: 700,
  color: '#64748B',
}

const formCheckboxLabelStyles: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  fontSize: '14px',
  color: '#1E2A52',
  fontWeight: 500,
}

const modalButtonsStyles: React.CSSProperties = {
  display: 'flex',
  gap: '12px',
  justifyContent: 'flex-end',
  marginTop: '24px',
}

export default AdminUsers
