import { useState } from 'react'
import { CloseIcon, FileIcon } from '../components/icons'

export default function MyReports() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selectedReport, setSelectedReport] = useState(null)

  const [reports] = useState([
    { id: 1, company: 'مؤسسة الخليج للتجارة', date: '2026-07-11', value: '120,000 ر.س', status: 'معتمد', st: { bg: '#ECFDF5', c: '#15803D', label: 'معتمد' }, paid: 'تم السداد', delay: '4 أيام', due: 'لا', period: '2026-03-01 إلى 2026-05-30' },
    { id: 2, company: 'الرياض للتجارة', date: '2026-07-08', value: '80,000 ر.س', status: 'معتمد', st: { bg: '#ECFDF5', c: '#15803D', label: 'معتمد' }, paid: 'تم السداد', delay: '7 أيام', due: 'لا', period: '2026-02-15 إلى 2026-05-15' },
    { id: 3, company: 'التقنية المتقدمة', date: '2026-07-05', value: '150,000 ر.س', status: 'قيد المراجعة', st: { bg: '#FFFBEB', c: '#B45309', label: 'قيد المراجعة' }, paid: 'جزئي', delay: '12 يوم', due: 'نعم', period: '2026-01-01 إلى 2026-06-01' },
  ])

  const handleOpenDrawer = (report) => {
    setSelectedReport(report)
    setDrawerOpen(true)
  }

  const handleCloseDrawer = () => {
    setDrawerOpen(false)
    setSelectedReport(null)
  }

  return (
    <main style={{ background: '#F8FAFC', minHeight: '100vh', padding: '28px 32px' }}>
      {/* Filters */}
      <div style={{ display: 'flex', gap: '9px', marginBottom: '18px', flexDirection: 'row-reverse' }}>
        <span style={{ background: '#1E2A52', color: '#fff', borderRadius: '999px', padding: '8px 18px', fontSize: '13.5px', fontWeight: 800, cursor: 'pointer' }}>الكل</span>
        <span style={{ background: '#fff', color: '#B45309', border: '1.5px solid #FDE68A', borderRadius: '999px', padding: '8px 18px', fontSize: '13.5px', fontWeight: 700, cursor: 'pointer' }}>قيد المراجعة</span>
        <span style={{ background: '#fff', color: '#15803D', border: '1.5px solid #BBF7D0', borderRadius: '999px', padding: '8px 18px', fontSize: '13.5px', fontWeight: 700, cursor: 'pointer' }}>معتمد</span>
        <span style={{ background: '#fff', color: '#B91C1C', border: '1.5px solid #FECACA', borderRadius: '999px', padding: '8px 18px', fontSize: '13.5px', fontWeight: 700, cursor: 'pointer' }}>مرفوض</span>
      </div>

      {/* Table */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2.5fr 1.2fr 1.2fr 1fr', padding: '15px 22px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', fontSize: '13px', fontWeight: 800, color: '#64748B' }}>
          <span>الشركة المُبلَّغ عنها</span>
          <span>تاريخ الإرسال</span>
          <span>قيمة التعامل</span>
          <span>الحالة</span>
        </div>
        {reports.map(r => (
          <div key={r.id} onClick={() => handleOpenDrawer(r)} style={{ display: 'grid', gridTemplateColumns: '2.5fr 1.2fr 1.2fr 1fr', padding: '16px 22px', borderBottom: '1px solid #F1F5F9', alignItems: 'center', cursor: 'pointer' }}>
            <span style={{ fontSize: '14.5px', fontWeight: 700, color: '#0F172A' }}>{r.company}</span>
            <span style={{ fontSize: '14px', color: '#64748B', fontWeight: 600 }}>{r.date}</span>
            <span style={{ fontSize: '14px', color: '#334155', fontWeight: 700 }}>{r.value}</span>
            <span style={{ background: r.st.bg, color: r.st.c, borderRadius: '7px', padding: '5px 12px', fontSize: '12.5px', fontWeight: 800 }}>{r.st.label}</span>
          </div>
        ))}
      </div>

      <p style={{ fontSize: '13px', color: '#94A3B8', margin: '14px 2px 0', fontWeight: 600 }}>اضغط على أي صف لعرض التفاصيل الكاملة للتقرير.</p>

      {/* Drawer */}
      {drawerOpen && selectedReport && (
        <>
          <div onClick={handleCloseDrawer} style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(15,23,42,.5)' }}></div>
          <div style={{ position: 'fixed', top: 0, bottom: 0, left: 0, zIndex: 81, width: '480px', maxWidth: '92vw', background: '#fff', boxShadow: '8px 0 40px rgba(0,0,0,.2)', overflowY: 'auto' }} dir="rtl">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '22px 26px', borderBottom: '1px solid #E2E8F0', position: 'sticky', top: 0, background: '#fff', flexDirection: 'row-reverse' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 900, color: '#0F172A', margin: '0 0 0 0', textAlign: 'right' }}>تفاصيل التقرير</h3>
              <button onClick={handleCloseDrawer} style={{ background: '#F1F5F9', border: 0, borderRadius: '9px', width: '34px', height: '34px', cursor: 'pointer', color: '#64748B', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CloseIcon />
              </button>
            </div>
            <div style={{ padding: '26px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '22px' }}>
                <div>
                  <div style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 700, marginBottom: '4px' }}>الشركة المُبلَّغ عنها</div>
                  <h2 style={{ fontSize: '19px', fontWeight: 900, color: '#0F172A', margin: 0 }}>{selectedReport.company}</h2>
                </div>
                <span style={{ background: selectedReport.st.bg, color: selectedReport.st.c, borderRadius: '8px', padding: '6px 14px', fontSize: '13px', fontWeight: 800 }}>{selectedReport.st.label}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '22px' }}>
                <div style={{ background: '#F8FAFC', borderRadius: '11px', padding: '15px' }}>
                  <div style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 700, marginBottom: '5px' }}>قيمة التعامل</div>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>{selectedReport.value}</div>
                </div>
                <div style={{ background: '#F8FAFC', borderRadius: '11px', padding: '15px' }}>
                  <div style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 700, marginBottom: '5px' }}>تاريخ الإرسال</div>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>{selectedReport.date}</div>
                </div>
                <div style={{ background: '#F8FAFC', borderRadius: '11px', padding: '15px' }}>
                  <div style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 700, marginBottom: '5px' }}>حالة السداد</div>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>{selectedReport.paid}</div>
                </div>
                <div style={{ background: '#F8FAFC', borderRadius: '11px', padding: '15px' }}>
                  <div style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 700, marginBottom: '5px' }}>متوسط التأخير</div>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>{selectedReport.delay}</div>
                </div>
                <div style={{ background: '#F8FAFC', borderRadius: '11px', padding: '15px' }}>
                  <div style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 700, marginBottom: '5px' }}>مبالغ مستحقة</div>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>{selectedReport.due}</div>
                </div>
                <div style={{ background: '#F8FAFC', borderRadius: '11px', padding: '15px' }}>
                  <div style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 700, marginBottom: '5px' }}>فترة التعامل</div>
                  <div style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>{selectedReport.period}</div>
                </div>
              </div>
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '8px' }}>المستندات المرفقة</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '9px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '11px 14px', color: '#64748B' }}>
                  <div style={{ flex: 'none', display: 'flex', alignItems: 'center' }}>
                    <FileIcon />
                  </div>
                  <span style={{ fontSize: '13.5px', fontWeight: 700, color: '#334155' }}>عقد_التعامل.pdf</span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </main>
  )
}
