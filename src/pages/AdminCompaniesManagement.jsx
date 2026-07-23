import { useState, useEffect } from 'react'
import { Search, Trash2, Edit2, Plus, AlertCircle, CheckCircle } from 'lucide-react'
import * as api from '../lib/api'

export default function AdminCompaniesManagement() {
  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedStatus, setSelectedStatus] = useState('all')
  const [showAddForm, setShowAddForm] = useState(false)
  const [error, setError] = useState(null)
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, pages: 1 })
  const [formData, setFormData] = useState({
    name: '',
    crNumber: '',
    sector: '',
    city: '',
    email: '',
    phone: '',
    status: 'active'
  })

  useEffect(() => {
    loadCompanies()
  }, [])

  const loadCompanies = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await api.getAdminCompanies(pagination.page, pagination.limit)
      const formattedCompanies = (response.data || []).map(c => ({
        id: c.id,
        name: c.name,
        crNumber: c.cr_number,
        sector: c.sector || '—',
        city: c.city || '—',
        status: 'active',
        trustScore: c.trust_score?.score || 0,
        riskBand: c.trust_score?.risk_band || 'none',
        reportsCount: c.trust_score?.approved_reports || 0,
        createdAt: new Date(c.created_at).toLocaleDateString('ar-SA')
      }))
      setCompanies(formattedCompanies)
      setPagination(response.pagination || {})
    } catch (err) {
      setError(err.message || 'حدث خطأ في تحميل الشركات')
      console.error('Error loading companies:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleAddCompany = (e) => {
    e.preventDefault()
    setShowAddForm(false)
    setFormData({ name: '', crNumber: '', sector: '', city: '', email: '', phone: '', status: 'active' })
  }

  const handleDeleteCompany = (id) => {
    if (window.confirm('هل أنت متأكد من حذف هذه الشركة؟')) {
      setCompanies(companies.filter(c => c.id !== id))
    }
  }

  const filteredCompanies = companies.filter(c => {
    const matchesSearch = c.name.includes(searchTerm) || c.crNumber.includes(searchTerm)
    const matchesStatus = selectedStatus === 'all' || c.status === selectedStatus
    return matchesSearch && matchesStatus
  })

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ display: 'inline-block', width: '40px', height: '40px', border: '4px solid #E2E8F0', borderTop: '4px solid #16A34A', borderRadius: '50%', animation: 'spin 1s linear infinite', marginBottom: '16px' }}></div>
          <p style={{ color: '#64748B', fontSize: '14px' }}>جاري تحميل الشركات...</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '32px' }}>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 900, color: '#0F172A', margin: '0 0 8px 0', textAlign: 'right' }}>إدارة الشركات</h1>
        <p style={{ color: '#64748B', fontSize: '14px', textAlign: 'right' }}>إدارة الشركات المسجلة والعملاء</p>
      </div>

      {/* Error Message */}
      {error && (
        <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: '12px', padding: '14px 16px', marginBottom: '20px', fontSize: '14px', color: '#991B1B', fontWeight: 600 }}>
          ⚠️ {error}
        </div>
      )}

      {/* Top Controls */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', justifyContent: 'space-between', flexWrap: 'wrap', flexDirection: 'row-reverse' }}>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: '#16A34A',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            padding: '10px 16px',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '14px'
          }}
        >
          <Plus size={18} />
          إضافة شركة جديدة
        </button>

        <div style={{ display: 'flex', gap: '12px' }}>
          <input
            type="text"
            placeholder="ابحث عن شركة..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              border: '1px solid #E2E8F0',
              borderRadius: '8px',
              padding: '10px 12px',
              fontSize: '14px',
              width: '250px',
              outline: 'none'
            }}
          />
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            style={{
              border: '1px solid #E2E8F0',
              borderRadius: '8px',
              padding: '10px 12px',
              fontSize: '14px',
              outline: 'none',
              minWidth: '150px'
            }}
          >
            <option value="all">جميع الحالات</option>
            <option value="active">نشطة</option>
            <option value="inactive">غير نشطة</option>
          </select>
        </div>
      </div>

      {/* Add Form */}
      {showAddForm && (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '24px', marginBottom: '24px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 900, color: '#0F172A', margin: '0 0 20px 0', textAlign: 'right' }}>إضافة شركة جديدة</h3>
          <form onSubmit={handleAddCompany}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <input
                type="text"
                placeholder="اسم الشركة"
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                required
                style={{ border: '1px solid #E2E8F0', borderRadius: '8px', padding: '10px', fontSize: '14px', outline: 'none' }}
              />
              <input
                type="text"
                placeholder="رقم السجل التجاري"
                value={formData.crNumber}
                onChange={(e) => setFormData({...formData, crNumber: e.target.value})}
                required
                style={{ border: '1px solid #E2E8F0', borderRadius: '8px', padding: '10px', fontSize: '14px', outline: 'none' }}
              />
              <input
                type="text"
                placeholder="القطاع"
                value={formData.sector}
                onChange={(e) => setFormData({...formData, sector: e.target.value})}
                required
                style={{ border: '1px solid #E2E8F0', borderRadius: '8px', padding: '10px', fontSize: '14px', outline: 'none' }}
              />
              <input
                type="text"
                placeholder="المدينة"
                value={formData.city}
                onChange={(e) => setFormData({...formData, city: e.target.value})}
                required
                style={{ border: '1px solid #E2E8F0', borderRadius: '8px', padding: '10px', fontSize: '14px', outline: 'none' }}
              />
              <input
                type="email"
                placeholder="البريد الإلكتروني"
                value={formData.email}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
                required
                style={{ border: '1px solid #E2E8F0', borderRadius: '8px', padding: '10px', fontSize: '14px', outline: 'none' }}
              />
              <input
                type="tel"
                placeholder="رقم الهاتف"
                value={formData.phone}
                onChange={(e) => setFormData({...formData, phone: e.target.value})}
                required
                style={{ border: '1px solid #E2E8F0', borderRadius: '8px', padding: '10px', fontSize: '14px', outline: 'none' }}
              />
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                style={{ border: '1px solid #E2E8F0', borderRadius: '8px', padding: '10px 16px', cursor: 'pointer', fontWeight: 600 }}
              >
                إلغاء
              </button>
              <button
                type="submit"
                style={{ background: '#16A34A', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 16px', cursor: 'pointer', fontWeight: 600 }}
              >
                إضافة
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Companies Table */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #E2E8F0', background: '#F8FAFC' }}>
              <th style={{ padding: '16px', textAlign: 'right', fontWeight: 700, color: '#475569', fontSize: '13px' }}>اسم الشركة</th>
              <th style={{ padding: '16px', textAlign: 'right', fontWeight: 700, color: '#475569', fontSize: '13px' }}>رقم السجل</th>
              <th style={{ padding: '16px', textAlign: 'right', fontWeight: 700, color: '#475569', fontSize: '13px' }}>القطاع</th>
              <th style={{ padding: '16px', textAlign: 'right', fontWeight: 700, color: '#475569', fontSize: '13px' }}>مؤشر الثقة</th>
              <th style={{ padding: '16px', textAlign: 'right', fontWeight: 700, color: '#475569', fontSize: '13px' }}>التقارير</th>
              <th style={{ padding: '16px', textAlign: 'center', fontWeight: 700, color: '#475569', fontSize: '13px' }}>الحالة</th>
              <th style={{ padding: '16px', textAlign: 'center', fontWeight: 700, color: '#475569', fontSize: '13px' }}>الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {filteredCompanies.map((company) => (
              <tr key={company.id} style={{ borderBottom: '1px solid #E2E8F0', '&:hover': { background: '#F8FAFC' } }}>
                <td style={{ padding: '16px', textAlign: 'right', color: '#0F172A', fontWeight: 600 }}>{company.name}</td>
                <td style={{ padding: '16px', textAlign: 'right', color: '#64748B', fontSize: '14px' }}>{company.crNumber}</td>
                <td style={{ padding: '16px', textAlign: 'right', color: '#64748B', fontSize: '14px' }}>{company.sector}</td>
                <td style={{ padding: '16px', textAlign: 'right', color: '#16A34A', fontWeight: 600, fontSize: '14px' }}>{company.trustScore}%</td>
                <td style={{ padding: '16px', textAlign: 'right', color: '#64748B', fontSize: '14px' }}>{company.reportsCount}</td>
                <td style={{ padding: '16px', textAlign: 'center' }}>
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: company.status === 'active' ? '#F0FDF4' : '#FEF2F2',
                    color: company.status === 'active' ? '#166534' : '#991B1B',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 600
                  }}>
                    {company.status === 'active' ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
                    {company.status === 'active' ? 'نشطة' : 'غير نشطة'}
                  </span>
                </td>
                <td style={{ padding: '16px', textAlign: 'center', display: 'flex', gap: '8px', justifyContent: 'center' }}>
                  <button
                    onClick={() => alert('تعديل الشركة: ' + company.name)}
                    style={{ background: '#3B82F6', color: '#fff', border: 'none', borderRadius: '6px', padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}
                  >
                    <Edit2 size={14} />
                    تعديل
                  </button>
                  <button
                    onClick={() => handleDeleteCompany(company.id)}
                    style={{ background: '#EF4444', color: '#fff', border: 'none', borderRadius: '6px', padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}
                  >
                    <Trash2 size={14} />
                    حذف
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredCompanies.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px', color: '#64748B' }}>
            <p style={{ margin: 0, fontSize: '14px' }}>لا توجد شركات بالمعايير المختارة</p>
          </div>
        )}
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginTop: '24px' }}>
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px', textAlign: 'center' }}>
          <p style={{ color: '#64748B', fontSize: '12px', margin: '0 0 8px 0' }}>إجمالي الشركات</p>
          <p style={{ fontSize: '24px', fontWeight: 900, color: '#0F172A', margin: 0 }}>{companies.length}</p>
        </div>
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px', textAlign: 'center' }}>
          <p style={{ color: '#64748B', fontSize: '12px', margin: '0 0 8px 0' }}>الشركات النشطة</p>
          <p style={{ fontSize: '24px', fontWeight: 900, color: '#16A34A', margin: 0 }}>{companies.filter(c => c.status === 'active').length}</p>
        </div>
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px', textAlign: 'center' }}>
          <p style={{ color: '#64748B', fontSize: '12px', margin: '0 0 8px 0' }}>متوسط مؤشر الثقة</p>
          <p style={{ fontSize: '24px', fontWeight: 900, color: '#3B82F6', margin: 0 }}>{Math.round(companies.reduce((a, c) => a + c.trustScore, 0) / companies.length)}%</p>
        </div>
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px', textAlign: 'center' }}>
          <p style={{ color: '#64748B', fontSize: '12px', margin: '0 0 8px 0' }}>إجمالي التقارير</p>
          <p style={{ fontSize: '24px', fontWeight: 900, color: '#F59E0B', margin: 0 }}>{companies.reduce((a, c) => a + c.reportsCount, 0)}</p>
        </div>
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        tr:hover {
          background: #F8FAFC !important;
        }
      `}</style>
    </div>
  )
}
