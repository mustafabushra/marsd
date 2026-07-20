import { useState } from 'react'

export default function AdminTrustScore() {
  const [weights, setWeights] = useState({
    financial_stability: 30,
    payment_history: 25,
    business_growth: 20,
    compliance: 15,
    market_reputation: 10,
  })

  const [testResults, setTestResults] = useState([
    { id: 1, company: 'أكمل للمقاولات', calculated: 78, expected: 75, difference: '+3%', status: 'pass' },
    { id: 2, company: 'نوفا للتسويق', calculated: 52, expected: 50, difference: '+2%', status: 'pass' },
  ])

  const [testCompany, setTestCompany] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)

  const handleWeightChange = (field, value) => {
    const newWeights = { ...weights, [field]: parseInt(value) }
    const total = Object.values(newWeights).reduce((a, b) => a + b, 0)
    if (total === 100) {
      setWeights(newWeights)
    }
  }

  const runTest = () => {
    if (!testCompany) return
    const mockScore = Math.floor(Math.random() * 100)
    const newTest = {
      id: testResults.length + 1,
      company: testCompany,
      calculated: mockScore,
      expected: mockScore - Math.floor(Math.random() * 5),
      difference: `+${Math.floor(Math.random() * 5)}%`,
      status: Math.random() > 0.2 ? 'pass' : 'fail',
    }
    setTestResults([...testResults, newTest])
    setTestCompany('')
  }

  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0)

  return (
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '26px', fontWeight: 900, color: '#0F172A', margin: '0 0 4px 0', textAlign: 'right' }}>
          معايرة مؤشر الثقة
        </h1>
        <p style={{ fontSize: '14px', color: '#64748B', margin: 0, textAlign: 'right' }}>
          اختبار وضبط خوارزمية حساب مؤشر الثقة
        </p>
      </div>

      {/* Weights Configuration */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '20px', marginBottom: '24px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A', margin: '0 0 16px 0', textAlign: 'right' }}>
          أوزان المعايير
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px' }}>
          {Object.entries(weights).map(([key, value]) => (
            <div key={key}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>
                  {value}%
                </span>
                <label style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A', textAlign: 'right' }}>
                  {key === 'financial_stability' && 'الاستقرار المالي'}
                  {key === 'payment_history' && 'سجل الدفع'}
                  {key === 'business_growth' && 'نمو الأعمال'}
                  {key === 'compliance' && 'الامتثال'}
                  {key === 'market_reputation' && 'سمعة السوق'}
                </label>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={value}
                onChange={(e) => handleWeightChange(key, e.target.value)}
                style={{ width: '100%' }}
              />
            </div>
          ))}
        </div>

        <div style={{
          marginTop: '20px',
          padding: '12px',
          background: totalWeight === 100 ? '#DCFCE7' : '#FEF3C7',
          borderRadius: '8px',
          textAlign: 'center',
          fontSize: '14px',
          fontWeight: 600,
          color: totalWeight === 100 ? '#15803D' : '#B45309',
        }}>
          إجمالي الأوزان: {totalWeight}% {totalWeight === 100 && '✓'}
        </div>

        <button
          style={{
            marginTop: '16px',
            padding: '10px 20px',
            background: totalWeight === 100 ? '#16A34A' : '#CCCCCC',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: 700,
            cursor: totalWeight === 100 ? 'pointer' : 'not-allowed',
            width: '100%',
          }}
          disabled={totalWeight !== 100}
        >
          حفظ الأوزان
        </button>
      </div>

      {/* Testing Panel */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '20px', marginBottom: '24px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A', margin: '0 0 16px 0', textAlign: 'right' }}>
          اختبار الحساب
        </h2>

        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
          <button
            onClick={runTest}
            disabled={!testCompany}
            style={{
              padding: '10px 16px',
              background: testCompany ? '#16A34A' : '#CCCCCC',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 700,
              cursor: testCompany ? 'pointer' : 'not-allowed',
            }}
          >
            تشغيل الاختبار
          </button>
          <input
            type="text"
            placeholder="أدخل اسم الشركة للاختبار"
            value={testCompany}
            onChange={(e) => setTestCompany(e.target.value)}
            style={{
              flex: 1,
              padding: '10px 12px',
              border: '1.5px solid #E2E8F0',
              borderRadius: '8px',
              fontSize: '14px',
              fontFamily: 'Tajawal',
              textAlign: 'right',
            }}
          />
        </div>

        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          style={{
            padding: '8px 12px',
            background: '#F8FAFC',
            color: '#1E2A52',
            border: '1px solid #E2E8F0',
            borderRadius: '6px',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {showAdvanced ? '▼' : '◀'} الاختبارات المتقدمة
        </button>

        {showAdvanced && (
          <div style={{ marginTop: '16px', padding: '12px', background: '#F8FAFC', borderRadius: '8px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
              <button style={{
                padding: '8px 12px',
                background: '#E0F2FE',
                color: '#0369A1',
                border: 'none',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}>
                تصدير الاختبارات
              </button>
              <button style={{
                padding: '8px 12px',
                background: '#F3E8FF',
                color: '#7C3AED',
                border: 'none',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}>
                مقارنة الخوارزميات
              </button>
              <button style={{
                padding: '8px 12px',
                background: '#FEE2E2',
                color: '#DC2626',
                border: 'none',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}>
                إعادة تعيين النتائج
              </button>
              <button style={{
                padding: '8px 12px',
                background: '#FEF3C7',
                color: '#B45309',
                border: 'none',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}>
                تقرير الدقة
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Results Table */}
      <div style={{ background: '#fff', borderRadius: '12px', overflow: 'hidden', border: '1px solid #E2E8F0' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
              <th style={{ padding: '16px', textAlign: 'right', fontSize: '13px', fontWeight: 700, color: '#475569', borderLeft: '1px solid #E2E8F0' }}>الشركة</th>
              <th style={{ padding: '16px', textAlign: 'right', fontSize: '13px', fontWeight: 700, color: '#475569', borderLeft: '1px solid #E2E8F0' }}>المحسوب</th>
              <th style={{ padding: '16px', textAlign: 'right', fontSize: '13px', fontWeight: 700, color: '#475569', borderLeft: '1px solid #E2E8F0' }}>المتوقع</th>
              <th style={{ padding: '16px', textAlign: 'right', fontSize: '13px', fontWeight: 700, color: '#475569', borderLeft: '1px solid #E2E8F0' }}>الفرق</th>
              <th style={{ padding: '16px', textAlign: 'right', fontSize: '13px', fontWeight: 700, color: '#475569' }}>النتيجة</th>
            </tr>
          </thead>
          <tbody>
            {testResults.map(result => (
              <tr key={result.id} style={{ borderBottom: '1px solid #E2E8F0' }}>
                <td style={{ padding: '16px', fontSize: '14px', color: '#0F172A', fontWeight: 600, borderLeft: '1px solid #E2E8F0' }}>
                  {result.company}
                </td>
                <td style={{ padding: '16px', fontSize: '14px', color: '#1E2A52', fontWeight: 700, borderLeft: '1px solid #E2E8F0' }}>
                  {result.calculated}
                </td>
                <td style={{ padding: '16px', fontSize: '14px', color: '#64748B', borderLeft: '1px solid #E2E8F0' }}>
                  {result.expected}
                </td>
                <td style={{ padding: '16px', fontSize: '13px', color: '#16A34A', fontWeight: 600, borderLeft: '1px solid #E2E8F0' }}>
                  {result.difference}
                </td>
                <td style={{ padding: '16px' }}>
                  <span style={{
                    padding: '4px 10px',
                    background: result.status === 'pass' ? '#DCFCE7' : '#FEE2E2',
                    color: result.status === 'pass' ? '#15803D' : '#DC2626',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 600,
                  }}>
                    {result.status === 'pass' ? '✓ نجح' : '✗ فشل'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
