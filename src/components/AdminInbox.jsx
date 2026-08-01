import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getSupabase } from '../lib/api'
import { useLiveData } from '../hooks/useLiveData'

/**
 * What Marsad has to do today, in one list.
 *
 * The dashboard showed totals — 26 companies, 12 pending reports — and answering
 * "what needs me today" meant opening six screens and holding the answer in your
 * head. Every one of those counts was already on the page and none of them was
 * something you could act on from there.
 *
 * Same queues, one place, ordered by what has waited longest. Nothing new is
 * measured; what was missing was somewhere to read it.
 *
 * Alerts are kept separate. The inbox is work assigned to Marsad; an alert is
 * the platform reporting on itself, and putting a falling trust score in a task
 * list makes it look like something somebody forgot to do.
 */

const ICON = {
  reports: '📋', documents: '📎', answered: '💬', overdue: '⏰',
  companies: '🏢', data_requests: '✏️', claims: '🔑',
  disputes: '⚖️', plan_changes: '💳',
}

const SEV = {
  3: { bg: '#FEF2F2', fg: '#B91C1C' },
  2: { bg: '#FFFBEB', fg: '#B45309' },
  1: { bg: '#EEF2FF', fg: '#1E40AF' },
}

export default function AdminInbox() {
  const navigate = useNavigate()
  const [inbox, setInbox] = useState([])
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const sb = getSupabase()
      const [{ data: i }, { data: a }] = await Promise.all([
        sb.rpc('admin_inbox'),
        sb.rpc('admin_alerts'),
      ])
      setInbox(Array.isArray(i) ? i : [])
      setAlerts(Array.isArray(a) ? a : [])
    } catch (err) {
      console.warn('Inbox warning:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])
  useLiveData(load, {
    tables: ['reports', 'company_documents', 'clarification_requests',
             'companies', 'disputes', 'claim_requests', 'plan_change_requests'],
  })

  if (loading) {
    return (
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '24px', marginBottom: '18px', color: '#64748B', fontSize: '14px', fontWeight: 600 }}>
        جاري التحميل…
      </div>
    )
  }

  const total = inbox.reduce((s, r) => s + Number(r.n || 0), 0)

  return (
    <div style={{ marginBottom: '18px' }}>
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '24px', marginBottom: alerts.length ? '14px' : 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '12px', flexWrap: 'wrap', marginBottom: '4px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 900, color: '#0F172A', margin: 0 }}>ما يحتاج منك اليوم</h2>
          {total > 0 && (
            <span style={{ fontSize: '13.5px', fontWeight: 800, color: '#64748B', fontVariantNumeric: 'tabular-nums' }}>
              {total} بنداً في {inbox.length} طابور
            </span>
          )}
        </div>
        <p style={{ fontSize: '13.5px', color: '#64748B', margin: '0 0 18px' }}>
          مرتّبة بما انتظر أطول — لا بنوعه.
        </p>

        {inbox.length === 0 ? (
          <div style={{ background: '#ECFDF5', borderRadius: '12px', padding: '22px', textAlign: 'center' }}>
            <div style={{ fontSize: '15px', fontWeight: 800, color: '#15803D' }}>لا شيء ينتظرك</div>
            <div style={{ fontSize: '13px', color: '#15803D', opacity: 0.8, marginTop: '5px' }}>
              كل الطوابير فارغة.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {inbox.map((r) => (
              <button key={r.kind} onClick={() => navigate(r.href)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '13px', width: '100%',
                        textAlign: 'right', padding: '14px 16px', cursor: 'pointer',
                        fontFamily: 'inherit', borderRadius: '11px',
                        background: r.overdue ? '#FFFBEB' : '#F8FAFC',
                        border: r.overdue ? '1px solid #FDE68A' : '1px solid #E2E8F0',
                      }}>
                <span style={{ fontSize: '19px', flex: 'none' }} aria-hidden="true">{ICON[r.kind] || '•'}</span>

                <span style={{
                  flex: 'none', minWidth: '34px', textAlign: 'center',
                  fontSize: '19px', fontWeight: 900, color: r.overdue ? '#B45309' : '#1E2A52',
                  fontVariantNumeric: 'tabular-nums',
                }}>{r.n}</span>

                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: '14.5px', fontWeight: 800, color: '#0F172A' }}>{r.label}</span>
                  {r.oldest_days != null && (
                    <span style={{ display: 'block', fontSize: '12px', color: r.overdue ? '#B45309' : '#64748B', fontWeight: 600, marginTop: '3px' }}>
                      {r.oldest_days === 0 ? 'وصل اليوم' : `أقدمها من ${r.oldest_days} يوم`}
                      {r.overdue ? ' — تأخّر' : ''}
                    </span>
                  )}
                </span>

                <span style={{ flex: 'none', color: '#64748B', fontSize: '17px' }} aria-hidden="true">‹</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {alerts.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '24px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 900, color: '#0F172A', margin: '0 0 4px' }}>تغيّرات تستحق نظرة</h2>
          <p style={{ fontSize: '13px', color: '#64748B', margin: '0 0 16px' }}>
            ليست مهامّ — أشياء تحرّكت في المنصّة خلال ٣٠ يوماً.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {alerts.slice(0, 8).map((a, i) => {
              const s = SEV[a.severity] || SEV[1]
              return (
                <button key={i} onClick={() => a.href && navigate(a.href)}
                        style={{
                          display: 'flex', justifyContent: 'space-between', gap: '12px',
                          alignItems: 'center', flexWrap: 'wrap', width: '100%', textAlign: 'right',
                          background: s.bg, border: 0, borderRadius: '10px', padding: '12px 14px',
                          cursor: a.href ? 'pointer' : 'default', fontFamily: 'inherit',
                        }}>
                  <span style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>{a.subject}</span>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: s.fg }}>{a.detail}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
