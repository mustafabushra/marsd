import { useState, useEffect } from 'react'
import { useUser } from '@clerk/react'
import { getSupabase } from '../lib/api'

export default function Subscription() {
  const { user } = useUser()
  const [subscription, setSubscription] = useState(null)
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const loadSubscriptionData = async () => {
      try {
        const supabase = getSupabase()

        // Get current user's tenant
        const { data: userData } = await supabase
          .from('users')
          .select('tenant_id')
          .eq('id', user?.id)
          .single()

        if (!userData?.tenant_id) {
          setLoading(false)
          return
        }

        // Get subscription with plan details
        const { data: subData } = await supabase
          .from('subscriptions')
          .select(`
            id, status, current_period_start, current_period_end,
            plans(id, name, price, features)
          `)
          .eq('tenant_id', userData.tenant_id)
          .eq('status', 'active')
          .single()

        if (subData) {
          setSubscription(subData)
        }

        // Get invoices
        const { data: invoicesData } = await supabase
          .from('invoices')
          .select('id, amount, status, created_at')
          .eq('tenant_id', userData.tenant_id)
          .order('created_at', { ascending: false })
          .limit(10)

        if (invoicesData) {
          setInvoices(invoicesData.map((inv, idx) => ({
            id: inv.id,
            no: `INV-${new Date().getFullYear()}-${String(idx + 1).padStart(3, '0')}`,
            date: new Date(inv.created_at).toLocaleDateString('ar-SA'),
            amount: `${inv.amount?.toLocaleString('ar-SA')} ر.س`,
            status: inv.status === 'paid' ? 'مدفوعة' : 'معلقة'
          })))
        }

        setError(null)
      } catch (err) {
        console.error('Error loading subscription:', err)
        setError('فشل تحميل بيانات الاشتراك')
      } finally {
        setLoading(false)
      }
    }

    if (user?.id) {
      loadSubscriptionData()
    }
  }, [user?.id])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#F8FAFC' }}>
        جاري التحميل...
      </div>
    )
  }

  return (
    <main style={{ background: '#F8FAFC', minHeight: '100vh', padding: '22px 28px' }}>
      {error && (
        <div style={{ marginBottom: '20px', padding: '14px 16px', background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: '12px', color: '#991B1B', fontSize: '14px' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: '18px', marginBottom: '18px' }}>
        <div style={{ background: 'linear-gradient(135deg,#1E2A52,#2A3B6E)', borderRadius: '16px', padding: '26px', color: '#fff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: '13.5px', color: '#94A3B8', fontWeight: 700, marginBottom: '5px' }}>باقتك الحالية</div>
              <div style={{ fontSize: '30px', fontWeight: 900 }}>{subscription?.plans?.name || 'غير محدد'}</div>
            </div>
            <span style={{ background: subscription?.status === 'active' ? '#16A34A' : '#DC2626', borderRadius: '999px', padding: '6px 14px', fontSize: '13px', fontWeight: 800 }}>
              {subscription?.status === 'active' ? 'نشطة' : 'منتهية'}
            </span>
          </div>
          <div style={{ fontSize: '13.5px', color: '#CBD5E1', margin: '14px 0 22px' }}>
            تتجدد تلقائياً في {subscription?.current_period_end ? new Date(subscription.current_period_end).toLocaleDateString('ar-SA') : '—'} · {subscription?.plans?.price?.toLocaleString('ar-SA')} ر.س / شهرياً
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={() => alert('سيتم فتح صفحة الترقية قريباً')}
              style={{ background: '#16A34A', color: '#fff', border: 0, borderRadius: '10px', padding: '11px 22px', fontSize: '14px', fontWeight: 800, cursor: 'pointer' }}>
              ترقية الباقة
            </button>
            <button
              onClick={() => alert('سيتم فتح صفحة إدارة الفوترة قريباً')}
              style={{ background: 'rgba(255,255,255,.12)', color: '#fff', border: 0, borderRadius: '10px', padding: '11px 22px', fontSize: '14px', fontWeight: 800, cursor: 'pointer' }}>
              إدارة الفوترة
            </button>
          </div>
        </div>

        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '24px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 900, color: '#0F172A', margin: '0 0 18px 0', textAlign: 'right' }}>استهلاك الباقة</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13.5px', fontWeight: 700, color: '#334155', marginBottom: '6px', flexDirection: 'row-reverse' }}>
                <span>عمليات البحث</span>
                <span>72 / 200</span>
              </div>
              <div style={{ height: '8px', background: '#F1F5F9', borderRadius: '5px', overflow: 'hidden' }}>
                <div style={{ width: '36%', height: '100%', background: '#16A34A', borderRadius: '5px' }}></div>
              </div>
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13.5px', fontWeight: 700, color: '#334155', marginBottom: '6px', flexDirection: 'row-reverse' }}>
                <span>المستخدمون</span>
                <span>4 / 8</span>
              </div>
              <div style={{ height: '8px', background: '#F1F5F9', borderRadius: '5px', overflow: 'hidden' }}>
                <div style={{ width: '50%', height: '100%', background: '#1E2A52', borderRadius: '5px' }}></div>
              </div>
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13.5px', fontWeight: 700, color: '#334155', marginBottom: '6px', flexDirection: 'row-reverse' }}>
                <span>قوائم المراقبة</span>
                <span>9 / 25</span>
              </div>
              <div style={{ height: '8px', background: '#F1F5F9', borderRadius: '5px', overflow: 'hidden' }}>
                <div style={{ width: '36%', height: '100%', background: '#7C3AED', borderRadius: '5px' }}></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', overflow: 'hidden' }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid #E2E8F0' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 900, color: '#0F172A', margin: 0 }}>الفواتير</h3>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1.2fr 1fr 1fr 0.8fr', padding: '13px 22px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', fontSize: '13px', fontWeight: 800, color: '#64748B' }}>
          <span>رقم الفاتورة</span>
          <span>التاريخ</span>
          <span>المبلغ</span>
          <span>الحالة</span>
          <span></span>
        </div>
        {invoices.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: '#64748B' }}>
            لا توجد فواتير
          </div>
        ) : (
          invoices.map((inv) => (
            <div key={inv.id} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1.2fr 1fr 1fr 0.8fr', padding: '14px 22px', borderBottom: '1px solid #F1F5F9', alignItems: 'center' }}>
              <span style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>{inv.no}</span>
              <span style={{ fontSize: '13.5px', color: '#64748B' }}>{inv.date}</span>
              <span style={{ fontSize: '14px', fontWeight: 700, color: '#334155' }}>{inv.amount}</span>
              <span>
                <span style={{ background: inv.status === 'مدفوعة' ? '#ECFDF5' : '#FEF3C7', color: inv.status === 'مدفوعة' ? '#15803D' : '#92400E', borderRadius: '7px', padding: '4px 11px', fontSize: '12.5px', fontWeight: 800 }}>{inv.status}</span>
              </span>
              <span
                onClick={() => alert(`تحميل الفاتورة ${inv.no}`)}
                style={{ fontSize: '13px', color: '#16A34A', fontWeight: 800, cursor: 'pointer' }}>
                تحميل PDF
              </span>
            </div>
          ))
        )}
      </div>
    </main>
  )
}
