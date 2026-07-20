import { useState } from 'react'

export default function AdminSystemHealth() {
  const [metrics] = useState({
    database: { status: 'healthy', cpu: 34, memory: 62, uptime: '45d 12h' },
    api: { status: 'healthy', latency: 142, errorRate: 0.02, requests: '12.5K/min' },
    cache: { status: 'healthy', hitRate: 94.2, size: '2.8GB', evictions: 142 },
    queue: { status: 'warning', jobs: 1247, pending: 89, avgTime: '2.3s' },
    storage: { status: 'healthy', used: '542GB', total: '1TB', usage: 54.2 },
    backup: { status: 'healthy', lastBackup: '2026-07-15 02:30', frequency: 'daily', retention: '30d' },
  })

  const getStatusColor = (status) => {
    if (status === 'healthy') return { bg: '#DCFCE7', color: '#15803D' }
    if (status === 'warning') return { bg: '#FEF3C7', color: '#B45309' }
    return { bg: '#FEE2E2', color: '#DC2626' }
  }

  return (
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '26px', fontWeight: 900, color: '#0F172A', margin: '0 0 4px 0', textAlign: 'right' }}>
          حالة النظام
        </h1>
        <p style={{ fontSize: '14px', color: '#64748B', margin: 0, textAlign: 'right' }}>
          مراقبة الأداء والموارد الحية
        </p>
      </div>

      {/* Services Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
        {Object.entries(metrics).map(([service, data]) => {
          const statusColor = getStatusColor(data.status)
          return (
            <div key={service} style={{
              background: '#fff',
              border: '1px solid #E2E8F0',
              borderRadius: '12px',
              padding: '20px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexDirection: 'row-reverse' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A', margin: 0, textTransform: 'capitalize' }}>
                  {service === 'database' && 'قاعدة البيانات'}
                  {service === 'api' && 'واجهة البرمجة'}
                  {service === 'cache' && 'الذاكرة المؤقتة'}
                  {service === 'queue' && 'طابور المهام'}
                  {service === 'storage' && 'التخزين'}
                  {service === 'backup' && 'النسخ الاحتياطية'}
                </h3>
                <span style={{
                  padding: '4px 12px',
                  background: statusColor.bg,
                  color: statusColor.color,
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 600,
                }}>
                  {data.status === 'healthy' && '✓ سليم'}
                  {data.status === 'warning' && '⚠ تحذير'}
                  {data.status === 'error' && '✕ خطأ'}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {service === 'database' && (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                      <span style={{ color: '#94A3B8' }}>{data.cpu}%</span>
                      <span style={{ color: '#64748B', fontWeight: 600 }}>CPU</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                      <span style={{ color: '#94A3B8' }}>{data.memory}%</span>
                      <span style={{ color: '#64748B', fontWeight: 600 }}>الذاكرة</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                      <span style={{ color: '#94A3B8' }}>{data.uptime}</span>
                      <span style={{ color: '#64748B', fontWeight: 600 }}>وقت التشغيل</span>
                    </div>
                  </>
                )}
                {service === 'api' && (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                      <span style={{ color: '#94A3B8' }}>{data.latency}ms</span>
                      <span style={{ color: '#64748B', fontWeight: 600 }}>التأخير</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                      <span style={{ color: '#94A3B8' }}>{(data.errorRate * 100).toFixed(2)}%</span>
                      <span style={{ color: '#64748B', fontWeight: 600 }}>معدل الأخطاء</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                      <span style={{ color: '#94A3B8' }}>{data.requests}</span>
                      <span style={{ color: '#64748B', fontWeight: 600 }}>الطلبات</span>
                    </div>
                  </>
                )}
                {service === 'cache' && (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                      <span style={{ color: '#94A3B8' }}>{data.hitRate}%</span>
                      <span style={{ color: '#64748B', fontWeight: 600 }}>معدل الإصابة</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                      <span style={{ color: '#94A3B8' }}>{data.size}</span>
                      <span style={{ color: '#64748B', fontWeight: 600 }}>الحجم المستخدم</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                      <span style={{ color: '#94A3B8' }}>{data.evictions}</span>
                      <span style={{ color: '#64748B', fontWeight: 600 }}>الإزالات</span>
                    </div>
                  </>
                )}
                {service === 'queue' && (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                      <span style={{ color: '#94A3B8' }}>{data.jobs}</span>
                      <span style={{ color: '#64748B', fontWeight: 600 }}>المهام الكلية</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                      <span style={{ color: '#94A3B8' }}>{data.pending}</span>
                      <span style={{ color: '#64748B', fontWeight: 600 }}>قيد الانتظار</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                      <span style={{ color: '#94A3B8' }}>{data.avgTime}</span>
                      <span style={{ color: '#64748B', fontWeight: 600 }}>متوسط الوقت</span>
                    </div>
                  </>
                )}
                {service === 'storage' && (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                      <span style={{ color: '#94A3B8' }}>{data.used} / {data.total}</span>
                      <span style={{ color: '#64748B', fontWeight: 600 }}>المساحة</span>
                    </div>
                    <div style={{ height: '6px', background: '#E2E8F0', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        background: '#F59E0B',
                        width: `${data.usage}%`,
                      }} />
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748B', textAlign: 'right' }}>
                      {data.usage}% مستخدم
                    </div>
                  </>
                )}
                {service === 'backup' && (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                      <span style={{ color: '#94A3B8' }}>{data.lastBackup}</span>
                      <span style={{ color: '#64748B', fontWeight: 600 }}>آخر نسخة</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                      <span style={{ color: '#94A3B8' }}>{data.frequency}</span>
                      <span style={{ color: '#64748B', fontWeight: 600 }}>التكرار</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                      <span style={{ color: '#94A3B8' }}>{data.retention}</span>
                      <span style={{ color: '#64748B', fontWeight: 600 }}>فترة الاحتفاظ</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Actions */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '20px', marginTop: '24px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A', margin: '0 0 16px 0', textAlign: 'right' }}>
          الإجراءات
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
          <button style={{
            padding: '10px 16px',
            background: '#E0F2FE',
            color: '#0369A1',
            border: 'none',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
          }}>
            مسح الذاكرة
          </button>
          <button style={{
            padding: '10px 16px',
            background: '#F0E5FF',
            color: '#7C3AED',
            border: 'none',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
          }}>
            مراجعة السجلات
          </button>
          <button style={{
            padding: '10px 16px',
            background: '#FEE2E2',
            color: '#DC2626',
            border: 'none',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
          }}>
            إعادة تشغيل الخدمة
          </button>
        </div>
      </div>
    </div>
  )
}
