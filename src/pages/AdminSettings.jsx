import { useState, useEffect } from 'react'

export default function AdminSettings() {
  const [settings, setSettings] = useState({
    minReports: 5,
    maxReportsPerMonth: 100,
    minScoreTrust: 70,
    minScoreWarning: 40,
    reportRetentionDays: 30,
    sessionTimeoutMinutes: 30,
    dailyBackups: true,
    emailNotifications: true,
  })

  const [saved, setSaved] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/settings')
      if (response.ok) {
        const data = await response.json()
        setSettings(data)
      }
    } catch (err) {
      console.log('Using default settings:', err.message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleChange = (key, value) => {
    setSettings({ ...settings, [key]: value })
    setSaved(false)
  }

  const handleSave = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      if (response.ok) {
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      } else {
        setError('فشل حفظ الإعدادات')
      }
    } catch (err) {
      setError('خطأ في الاتصال')
    } finally {
      setIsLoading(false)
    }
  }

  const handleReset = () => {
    fetchSettings()
  }

  return (
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '26px', fontWeight: 900, color: '#0F172A', margin: '0 0 4px 0', textAlign: 'right' }}>
          إعدادات النظام
        </h1>
        <p style={{ fontSize: '14px', color: '#64748B', margin: 0, textAlign: 'right' }}>
          قم بتخصيص معاملات وحدود النظام
        </p>
      </div>

      {/* Success Message */}
      {saved && (
        <div style={{
          background: '#DCFCE7',
          border: '1px solid #86EFAC',
          borderRadius: '8px',
          padding: '12px 16px',
          marginBottom: '24px',
          color: '#15803D',
          fontSize: '14px',
          fontWeight: 600,
          textAlign: 'right',
        }}>
          ✓ تم حفظ الإعدادات بنجاح
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div style={{
          background: '#FEE2E2',
          border: '1px solid #FECACA',
          borderRadius: '8px',
          padding: '12px 16px',
          marginBottom: '24px',
          color: '#DC2626',
          fontSize: '14px',
          fontWeight: 600,
          textAlign: 'right',
        }}>
          ✗ {error}
        </div>
      )}

      {/* Settings Sections */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {/* Trust Score Settings */}
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '20px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A', margin: '0 0 16px 0', textAlign: 'right' }}>
            ⭐ إعدادات مؤشر الثقة
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: '#1E2A52', marginBottom: '8px', textAlign: 'right' }}>
                الحد الأدنى للتقارير المعتمدة
              </label>
              <input
                type="number"
                value={settings.minReports}
                onChange={(e) => handleChange('minReports', parseInt(e.target.value))}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1.5px solid #E2E8F0',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontFamily: 'Tajawal',
                }}
              />
              <p style={{ fontSize: '12px', color: '#64748B', margin: '4px 0 0 0', textAlign: 'right' }}>
                عدد التقارير المطلوب لإصدار مؤشر ثقة موثوق
              </p>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: '#1E2A52', marginBottom: '8px', textAlign: 'right' }}>
                نسبة الثقة العالية
              </label>
              <input
                type="number"
                min="0"
                max="100"
                value={settings.minScoreTrust}
                onChange={(e) => handleChange('minScoreTrust', parseInt(e.target.value))}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1.5px solid #E2E8F0',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontFamily: 'Tajawal',
                }}
              />
              <p style={{ fontSize: '12px', color: '#64748B', margin: '4px 0 0 0', textAlign: 'right' }}>
                الحد الأدنى لنسبة الثقة (0-100)
              </p>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: '#1E2A52', marginBottom: '8px', textAlign: 'right' }}>
                نسبة التحذير
              </label>
              <input
                type="number"
                min="0"
                max="100"
                value={settings.minScoreWarning}
                onChange={(e) => handleChange('minScoreWarning', parseInt(e.target.value))}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1.5px solid #E2E8F0',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontFamily: 'Tajawal',
                }}
              />
              <p style={{ fontSize: '12px', color: '#64748B', margin: '4px 0 0 0', textAlign: 'right' }}>
                حد التحذير (مؤشر أحمر)
              </p>
            </div>
          </div>
        </div>

        {/* Report Settings */}
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '20px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A', margin: '0 0 16px 0', textAlign: 'right' }}>
            📋 إعدادات التقارير
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: '#1E2A52', marginBottom: '8px', textAlign: 'right' }}>
                الحد الأقصى للتقارير شهرياً
              </label>
              <input
                type="number"
                value={settings.maxReportsPerMonth}
                onChange={(e) => handleChange('maxReportsPerMonth', parseInt(e.target.value))}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1.5px solid #E2E8F0',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontFamily: 'Tajawal',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: '#1E2A52', marginBottom: '8px', textAlign: 'right' }}>
                مدة الاحتفاظ بالتقارير (أيام)
              </label>
              <input
                type="number"
                value={settings.reportRetentionDays}
                onChange={(e) => handleChange('reportRetentionDays', parseInt(e.target.value))}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1.5px solid #E2E8F0',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontFamily: 'Tajawal',
                }}
              />
            </div>
          </div>
        </div>

        {/* Security Settings */}
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '20px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A', margin: '0 0 16px 0', textAlign: 'right' }}>
            🔒 إعدادات الأمان
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: '#1E2A52', marginBottom: '8px', textAlign: 'right' }}>
                مهلة انتهاء الجلسة (دقائق)
              </label>
              <input
                type="number"
                value={settings.sessionTimeoutMinutes}
                onChange={(e) => handleChange('sessionTimeoutMinutes', parseInt(e.target.value))}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1.5px solid #E2E8F0',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontFamily: 'Tajawal',
                }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexDirection: 'row-reverse' }}>
              <input
                type="checkbox"
                checked={settings.dailyBackups}
                onChange={(e) => handleChange('dailyBackups', e.target.checked)}
                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
              />
              <label style={{ fontSize: '14px', fontWeight: 600, color: '#1E2A52', margin: 0, cursor: 'pointer' }}>
                تفعيل النسخ الاحتياطية اليومية
              </label>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexDirection: 'row-reverse' }}>
              <input
                type="checkbox"
                checked={settings.emailNotifications}
                onChange={(e) => handleChange('emailNotifications', e.target.checked)}
                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
              />
              <label style={{ fontSize: '14px', fontWeight: 600, color: '#1E2A52', margin: 0, cursor: 'pointer' }}>
                تفعيل إشعارات البريد الإلكتروني
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div style={{ marginTop: '24px', display: 'flex', gap: '12px', flexDirection: 'row-reverse' }}>
        <button
          onClick={handleSave}
          disabled={isLoading}
          style={{
            flex: 1,
            padding: '12px 24px',
            background: isLoading ? '#CCCCCC' : '#16A34A',
            color: '#fff',
            border: 'none',
            borderRadius: '10px',
            fontSize: '14px',
            fontWeight: 800,
            cursor: isLoading ? 'not-allowed' : 'pointer',
            opacity: isLoading ? 0.7 : 1,
          }}
        >
          {isLoading ? 'جاري الحفظ...' : 'حفظ الإعدادات'}
        </button>
        <button
          onClick={handleReset}
          disabled={isLoading}
          style={{
            flex: 1,
            padding: '12px 24px',
            background: '#F8FAFC',
            color: '#1E2A52',
            border: '1.5px solid #E2E8F0',
            borderRadius: '10px',
            fontSize: '14px',
            fontWeight: 800,
            cursor: isLoading ? 'not-allowed' : 'pointer',
            opacity: isLoading ? 0.7 : 1,
          }}
        >
          إعادة تعيين
        </button>
      </div>
    </div>
  )
}
