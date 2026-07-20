/**
 * Admin Companies Management Page
 * View and manage all companies on the platform
 */

import React, { useState, useEffect } from 'react'
import { useApiPaginated } from '../../hooks/useApi'
import { Company, Pagination } from '../../types'
import Button from '../../components/common/Button'

const AdminCompanies: React.FC = () => {
  const token = localStorage.getItem('accessToken')
  const userRole = localStorage.getItem('userRole')
  const [companies, setCompanies] = useState<Company[]>([])
  const [filters, setFilters] = useState({
    status: 'all',
    search: '',
  })
  const [showEditModal, setShowEditModal] = useState(false)
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null)
  const [editForm, setEditForm] = useState<Partial<Company>>({})
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState<Pagination | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!token || userRole !== 'platform_admin') {
      window.location.href = '/login'
      return
    }

    fetchCompanies(1)
  }, [])

  const fetchCompanies = async (pageNum: number) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.append('page', pageNum.toString())
      params.append('limit', '20')
      if (filters.status !== 'all') {
        params.append('status', filters.status)
      }
      if (filters.search) {
        params.append('search', filters.search)
      }

      const response = await fetch(`/api/admin/companies?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!response.ok) {
        throw new Error('Failed to fetch companies')
      }

      const data = await response.json()
      setCompanies(data.companies || [])
      setPagination(data.pagination)
      setPage(pageNum)
    } catch (error) {
      console.error('Error fetching companies:', error)
      alert('فشل جلب بيانات الشركات')
    } finally {
      setLoading(false)
    }
  }

  const handleApprove = async (companyId: string) => {
    try {
      const response = await fetch(`/api/admin/companies/${companyId}/approve`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'approved' }),
      })

      if (response.ok) {
        await fetchCompanies(page)
        alert('تمت الموافقة على الشركة')
      }
    } catch (error) {
      alert('فشل في الموافقة على الشركة')
    }
  }

  const handleSuspend = async (companyId: string) => {
    if (!window.confirm('هل أنت متأكد من إيقاف هذه الشركة؟')) {
      return
    }

    try {
      const response = await fetch(`/api/admin/companies/${companyId}/suspend`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ crStatus: 'suspended' }),
      })

      if (response.ok) {
        await fetchCompanies(page)
        alert('تم إيقاف الشركة')
      }
    } catch (error) {
      alert('فشل في إيقاف الشركة')
    }
  }

  const handleEdit = (company: Company) => {
    setSelectedCompany(company)
    setEditForm({ ...company })
    setShowEditModal(true)
  }

  const handleSaveEdit = async () => {
    if (!selectedCompany) return

    try {
      const response = await fetch(`/api/admin/companies/${selectedCompany.id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(editForm),
      })

      if (response.ok) {
        await fetchCompanies(page)
        setShowEditModal(false)
        setSelectedCompany(null)
        alert('تم تحديث بيانات الشركة')
      }
    } catch (error) {
      alert('فشل في تحديث بيانات الشركة')
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return { bg: '#ECFDF5', color: '#15803D', text: 'موافق' }
      case 'pending':
        return { bg: '#FEF3C7', color: '#92400E', text: 'قيد المراجعة' }
      case 'rejected':
        return { bg: '#FEE2E2', color: '#991B1B', text: 'مرفوض' }
      case 'suspended':
        return { bg: '#F3E8FF', color: '#6B21A8', text: 'موقوف' }
      default:
        return { bg: '#F1F5F9', color: '#64748B', text: status }
    }
  }

  const statusBadgeStyles = (status: string): React.CSSProperties => {
    const badge = getStatusBadge(status)
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
        <div style={headerStyles}>
          <h1 style={titleStyles}>إدارة الشركات</h1>
          <p style={subtitleStyles}>عرض وإدارة جميع الشركات المسجلة على المنصة</p>
        </div>

        {/* Filters */}
        <div style={filterContainerStyles}>
          <div style={filterGroupStyles}>
            <label style={filterLabelStyles}>البحث عن شركة</label>
            <input
              type="text"
              placeholder="ابحث برقم السجل التجاري أو اسم الشركة..."
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              style={filterInputStyles}
            />
          </div>

          <div style={filterGroupStyles}>
            <label style={filterLabelStyles}>الحالة</label>
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              style={filterSelectStyles}
            >
              <option value="all">الكل</option>
              <option value="pending">قيد المراجعة</option>
              <option value="approved">موافق</option>
              <option value="rejected">مرفوض</option>
              <option value="suspended">موقوف</option>
            </select>
          </div>

          <div style={{ alignSelf: 'flex-end' }}>
            <Button variant="primary" onClick={() => fetchCompanies(1)}>
              بحث
            </Button>
          </div>
        </div>

        {/* Companies Table */}
        <div style={tableContainerStyles}>
          <table style={tableStyles}>
            <thead>
              <tr style={tableHeadRowStyles}>
                <th style={thStyles}>اسم الشركة</th>
                <th style={thStyles}>رقم السجل</th>
                <th style={thStyles}>المدينة</th>
                <th style={thStyles}>القطاع</th>
                <th style={thStyles}>الحالة</th>
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
              ) : companies.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '24px', color: '#64748B' }}>
                    لا توجد شركات
                  </td>
                </tr>
              ) : (
                companies.map((company) => (
                  <tr key={company.id} style={tableRowStyles}>
                    <td style={tdStyles}>{company.name}</td>
                    <td style={tdStyles}>{company.crNumber}</td>
                    <td style={tdStyles}>{company.city}</td>
                    <td style={tdStyles}>{company.sector}</td>
                    <td style={tdStyles}>
                      <div style={statusBadgeStyles(company.status || 'pending')}>
                        {getStatusBadge(company.status || 'pending').text}
                      </div>
                    </td>
                    <td style={tdStyles}>
                      <div style={actionButtonsStyles}>
                        {company.status === 'pending' && (
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => handleApprove(company.id)}
                          >
                            موافقة
                          </Button>
                        )}
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleEdit(company)}
                        >
                          تعديل
                        </Button>
                        {company.status !== 'suspended' && (
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => handleSuspend(company.id)}
                          >
                            إيقاف
                          </Button>
                        )}
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
                الصفحة {page} من {pagination.pages} • إجمالي {pagination.total} شركة
              </div>
              <div style={paginationButtonsStyles}>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => fetchCompanies(Math.max(1, page - 1))}
                  disabled={page === 1}
                >
                  السابق
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => fetchCompanies(Math.min(pagination.pages, page + 1))}
                  disabled={page >= pagination.pages}
                >
                  التالي
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      {showEditModal && selectedCompany && (
        <div style={modalOverlayStyles} onClick={() => setShowEditModal(false)}>
          <div style={modalStyles} onClick={(e) => e.stopPropagation()}>
            <h2 style={modalTitleStyles}>تعديل بيانات الشركة</h2>

            <div style={formGroupStyles}>
              <label style={formLabelStyles}>اسم الشركة</label>
              <input
                type="text"
                value={editForm.name || ''}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                style={formInputStyles}
              />
            </div>

            <div style={formGroupStyles}>
              <label style={formLabelStyles}>رقم السجل التجاري</label>
              <input
                type="text"
                value={editForm.crNumber || ''}
                onChange={(e) => setEditForm({ ...editForm, crNumber: e.target.value })}
                style={formInputStyles}
              />
            </div>

            <div style={formGroupStyles}>
              <label style={formLabelStyles}>المدينة</label>
              <input
                type="text"
                value={editForm.city || ''}
                onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
                style={formInputStyles}
              />
            </div>

            <div style={formGroupStyles}>
              <label style={formLabelStyles}>القطاع</label>
              <input
                type="text"
                value={editForm.sector || ''}
                onChange={(e) => setEditForm({ ...editForm, sector: e.target.value })}
                style={formInputStyles}
              />
            </div>

            <div style={modalButtonsStyles}>
              <Button variant="secondary" onClick={() => setShowEditModal(false)}>
                إلغاء
              </Button>
              <Button variant="primary" onClick={handleSaveEdit}>
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

const headerStyles: React.CSSProperties = {
  marginBottom: '32px',
  textAlign: 'right',
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
  gridTemplateColumns: '1fr 1fr auto',
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

const formInputStyles: React.CSSProperties = {
  padding: '10px 12px',
  border: '1.5px solid #E2E8F0',
  borderRadius: '8px',
  fontSize: '14px',
  fontFamily: 'Tajawal, sans-serif',
  textAlign: 'right',
}

const modalButtonsStyles: React.CSSProperties = {
  display: 'flex',
  gap: '12px',
  justifyContent: 'flex-end',
  marginTop: '24px',
}

export default AdminCompanies
