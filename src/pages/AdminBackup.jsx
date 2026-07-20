import { useState } from 'react'

export default function AdminBackup() {
  const [backups, setBackups] = useState([
    {
      id: 1,
      timestamp: '2026-07-15 02:30',
      size: '2.4 GB',
      status: 'completed',
      type: 'full',
      duration: '45 min',
      recoveryTime: '2 hours',
    },
    {
      id: 2,
      timestamp: '2026-07-14 02:15',
      size: '2.3 GB',
      status: 'completed',
      type: 'full',
      duration: '43 min',
      recoveryTime: '2 hours',
    },
    {
      id: 3,
      timestamp: '2026-07-13 02:00',
      size: '2.2 GB',
      status: 'completed',
      type: 'full',
      duration: '41 min',
      recoveryTime: '2 hours',
    },
    {
      id: 4,
      timestamp: '2026-07-12 02:45',
      size: '2.1 GB',
      status: 'failed',
      type: 'full',
      duration: null,
      error: 'خطأ في الاتصال بقاعدة البيانات',
    },
  ])

  const [backupConfig, setBackupConfig] = useState({
    frequency: 'daily',
    time: '02:00',
    retention: '30',
    backupType: 'full',
    autoRestart: true,
    alertOnFailure: true,
  })

  const [isRunningBackup, setIsRunningBackup] = useState(false)

  const handleStartBackup = async () => {
    setIsRunningBackup(true)
    setTimeout(() => {
      const newBackup = {
        id: backups.length + 1,
        timestamp: new Date().toLocaleString('ar-SA'),
        size: '2.5 GB',
        status: 'completed',
        type: 'full',
        duration: '42 min',
        recoveryTime: '2 hours',
      }
      setBackups([newBackup, ...backups])
      setIsRunningBackup(false)
    }, 2000)
  }

  return (
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexDirection: 'row-reverse' }}>
        <div>
          <h1 style={{ fontSize: '26px', fontWeight: 900, color: '#0F172A', margin: '0 0 4px 0', textAlign: 'right' }}>
            النسخ الاحتياطية
          </h1>
          <p style={{ fontSize: '14px', color: '#64748B', margin: 0, textAlign: 'right' }}>
            إدارة النسخ الاحتياطية للبيانات
          </p>
        </div>
        <button
          onClick={handleStartBackup}
          disabled={isRunningBackup}
          style={{
            padding: '10px 20px',
            background: isRunningBackup ? '#CCCCCC' : '#16A34A',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: 700,
            cursor: isRunningBackup ? 'not-allowed' : 'pointer',
          }}
        >
          {isRunningBackup ? 'جاري النسخ...' : '💾 بدء النسخ الآن'}
        </button>
      </div>

      {/* Backup Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px' }}>
          <p style={{ fontSize: '12px', color: '#64748B', margin: '0 0 8px 0', textAlign: 'right' }}>إجمالي النسخ</p>
          <p style={{ fontSize: '24px', fontWeight: 900, color: '#1E2A52', margin: 0, textAlign: 'right' }}>{backups.length}</p>
        </div>
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px' }}>
          <p style={{ fontSize: '12px', color: '#64748B', margin: '0 0 8px 0', textAlign: 'right' }}>ناجحة</p>
          <p style={{ fontSize: '24px', fontWeight: 900, color: '#16A34A', margin: 0, textAlign: 'right' }}>
            {backups.filter(b => b.status === 'completed').length}
          </p>
        </div>
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px' }}>
          <p style={{ fontSize: '12px', color: '#64748B', margin: '0 0 8px 0', textAlign: 'right' }}>فاشلة</p>
          <p style={{ fontSize: '24px', fontWeight: 900, color: '#DC2626', margin: 0, textAlign: 'right' }}>
            {backups.filter(b => b.status === 'failed').length}
          </p>
        </div>
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px' }}>
          <p style={{ fontSize: '12px', color: '#64748B', margin: '0 0 8px 0', textAlign: 'right' }}>المساحة الكلية</p>
          <p style={{ fontSize: '20px', fontWeight: 900, color: '#0369A1', margin: 0, textAlign: 'right' }}>
            {(backups.length * 2.3).toFixed(1)} GB
          </p>
        </div>
      </div>

      {/* Configuration */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '20px', marginBottom: '24px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A', margin: '0 0 16px 0', textAlign: 'right' }}>
          إعدادات النسخ الاحتياطية
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
          <div>
            <label style={{ fontSize: '13px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '6px', textAlign: 'right' }}>
              التكرار
            </label>
            <select
              value={backupConfig.frequency}
              onChange={(e) => setBackupConfig({ ...backupConfig, frequency: e.target.value })}
              style={{
                width: '100%',
                padding: '8px 10px',
                border: '1px solid #E2E8F0',
                borderRadius: '6px',
                fontSize: '13px',
              }}
            >
              <option value="daily">يومي</option>
              <option value="weekly">أسبوعي</option>
              <option value="monthly">شهري</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: '13px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '6px', textAlign: 'right' }}>
              الوقت
            </label>
            <input
              type="time"
              value={backupConfig.time}
              onChange={(e) => setBackupConfig({ ...backupConfig, time: e.target.value })}
              style={{
                width: '100%',
                padding: '8px 10px',
                border: '1px solid #E2E8F0',
                borderRadius: '6px',
                fontSize: '13px',
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: '13px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '6px', textAlign: 'right' }}>
              فترة الاحتفاظ (أيام)
            </label>
            <input
              type="number"
              value={backupConfig.retention}
              onChange={(e) => setBackupConfig({ ...backupConfig, retention: e.target.value })}
              style={{
                width: '100%',
                padding: '8px 10px',
                border: '1px solid #E2E8F0',
                borderRadius: '6px',
                fontSize: '13px',
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: '13px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '6px', textAlign: 'right' }}>
              نوع النسخ
            </label>
            <select
              value={backupConfig.backupType}
              onChange={(e) => setBackupConfig({ ...backupConfig, backupType: e.target.value })}
              style={{
                width: '100%',
                padding: '8px 10px',
                border: '1px solid #E2E8F0',
                borderRadius: '6px',
                fontSize: '13px',
              }}
            >
              <option value="full">كامل</option>
              <option value="incremental">إضافي</option>
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '16px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#475569', cursor: 'pointer', flexDirection: 'row-reverse' }}>
            <input type="checkbox" checked={backupConfig.autoRestart} onChange={(e) => setBackupConfig({ ...backupConfig, autoRestart: e.target.checked })} />
            إعادة تشغيل تلقائية بعد الانتهاء
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#475569', cursor: 'pointer', flexDirection: 'row-reverse' }}>
            <input type="checkbox" checked={backupConfig.alertOnFailure} onChange={(e) => setBackupConfig({ ...backupConfig, alertOnFailure: e.target.checked })} />
            تنبيهات عند الفشل
          </label>
        </div>
        <button
          style={{
            marginTop: '16px',
            width: '100%',
            padding: '10px 16px',
            background: '#16A34A',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          حفظ الإعدادات
        </button>
      </div>

      {/* Backup History */}
      <div style={{ background: '#fff', borderRadius: '12px', overflow: 'hidden', border: '1px solid #E2E8F0' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
              <th style={{ padding: '16px', textAlign: 'right', fontSize: '13px', fontWeight: 700, color: '#475569', borderLeft: '1px solid #E2E8F0' }}>التاريخ والوقت</th>
              <th style={{ padding: '16px', textAlign: 'right', fontSize: '13px', fontWeight: 700, color: '#475569', borderLeft: '1px solid #E2E8F0' }}>الحجم</th>
              <th style={{ padding: '16px', textAlign: 'right', fontSize: '13px', fontWeight: 700, color: '#475569', borderLeft: '1px solid #E2E8F0' }}>المدة</th>
              <th style={{ padding: '16px', textAlign: 'right', fontSize: '13px', fontWeight: 700, color: '#475569', borderLeft: '1px solid #E2E8F0' }}>الحالة</th>
              <th style={{ padding: '16px', textAlign: 'right', fontSize: '13px', fontWeight: 700, color: '#475569' }}>الإجراء</th>
            </tr>
          </thead>
          <tbody>
            {backups.map(backup => (
              <tr key={backup.id} style={{ borderBottom: '1px solid #E2E8F0' }}>
                <td style={{ padding: '16px', fontSize: '13px', color: '#0F172A', fontWeight: 600, borderLeft: '1px solid #E2E8F0' }}>
                  {backup.timestamp}
                </td>
                <td style={{ padding: '16px', fontSize: '13px', color: '#64748B', borderLeft: '1px solid #E2E8F0' }}>
                  {backup.size}
                </td>
                <td style={{ padding: '16px', fontSize: '13px', color: '#64748B', borderLeft: '1px solid #E2E8F0' }}>
                  {backup.duration || '-'}
                </td>
                <td style={{ padding: '16px', borderLeft: '1px solid #E2E8F0' }}>
                  <span style={{
                    padding: '4px 10px',
                    background: backup.status === 'completed' ? '#DCFCE7' : '#FEE2E2',
                    color: backup.status === 'completed' ? '#15803D' : '#DC2626',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 600,
                  }}>
                    {backup.status === 'completed' ? '✓ ناجحة' : '✗ فاشلة'}
                  </span>
                </td>
                <td style={{ padding: '16px' }}>
                  {backup.status === 'completed' ? (
                    <button
                      style={{
                        padding: '6px 12px',
                        background: '#E0F2FE',
                        color: '#0369A1',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      استعادة
                    </button>
                  ) : (
                    <span style={{ fontSize: '11px', color: '#DC2626' }}>
                      {backup.error}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
