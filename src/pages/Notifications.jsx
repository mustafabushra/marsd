import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUser } from '@clerk/react'
import { getSupabase } from '../lib/api'
import { notificationText, NOTIFICATION_STYLE } from '../lib/notify'
import { useLiveData } from '../hooks/useLiveData'
import { LiveBadge } from '../components/LiveBadge'

/**
 * /notifications — what the platform has actually told this user.
 *
 * The page held five notifications in useState, about companies that do not
 * exist, with timestamps written into the source. Every visitor saw the same
 * five, for ever, and marking one read changed nothing beyond the render.
 *
 * Underneath, the real thing was broken in the other direction: every report
 * approval, rejection and information request wrote a notification whose columns
 * did not match the table — title, message and is_read do not exist, and the
 * required user_id was never supplied — so the insert always failed, its error
 * was never read, and the table stayed empty. A screen showing invented data and
 * a pipeline producing none, each hiding the other: a page full of notifications
 * looks exactly like a working system.
 */

const card = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px' }
const DEFAULT_STYLE = { icon: '•', color: '#475569', bg: '#F1F5F9' }

export default function Notifications() {
  const navigate = useNavigate()
  const { isLoaded, user } = useUser()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(async () => {
    if (!user?.id) { setLoading(false); return }
    try {
      setError('')
      const { data, error: e } = await getSupabase()
        .from('notifications')
        .select('id, type, payload, read_at, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100)
      if (e) throw e
      setItems(data || [])
    } catch (err) {
      setError(err.message || 'تعذّر تحميل الإشعارات')
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => { if (isLoaded) load() }, [isLoaded, load])

  const { connected, liveAt } = useLiveData(load, { tables: ['notifications'], enabled: !!user?.id })

  // read_at carries the time, not a boolean: when something was read is worth
  // more than the fact that it was, and a timestamp cannot disagree with itself.
  const markRead = async (id) => {
    try {
      setBusyId(id)
      const { error: e } = await getSupabase()
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', id)
      if (e) throw e
      await load()
    } catch (err) {
      setError(err.message || 'تعذّر التحديث')
    } finally { setBusyId(null) }
  }

  const markAllRead = async () => {
    const unread = items.filter((n) => !n.read_at).map((n) => n.id)
    if (!unread.length) return
    try {
      setBusyId('all')
      const { error: e } = await getSupabase()
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .in('id', unread)
      if (e) throw e
      await load()
    } catch (err) {
      setError(err.message || 'تعذّر التحديث')
    } finally { setBusyId(null) }
  }

  const openFor = (n) => {
    if (n.type?.startsWith('report_')) navigate('/my-reports')
    else if (n.type === 'company_approved') navigate('/my-companies')
    else if (n.type === 'credits_awarded') navigate('/subscription')
  }

  if (loading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh', color: '#64748B', fontWeight: 600 }}>جاري التحميل...</div>
  }

  const unreadCount = items.filter((n) => !n.read_at).length

  return (
    <div>
      {error && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '12px', padding: '13px 16px', marginBottom: '16px', color: '#B91C1C', fontSize: '14px', fontWeight: 700 }}>⚠️ {error}</div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '11px', flexWrap: 'wrap' }}>
          <h2 style={{ fontSize: '17px', fontWeight: 900, color: '#0F172A', margin: 0 }}>الإشعارات</h2>
          {unreadCount > 0 && (
            <span style={{ background: '#FEE2E2', color: '#B91C1C', borderRadius: '999px', padding: '4px 12px', fontSize: '12.5px', fontWeight: 800 }}>{unreadCount} غير مقروء</span>
          )}
          <LiveBadge connected={connected} liveAt={liveAt} />
        </div>
        {unreadCount > 0 && (
          <button onClick={markAllRead} disabled={busyId === 'all'} style={{ background: '#F1F5F9', color: '#334155', border: 0, borderRadius: '9px', padding: '9px 18px', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
            تعليم الكل كمقروء
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div style={{ ...card, padding: '44px', textAlign: 'center' }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>🔔</div>
          <h4 style={{ fontSize: '16px', fontWeight: 900, color: '#0F172A', margin: '0 0 8px' }}>لا توجد إشعارات</h4>
          <p style={{ fontSize: '13.5px', color: '#64748B', lineHeight: 1.9, margin: 0 }}>
            ستصلك هنا إشعارات اعتماد تقاريرك، وقبول الشركات التي تضيفها، والنقاط التي تكسبها.
          </p>
        </div>
      ) : (
        <div style={{ ...card, overflow: 'hidden' }}>
          {items.map((n, i) => {
            const { title, message } = notificationText(n)
            const s = NOTIFICATION_STYLE[n.type] || DEFAULT_STYLE
            const unread = !n.read_at
            return (
              <div
                key={n.id}
                onClick={() => { if (unread) markRead(n.id); openFor(n) }}
                style={{
                  display: 'flex', gap: '14px', padding: '16px 20px', cursor: 'pointer',
                  borderBottom: i < items.length - 1 ? '1px solid #F1F5F9' : 'none',
                  background: unread ? '#FAFCFF' : '#fff',
                  opacity: busyId === n.id ? 0.6 : 1,
                }}
              >
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: s.bg, color: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: 900, flex: 'none' }}>
                  {s.icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                    <span style={{ fontSize: '14.5px', fontWeight: 800, color: '#0F172A' }}>{title}</span>
                    {unread && <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#3B82F6', flex: 'none' }} />}
                  </div>
                  {message && <div style={{ fontSize: '13.5px', color: '#64748B', lineHeight: 1.8 }}>{message}</div>}
                  <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 600, marginTop: '5px' }}>
                    {new Date(n.created_at).toLocaleString('en-GB')}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
