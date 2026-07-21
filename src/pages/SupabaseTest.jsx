import { useState, useEffect } from 'react'
import { supabase, getCompanies, getReports } from '../lib/supabase'

export default function SupabaseTest() {
  const [status, setStatus] = useState('🔄 جاري الاختبار...')
  const [companies, setCompanies] = useState([])
  const [reports, setReports] = useState([])
  const [error, setError] = useState(null)

  useEffect(() => {
    testConnection()
  }, [])

  const testConnection = async () => {
    try {
      setStatus('🔗 جاري الاتصال مع Supabase...')

      // Test 1: Get Companies
      const companiesData = await getCompanies()
      setCompanies(companiesData)
      console.log('✅ Companies:', companiesData)

      // Test 2: Get Reports
      const reportsData = await getReports()
      setReports(reportsData)
      console.log('✅ Reports:', reportsData)

      setStatus('✅ متصل بـ Supabase بنجاح!')
    } catch (err) {
      console.error('❌ خطأ:', err)
      setError(err.message)
      setStatus('❌ فشل الاتصال')
    }
  }

  return (
    <div style={{ padding: '20px', fontFamily: 'Tajawal' }}>
      <h1>🧪 اختبار Supabase</h1>

      <div style={{
        padding: '20px',
        backgroundColor: error ? '#fee' : '#efe',
        borderRadius: '8px',
        marginBottom: '20px',
        fontSize: '18px',
      }}>
        {status}
      </div>

      {error && (
        <div style={{ color: 'red', marginBottom: '20px' }}>
          <strong>❌ خطأ:</strong> {error}
        </div>
      )}

      <h2>📊 الشركات ({companies.length})</h2>
      {companies.map(c => (
        <div key={c.id} style={{
          padding: '10px',
          margin: '10px 0',
          border: '1px solid #ddd',
          borderRadius: '4px'
        }}>
          <strong>{c.name}</strong> - {c.category} - ثقة: {c.trust_score}
        </div>
      ))}

      <h2>📝 التقارير ({reports.length})</h2>
      {reports.map(r => (
        <div key={r.id} style={{
          padding: '10px',
          margin: '10px 0',
          border: '1px solid #ddd',
          borderRadius: '4px'
        }}>
          <strong>{r.company_name}</strong> - {r.rating} نجوم
        </div>
      ))}

      <button
        onClick={testConnection}
        style={{
          padding: '10px 20px',
          marginTop: '20px',
          backgroundColor: '#16A34A',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '16px',
        }}
      >
        🔄 إعادة المحاولة
      </button>
    </div>
  )
}
