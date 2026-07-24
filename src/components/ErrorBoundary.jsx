import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('App crashed:', error, info)
  }

  render() {
    if (this.state.error) {
      const err = this.state.error
      return (
        <div dir="rtl" style={{ fontFamily: 'Tajawal, system-ui, sans-serif', minHeight: '100vh', background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '18px', padding: '32px', maxWidth: '640px', width: '100%', boxShadow: '0 10px 40px rgba(15,23,42,.12)' }}>
            <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', margin: '0 auto 16px' }}>⚠️</div>
            <h1 style={{ fontSize: '20px', fontWeight: 900, color: '#0F172A', textAlign: 'center', margin: '0 0 8px' }}>حدث خطأ غير متوقع</h1>
            <p style={{ fontSize: '14px', color: '#64748B', textAlign: 'center', margin: '0 0 18px', lineHeight: 1.7 }}>واجهت الصفحة خطأً برمجياً. التفاصيل أدناه تساعد على إصلاحه بسرعة.</p>
            <pre style={{ background: '#0F172A', color: '#FCA5A5', borderRadius: '12px', padding: '16px', fontSize: '12.5px', lineHeight: 1.6, overflowX: 'auto', direction: 'ltr', textAlign: 'left', whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}>
{String(err && err.message ? err.message : err)}
{err && err.stack ? '\n\n' + err.stack.split('\n').slice(0, 6).join('\n') : ''}
            </pre>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '18px' }}>
              <button onClick={() => { window.location.href = '/' }} style={{ background: '#1E2A52', color: '#fff', border: 0, borderRadius: '10px', padding: '12px 26px', fontSize: '14px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>العودة للرئيسية</button>
              <button onClick={() => window.location.reload()} style={{ background: '#fff', color: '#64748B', border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '12px 26px', fontSize: '14px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>إعادة المحاولة</button>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
