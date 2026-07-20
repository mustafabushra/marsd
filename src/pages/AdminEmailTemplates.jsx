import { useState } from 'react'

export default function AdminEmailTemplates() {
  const [templates, setTemplates] = useState([
    {
      id: 1,
      name: 'تأكيد التسجيل',
      subject: 'تأكيد حسابك في مرصد',
      description: 'رسالة تأكيد البريد الإلكتروني',
      status: 'active',
      lastModified: '2026-07-10',
    },
    {
      id: 2,
      name: 'إعادة تعيين كلمة المرور',
      subject: 'إعادة تعيين كلمة المرور',
      description: 'رسالة إعادة تعيين كلمة المرور',
      status: 'active',
      lastModified: '2026-06-20',
    },
    {
      id: 3,
      name: 'إشعار التقرير الجديد',
      subject: 'تقرير جديد بانتظارك',
      description: 'إخطار بتوفر تقرير جديد',
      status: 'active',
      lastModified: '2026-07-05',
    },
    {
      id: 4,
      name: 'تنبيه منتهي الاشتراك',
      subject: 'اشتراكك سينتهي قريباً',
      description: 'تنبيه قبل انتهاء الاشتراك',
      status: 'draft',
      lastModified: '2026-07-12',
    },
  ])

  const [selectedTemplate, setSelectedTemplate] = useState(null)
  const [editMode, setEditMode] = useState(false)

  return (
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexDirection: 'row-reverse' }}>
        <div>
          <h1 style={{ fontSize: '26px', fontWeight: 900, color: '#0F172A', margin: '0 0 4px 0', textAlign: 'right' }}>
            نماذج البريد الإلكتروني
          </h1>
          <p style={{ fontSize: '14px', color: '#64748B', margin: 0, textAlign: 'right' }}>
            إدارة وتخصيص نماذج الرسائل
          </p>
        </div>
        <button
          style={{
            padding: '10px 20px',
            background: '#16A34A',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          + نموذج جديد
        </button>
      </div>

      {/* Templates Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
        {templates.map(template => (
          <div
            key={template.id}
            onClick={() => setSelectedTemplate(template)}
            style={{
              background: '#fff',
              border: '1px solid #E2E8F0',
              borderRadius: '12px',
              padding: '20px',
              cursor: 'pointer',
              transition: 'all 0.2s',
              borderColor: selectedTemplate?.id === template.id ? '#16A34A' : '#E2E8F0',
            }}
            onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 4px 12px rgba(15, 23, 42, 0.1)'}
            onMouseLeave={(e) => e.currentTarget.style.boxShadow = 'none'}
          >
            <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span style={{
                padding: '4px 10px',
                background: template.status === 'active' ? '#DCFCE7' : '#FEF3C7',
                color: template.status === 'active' ? '#15803D' : '#B45309',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 600,
              }}>
                {template.status === 'active' ? 'مفعّل' : 'مسودة'}
              </span>
            </div>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A', margin: '0 0 6px 0', textAlign: 'right' }}>
              {template.name}
            </h3>
            <p style={{ fontSize: '12px', color: '#64748B', margin: '0 0 8px 0', textAlign: 'right', lineHeight: 1.5 }}>
              {template.subject}
            </p>
            <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #F1F5F9' }}>
              آخر تعديل: {template.lastModified}
            </div>
          </div>
        ))}
      </div>

      {/* Template Editor */}
      {selectedTemplate && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            background: '#fff',
            borderRadius: '12px',
            padding: '24px',
            width: '90%',
            maxWidth: '600px',
            maxHeight: '80vh',
            overflowY: 'auto',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexDirection: 'row-reverse' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#0F172A', margin: 0 }}>
                {selectedTemplate.name}
              </h2>
              <button
                onClick={() => setSelectedTemplate(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  color: '#94A3B8',
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>

            {!editMode ? (
              <div>
                <div style={{ background: '#F8FAFC', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
                  <p style={{ fontSize: '12px', color: '#64748B', margin: '0 0 6px 0', textAlign: 'right' }}>الموضوع:</p>
                  <p style={{ fontSize: '14px', color: '#0F172A', margin: 0, textAlign: 'right' }}>
                    {selectedTemplate.subject}
                  </p>
                </div>
                <div style={{ background: '#F8FAFC', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
                  <p style={{ fontSize: '12px', color: '#64748B', margin: '0 0 6px 0', textAlign: 'right' }}>محتوى النموذج:</p>
                  <p style={{ fontSize: '13px', color: '#475569', margin: 0, textAlign: 'right', lineHeight: 1.6, fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                    {'مرحباً {{email}}\n\nشكراً لاستخدام مرصد. {{action_button}}\n\nمع أطيب التحيات،\nفريق مرصد'}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '12px', flexDirection: 'row-reverse' }}>
                  <button
                    onClick={() => setEditMode(true)}
                    style={{
                      flex: 1,
                      padding: '10px 16px',
                      background: '#16A34A',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    تحرير
                  </button>
                  <button
                    onClick={() => setSelectedTemplate(null)}
                    style={{
                      flex: 1,
                      padding: '10px 16px',
                      background: '#F8FAFC',
                      color: '#1E2A52',
                      border: '1px solid #E2E8F0',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    إغلاق
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <textarea
                  placeholder="أدخل محتوى النموذج هنا..."
                  style={{
                    width: '100%',
                    minHeight: '300px',
                    padding: '12px 14px',
                    border: '1px solid #E2E8F0',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontFamily: 'Tajawal',
                    textAlign: 'right',
                    marginBottom: '16px',
                  }}
                />
                <p style={{ fontSize: '11px', color: '#64748B', margin: '0 0 12px 0', textAlign: 'right' }}>
                  {'المتغيرات المتاحة: {{email}} {{name}} {{action_button}}'}
                </p>
                <div style={{ display: 'flex', gap: '12px', flexDirection: 'row-reverse' }}>
                  <button
                    onClick={() => setEditMode(false)}
                    style={{
                      flex: 1,
                      padding: '10px 16px',
                      background: '#16A34A',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    حفظ التغييرات
                  </button>
                  <button
                    onClick={() => {
                      setEditMode(false)
                      setSelectedTemplate(null)
                    }}
                    style={{
                      flex: 1,
                      padding: '10px 16px',
                      background: '#F8FAFC',
                      color: '#1E2A52',
                      border: '1px solid #E2E8F0',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    إلغاء
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
