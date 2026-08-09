import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getSupabase } from '../lib/api'

/**
 * «هذه الشركة موجودة» — said before the form is filled, not after.
 *
 * Adding a company checked for a duplicate registration number at submit time.
 * So somebody typed a name, a legal form, a capital, a city, an activity, a
 * founding date, attached four documents — and then learned the company was
 * already there. Everything they had entered was work nobody needed.
 *
 * Now that Marsad holds the Ministry's register, that is not a rare accident.
 * Most companies somebody thinks to add are in the national register already,
 * because the national register is every company.
 *
 * ============================================================================
 * And «already exists» is the wrong thing to say
 * ============================================================================
 * If the registration number is in the government register, Marsad knows the
 * company's name, legal form, capital, region, city and registration date —
 * from the authority that issued them. Turning somebody away at that point,
 * having just told them we know all of it, is the wrong end of a good answer.
 *
 * So there are two outcomes and neither is a refusal:
 *
 *   in Marsad already   → open it. Nothing to add.
 *   in the register     → fill the form from it, and let them add what the
 *                         Ministry does not publish.
 */

const digits = (v) => String(v || '')
  .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
  .replace(/\D/g, '')

export default function RegistryLookup({ crNumber, unifiedNumber, onFill }) {
  const navigate = useNavigate()
  const [found, setFound] = useState(null)
  const [checking, setChecking] = useState(false)
  const [dismissed, setDismissed] = useState('')
  const last = useRef('')

  useEffect(() => {
    // A registration number is ten digits. Searching on three would match
    // thousands and interrupt somebody who has not finished typing.
    const q = digits(crNumber) || digits(unifiedNumber)
    if (q.length < 9) { setFound(null); return undefined }
    if (q === dismissed) return undefined

    let cancelled = false
    const t = setTimeout(async () => {
      setChecking(true)
      try {
        const { data } = await getSupabase()
          .rpc('search_companies_unified', { p_query: q, p_limit: 5 })

        if (cancelled) return
        // An exact match on the number, not a resemblance. This is the one
        // field where «already present» is a fact rather than a similarity.
        const hit = (data || []).find((r) => r.cr_number === q || r.unified_number === q)
        setFound(hit || null)
        last.current = q
      } catch {
        // Not fatal, and not shown. This is help, and help that fails should
        // get out of the way rather than become another error to read.
        if (!cancelled) setFound(null)
      } finally {
        if (!cancelled) setChecking(false)
      }
    }, 450)

    return () => { cancelled = true; clearTimeout(t) }
  }, [crNumber, unifiedNumber, dismissed])

  if (checking && !found) {
    return (
      <div style={{ fontSize: '12.5px', color: '#94A3B8', padding: '10px 2px' }}>
        جاري التحقّق من السجل…
      </div>
    )
  }

  if (!found) return null

  const inMarsad = found.origin === 'marsad'

  return (
    <div style={{
      background: inMarsad ? '#FFFBEB' : '#EFF6FF',
      border: `1px solid ${inMarsad ? '#FDE68A' : '#BFDBFE'}`,
      borderRadius: '13px', padding: '16px', marginBottom: '18px',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '11px' }}>
        <span style={{ fontSize: '19px', flex: 'none', lineHeight: 1.3 }}>
          {inMarsad ? '⚠️' : '🏛'}
        </span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '14px', fontWeight: 900, color: '#0F172A', marginBottom: '4px' }}>
            {inMarsad ? 'هذه الشركة مسجّلة في مرصد' : 'وجدناها في السجل التجاري'}
          </div>

          <div style={{ fontSize: '13.5px', color: '#334155', lineHeight: 1.9 }}>
            {found.name}
            {found.city ? ` — ${found.city}` : ''}
          </div>

          <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
            سجل {found.cr_number}
            {found.snapshot_period ? ` · ${found.snapshot_period}` : ''}
          </div>

          <div style={{ display: 'flex', gap: '9px', marginTop: '13px', flexWrap: 'wrap' }}>
            {inMarsad ? (
              <button
                type="button"
                onClick={() => navigate(`/trust-report/${found.id}`)}
                style={{
                  minHeight: '42px', padding: '0 18px', background: '#1E2A52', color: '#fff',
                  border: 0, borderRadius: '10px', fontSize: '13.5px', fontWeight: 800,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>
                افتح سجلها
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onFill(found)}
                style={{
                  minHeight: '42px', padding: '0 18px', background: '#1D4ED8', color: '#fff',
                  border: 0, borderRadius: '10px', fontSize: '13.5px', fontWeight: 800,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>
                املأ البيانات من السجل
              </button>
            )}

            {/* A way past. The match is on an exact number and is almost never
                wrong, but «almost» is not a reason to trap somebody in a form
                they cannot submit. */}
            <button
              type="button"
              onClick={() => { setDismissed(last.current); setFound(null) }}
              style={{
                minHeight: '42px', padding: '0 16px', background: 'none', color: '#64748B',
                border: 0, fontSize: '13px', fontWeight: 700, cursor: 'pointer',
                fontFamily: 'inherit',
              }}>
              متابعة الإدخال يدوياً
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
