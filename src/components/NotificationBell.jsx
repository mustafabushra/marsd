import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUser } from '@clerk/react'
import { getSupabase } from '../lib/api'
import { useLiveData } from '../hooks/useLiveData'
import { BellIcon } from './icons'
import { notificationText, NOTIFICATION_STYLE } from '../lib/notify'
import { playChime, soundOn, setSoundOn, armAudio } from '../lib/chime'

/**
 * The bell in the header, doing something.
 *
 * It was a <div> with cursor: pointer and no onClick — it could not be clicked,
 * and the red dot beside it was written into the markup, so it announced unread
 * notifications permanently whether any existed or not. Twelve unread ones sat
 * in the table while the same dot showed for a company that had none.
 *
 * A permanent indicator is worse than no indicator: it trains people that the
 * dot means nothing, and then it means nothing on the day it is real.
 *
 * audit-screens looks for a <button> with no onClick and this slipped past it
 * because it was a div — a control that is not a button is not only untestable,
 * it is unreachable by keyboard.
 */
export default function NotificationBell() {
  const navigate = useNavigate()
  const { user } = useUser()
  const [items, setItems] = useState([])
  const [open, setOpen] = useState(false)
  const wrap = useRef(null)

  const load = useCallback(async () => {
    if (!user?.id) return
    try {
      const { data } = await getSupabase()
        .from('notifications')
        .select('id, type, payload, read_at, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20)
      setItems(data || [])
    } catch (err) {
      console.warn('Notifications warning:', err)
    }
  }, [user?.id])

  useEffect(() => { load() }, [load])
  useLiveData(load, { tables: ['notifications'] })

  const [sound, setSound] = useState(soundOn)

  // يُستأنف السياق الصوتي عند أول ضغطة في الصفحة. بدونه يبقى معلّقاً، ويصل
  // الإشعار فتُطلَب النغمة من داخل حدث شبكة — خارج أي تفاعل — فيرفض المتصفح
  // ولا يُسمع شيء. هذا هو سبب الصمت.
  useEffect(() => { armAudio() }, [])

  // ما رأيناه بالفعل. يُبذَر عند أول تحميل ولا يُصوَّت له: الدخول على اثني عشر
  // إشعاراً قديماً ليس حدثاً، ونغمة عند فتح كل صفحة تُكتَم في أول يوم.
  const seen = useRef(null)

  useEffect(() => {
    // لا شيء بعد: التركيب يسبق أول جلب، و items حينها فارغة. البذر هنا كان
    // يزرع مجموعة فارغة، فيصير كل إشعار قديم «جديداً» عند وصول أول دفعة
    // وتُطلق النغمة عند فتح الصفحة. يُنتظر أول تحميل فعلي.
    if (!user?.id) return
    if (seen.current === null && items.length === 0) return

    const ids = new Set(items.filter((n) => !n.read_at).map((n) => n.id))

    if (seen.current === null) { seen.current = ids; return }

    // جديد = غير مقروء ولم نره في الدفعة السابقة. المقارنة بالمعرّفات لا
    // بالعدد، لأن قراءة إشعار وورود آخر في اللحظة نفسها يُبقيان العدد ثابتاً
    // بينما وصل شيء فعلاً.
    let fresh = 0
    for (const id of ids) if (!seen.current.has(id)) fresh++
    seen.current = ids

    if (fresh > 0 && sound) playChime()
  }, [items, sound, user?.id])

  // Close on an outside click and on Escape. A panel that only closes by
  // clicking the thing that opened it is one people close by navigating away.
  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const unread = items.filter((n) => !n.read_at)

  const markRead = async (id) => {
    // Optimistic, then read back. An update RLS filters out raises nothing, so
    // a badge that clears locally and not in the table comes back on reload and
    // looks like the notification arrived twice.
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)))
    const { data, error } = await getSupabase()
      .from('notifications').update({ read_at: new Date().toISOString() })
      .eq('id', id).is('read_at', null).select('id')
    if (error || !data) load()
  }

  const markAllRead = async () => {
    if (!unread.length) return
    await getSupabase()
      .from('notifications').update({ read_at: new Date().toISOString() })
      .eq('user_id', user.id).is('read_at', null)
    load()
  }

  const openItem = (n) => {
    if (!n.read_at) markRead(n.id)
    setOpen(false)
    navigate('/notifications')
  }

  const ago = (iso) => {
    const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
    if (mins < 1) return 'الآن'
    if (mins < 60) return `قبل ${mins} دقيقة`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `قبل ${hrs} ساعة`
    return `قبل ${Math.floor(hrs / 24)} يوم`
  }

  return (
    <div ref={wrap} style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={unread.length ? `الإشعارات — ${unread.length} غير مقروء` : 'الإشعارات'}
        aria-expanded={open}
        style={{
          position: 'relative', background: 'none', border: 0, padding: '4px',
          display: 'flex', alignItems: 'center', color: '#475569', cursor: 'pointer',
        }}
      >
        <BellIcon />
        {/* Shown only when there is something to show. */}
        {unread.length > 0 && (
          <span style={{
            position: 'absolute', top: '-4px', left: '-6px', minWidth: '17px', height: '17px',
            background: '#DC2626', color: '#fff', borderRadius: '999px', border: '2px solid #fff',
            fontSize: '10.5px', fontWeight: 800, display: 'flex', alignItems: 'center',
            justifyContent: 'center', padding: '0 4px', fontVariantNumeric: 'tabular-nums',
          }}>
            {unread.length > 9 ? '9+' : unread.length}
          </span>
        )}
      </button>

      {open && (
        <div className="marsad-notification-panel" style={{
          // insetInlineEnd, not Start. In RTL, insetInlineStart resolves to right,
          // which pinned the panel's right edge to the bell and made it grow
          // leftwards — and the bell sits near the viewport's left edge, so the
          // panel ran straight off the screen. Anchoring the end edge grows it
          // back toward the page.
          position: 'absolute', top: 'calc(100% + 12px)', insetInlineEnd: 0,
          width: 'min(360px, calc(100vw - 32px))', background: '#fff',
          border: '1px solid #E2E8F0', borderRadius: '14px',
          boxShadow: '0 12px 32px rgba(15,23,42,.16)', zIndex: 300, overflow: 'hidden',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', padding: '14px 16px', borderBottom: '1px solid #F1F5F9' }}>
            <span style={{ fontSize: '14px', fontWeight: 900, color: '#0F172A' }}>الإشعارات</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {unread.length > 0 && (
                <button onClick={markAllRead}
                        style={{ background: 'none', border: 0, color: '#1E2A52', fontSize: '12.5px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                  تعليم الكل كمقروء
                </button>
              )}
              {/* الكتم، حيث يبحث عنه من أزعجه الصوت.
                  والضغط يشغّل نغمة عند التفعيل — فهو أول تفاعل يسمح للمتصفح
                  باستئناف السياق الصوتي، ويسمع المستخدم ما فعّله بدل أن ينتظر
                  إشعاراً ليكتشف أنه يعمل. */}
              <button
                onClick={() => {
                  const next = !sound
                  setSound(next)
                  setSoundOn(next)
                  if (next) playChime()
                }}
                aria-pressed={sound}
                title={sound ? 'كتم صوت الإشعارات' : 'تشغيل صوت الإشعارات'}
                aria-label={sound ? 'كتم صوت الإشعارات' : 'تشغيل صوت الإشعارات'}
                style={{
                  background: 'none', border: 0, cursor: 'pointer', fontFamily: 'inherit',
                  fontSize: '14px', lineHeight: 1, padding: 0,
                  opacity: sound ? 1 : 0.45,
                }}>
                {sound ? '🔔' : '🔕'}
              </button>
            </div>
          </div>

          <div style={{ maxHeight: '380px', overflowY: 'auto' }}>
            {items.length === 0 ? (
              <p style={{ padding: '26px 16px', textAlign: 'center', color: '#64748B', fontSize: '13.5px', fontWeight: 600, margin: 0 }}>
                لا إشعارات بعد
              </p>
            ) : items.map((n) => {
              const { title, message } = notificationText(n)
              const st = NOTIFICATION_STYLE[n.type] || { icon: 'ℹ', color: '#1E40AF', bg: '#EEF2FF' }
              return (
                <button key={n.id} onClick={() => openItem(n)}
                        style={{
                          display: 'flex', gap: '11px', width: '100%', textAlign: 'right',
                          padding: '13px 16px', background: n.read_at ? '#fff' : '#F8FAFC',
                          border: 0, borderBottom: '1px solid #F1F5F9', cursor: 'pointer', fontFamily: 'inherit',
                        }}>
                  <span style={{
                    flex: 'none', width: '30px', height: '30px', borderRadius: '50%',
                    background: st.bg, color: st.color, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: '14px', fontWeight: 800,
                  }}>{st.icon}</span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: '13.5px', fontWeight: 800, color: '#0F172A' }}>{title}</span>
                    {message && (
                      <span style={{ display: 'block', fontSize: '12.5px', color: '#64748B', marginTop: '3px', lineHeight: 1.6 }}>{message}</span>
                    )}
                    <span style={{ display: 'block', fontSize: '11.5px', color: '#64748B', marginTop: '4px', fontWeight: 600 }}>{ago(n.created_at)}</span>
                  </span>
                </button>
              )
            })}
          </div>

          <button onClick={() => { setOpen(false); navigate('/notifications') }}
                  style={{ display: 'block', width: '100%', padding: '13px', background: '#F8FAFC', border: 0, color: '#1E2A52', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
            عرض كل الإشعارات
          </button>
        </div>
      )}
    </div>
  )
}
