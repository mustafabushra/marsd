import { useState } from 'react'

export default function AdminDataExport() {
  const [exportFormat, setExportFormat] = useState('csv')
  const [selectedData, setSelectedData] = useState({
    companies: true,
    reports: true,
    users: true,
    subscriptions: false,
    payments: false,
  })
  const [dateRange, setDateRange] = useState({ from: '2026-01-01', to: '2026-07-15' })
  const [isExporting, setIsExporting] = useState(false)

  const handleExport = async () => {
    setIsExporting(true)
    try {
      const response = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          format: exportFormat,
          data: selectedData,
          dateRange,
        }),
      })

      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `marsad-export-${new Date().toISOString().split('T')[0]}.${exportFormat}`
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
      }
    } catch (err) {
      console.error('Export failed:', err)
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div style={{ padding: '24px', maxWidth: '800px' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '26px', fontWeight: 900, color: '#0F172A', margin: '0 0 4px 0', textAlign: 'right' }}>
          تصدير البيانات
        </h1>
        <p style={{ fontSize: '14px', color: '#64748B', margin: 0, textAlign: 'right' }}>
          صدّر بيانات المنصة إلى صيغ مختلفة
        </p>
      </div>

      {/* Export Form */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '24px' }}>
        {/* Format Selection */}
        <div style={{ marginBottom: '24px' }}>
          <h2 style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', margin: '0 0 12px 0', textAlign: 'right' }}>
            صيغة التصدير
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
            {[
              { value: 'csv', label: 'CSV' },
              { value: 'xlsx', label: 'Excel' },
              { value: 'json', label: 'JSON' },
            ].map(format => (
              <button
                key={format.value}
                onClick={() => setExportFormat(format.value)}
                style={{
                  padding: '12px 16px',
                  background: exportFormat === format.value ? '#16A34A' : '#F8FAFC',
                  color: exportFormat === format.value ? '#fff' : '#1E2A52',
                  border: exportFormat === format.value ? 'none' : '1px solid #E2E8F0',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                {format.label}
              </button>
            ))}
          </div>
        </div>

        {/* Data Selection */}
        <div style={{ marginBottom: '24px' }}>
          <h2 style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', margin: '0 0 12px 0', textAlign: 'right' }}>
            اختر البيانات المراد تصديرها
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {[
              { key: 'companies', label: 'الشركات' },
              { key: 'reports', label: 'التقارير' },
              { key: 'users', label: 'المستخدمون' },
              { key: 'subscriptions', label: 'الاشتراكات' },
              { key: 'payments', label: 'المدفوعات' },
            ].map(item => (
              <label
                key={item.key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  fontSize: '14px',
                  color: '#475569',
                  cursor: 'pointer',
                  flexDirection: 'row-reverse',
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedData[item.key]}
                  onChange={(e) => setSelectedData({ ...selectedData, [item.key]: e.target.checked })}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
                {item.label}
              </label>
            ))}
          </div>
        </div>

        {/* Date Range */}
        <div style={{ marginBottom: '24px', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
          <div>
            <label style={{ fontSize: '13px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '6px', textAlign: 'right' }}>من</label>
            <input
              type="date"
              value={dateRange.from}
              onChange={(e) => setDateRange({ ...dateRange, from: e.target.value })}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #E2E8F0',
                borderRadius: '8px',
                fontSize: '13px',
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: '13px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '6px', textAlign: 'right' }}>إلى</label>
            <input
              type="date"
              value={dateRange.to}
              onChange={(e) => setDateRange({ ...dateRange, to: e.target.value })}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #E2E8F0',
                borderRadius: '8px',
                fontSize: '13px',
              }}
            />
          </div>
        </div>

        {/* Info Box */}
        <div style={{
          background: '#E0F2FE',
          border: '1px solid #BAE6FD',
          borderRadius: '8px',
          padding: '12px 14px',
          marginBottom: '24px',
          fontSize: '13px',
          color: '#0369A1',
          textAlign: 'right',
        }}>
          ℹ️ الملف سيحتوي على بيانات من {Object.values(selectedData).filter(Boolean).length} فئة. قد يستغرق التصدير عدة ثوان.
        </div>

        {/* Export Button */}
        <button
          onClick={handleExport}
          disabled={isExporting || !Object.values(selectedData).some(Boolean)}
          style={{
            width: '100%',
            padding: '12px 24px',
            background: isExporting || !Object.values(selectedData).some(Boolean) ? '#CCCCCC' : '#16A34A',
            color: '#fff',
            border: 'none',
            borderRadius: '10px',
            fontSize: '14px',
            fontWeight: 800,
            cursor: isExporting || !Object.values(selectedData).some(Boolean) ? 'not-allowed' : 'pointer',
          }}
        >
          {isExporting ? 'جاري التصدير...' : '⬇️ تصدير الآن'}
        </button>
      </div>

      {/* Usage Stats */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '20px', marginTop: '24px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A', margin: '0 0 16px 0', textAlign: 'right' }}>
          آخر التصديرات
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {[
            { date: '2026-07-13', format: 'CSV', user: 'محمد علي', size: '2.4 MB' },
            { date: '2026-07-10', format: 'Excel', user: 'فاطمة خالد', size: '5.1 MB' },
            { date: '2026-07-05', format: 'JSON', user: 'أحمد سالم', size: '8.7 MB' },
          ].map((export_, idx) => (
            <div key={idx} style={{
              display: 'flex',
              justifyContent: 'space-between',
              paddingBottom: '12px',
              borderBottom: idx < 2 ? '1px solid #E2E8F0' : 'none',
              textAlign: 'right',
            }}>
              <span style={{ fontSize: '12px', color: '#64748B' }}>{export_.size}</span>
              <span style={{ fontSize: '12px', color: '#64748B' }}>{export_.user}</span>
              <span style={{ fontSize: '12px', color: '#94A3B8' }}>{export_.date}</span>
              <span style={{
                padding: '2px 8px',
                background: '#E0F2FE',
                color: '#0369A1',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: 600,
              }}>
                {export_.format}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
