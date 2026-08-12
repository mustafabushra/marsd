import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useUser, useAuth } from '@clerk/react'
import { getSupabase } from '../lib/api'
import { notifyTenant } from '../lib/notify'
import { useLiveData } from '../hooks/useLiveData'
import { LiveBadge } from '../components/LiveBadge'
import { SkeletonPage, SkeletonTable } from '../components/Skeleton'

/**
 * /admin/companies — إدارة الشركات: the registry as it stands, and what can be
 * done to it.
 *
 * It used to run its own small query on companies and show six columns: name,
 * CR, score, risk, status. Everything an administrator actually needed next —
 * how complete the file is, how many documents are waiting, whether a question
 * is open, whether anyone owns the record, whether the company is flagged
 * insolvent — was one screen away, and the screen it was on is the roster.
 *
 * So this reads company_roster, the same function the roster reads. One source,
 * two questions: the roster orders by what is waiting, this one lets you find a
 * company and act on it. A second query would have drifted from the first.
 *
 * The row opens the company file rather than a drawer with a copy of it. The
 * drawer is for the two decisions that belong to this screen and nowhere else:
 * suspending an account, and lifting a suspension.
 */

const PAGE = 25

const riskFrom = (score) => {
  if (score == null) return { label: 'بيانات غير كافية', bg: '#F1F5F9', c: '#64748B' }
  if (score >= 70) return { label: 'مخاطر منخفضة', bg: '#ECFDF5', c: '#15803D' }
  if (score >= 40) return { label: 'مخاطر متوسطة', bg: '#FFFBEB', c: '#B45309' }
  return { label: 'مخاطر مرتفعة', bg: '#FEF2F2', c: '#B91C1C' }
}

const statusMeta = (s) => {
  if (s === 'suspended') return { label: 'موقوفة', bg: '#FEF2F2', c: '#B91C1C' }
  if (s === 'pending') return { label: 'قيد المراجعة', bg: '#FFFBEB', c: '#B45309' }
  return { label: 'نشطة', bg: '#ECFDF5', c: '#15803D' }
}

// A registrar's flag outranks anything the platform computed about a company,
// so it is shown on the row and not only inside the file.
const OFFICIAL = {
  insolvency: 'تعثّر مالي', bankruptcy: 'إفلاس', liquidation: 'تصفية',
  suspended: 'إيقاف نشاط', struck_off: 'شطب السجل',
}

// Correctness problems, not missing fields. A blank sector is an incomplete
// record; a commercial registration number that is not one is a broken identity,
// and identity is what the trust report is sold on.
const ISSUE = {
  cr_format: 'سجل تجاري غير نظامي',
  duplicate_name: 'اسم مكرّر',
  no_sector: 'بلا قطاع',
  unreachable: 'لا سبيل للتواصل',
}

// A tenant row existing is not the same as somebody being there: an invitation
// that was never accepted creates the first without the second.
const INVITE = {
  pending: { t: 'مدعوّة — بانتظار القبول', bg: '#EEF2FF', c: '#1E40AF' },
  expired: { t: 'دعوة منتهية', bg: '#FFFBEB', c: '#B45309' },
}

const fmt = (iso) => (iso ? new Date(iso).toLocaleDateString('ar-SA') : '—')

const SORTS = [
  { key: 'attention', label: 'ما يحتاج متابعة' },
  { key: 'score_asc', label: 'الأقل ثقة' },
  { key: 'score_desc', label: 'الأعلى ثقة' },
  { key: 'reports', label: 'الأكثر تقارير' },
  { key: 'newest', label: 'الأحدث إضافة' },
  { key: 'name', label: 'الاسم' },
]

export default function AdminCompaniesManagement() {
  const navigate = useNavigate()
  const { user } = useUser()
  const { getToken } = useAuth()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // The sidebar links «الشركات غير المطالب بها» straight to this screen's own
  // unclaimed filter. Reading it from the URL is what makes that link mean
  // something — pressing it and landing on the unfiltered list would be the
  // quiet kind of wrong. The chips below still set state directly, so the URL
  // is a starting point and not a second source of truth.
  const [params] = useSearchParams()
  const urlFilter = params.get('filter')
  const [filter, setFilter] = useState(urlFilter || 'all')

  // «كل الشركات» and «غير المطالب بها» are the same mounted screen, so the
  // initialiser above only ever fires for whichever was opened first.
  // Resets when the link carries no filter, so «كل الشركات» is the whole list
  // even when you arrive from «غير المطالب بها».
  useEffect(() => { setFilter(urlFilter || 'all') }, [urlFilter])
  const [sort, setSort] = useState('attention')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [drawer, setDrawer] = useState(null)
  const [suspending, setSuspending] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')
  // Duplicate detection is a trigram scan over every pair, so it is a screen you
  // open rather than a column that loads with the list.
  const [dupes, setDupes] = useState(null)
  const [merge, setMerge] = useState(null)
  // Most of the registry was bulk-imported, so most companies have never heard
  // of their own record — and until somebody holds it, they cannot be asked for
  // anything.
  const [invite, setInvite] = useState(null)

  const showToast = (m) => { setToast(m); setTimeout(() => setToast(''), 4000) }

  const load = useCallback(async () => {
    try {
      setError('')
      const { data, error: e } = await getSupabase().rpc('company_roster')
      if (e) throw e
      // The registry is the approved companies. Anything still being decided on
      // belongs to مركز المراجعة, and showing it here would put two different
      // meanings of "company" in one list.
      setRows((data || []).filter((r) => r.approved))
    } catch (err) {
      setError(err?.message || 'تعذّر تحميل الشركات')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])
  const { connected, liveAt } = useLiveData(load, {
    tables: ['companies', 'company_documents', 'clarification_requests', 'trust_scores'],
  })

  // Keep the open drawer showing the row it was opened on, not a stale copy.
  useEffect(() => {
    if (!drawer) return
    const fresh = rows.find((r) => r.company_id === drawer.company_id)
    if (fresh && fresh !== drawer) setDrawer(fresh)
  }, [rows]) // eslint-disable-line react-hooks/exhaustive-deps

  const stats = useMemo(() => ({
    all: rows.length,
    suspended: rows.filter((r) => r.status === 'suspended').length,
    attention: rows.filter((r) => r.open_clarifications > 0 || r.docs_pending > 0).length,
    flagged: rows.filter((r) => r.official_status && r.official_status !== 'none').length,
    unclaimed: rows.filter((r) => !r.claimed_by).length,
    weak: rows.filter((r) => r.trust_score == null).length,
    broken: rows.filter((r) => (r.quality_issues || []).length > 0).length,
  }), [rows])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const out = rows.filter((r) => {
      if (filter === 'suspended' && r.status !== 'suspended') return false
      if (filter === 'attention' && !(r.open_clarifications > 0 || r.docs_pending > 0)) return false
      if (filter === 'flagged' && (!r.official_status || r.official_status === 'none')) return false
      if (filter === 'unclaimed' && r.claimed_by) return false
      if (filter === 'weak' && r.trust_score != null) return false
      if (filter === 'broken' && !(r.quality_issues || []).length) return false
      if (!q) return true
      return (r.name || '').toLowerCase().includes(q)
        || (r.cr_number || '').includes(q)
        || (r.claimed_by || '').toLowerCase().includes(q)
    })

    const by = {
      attention: (a, b) =>
        (b.open_clarifications - a.open_clarifications)
        || (b.docs_pending - a.docs_pending)
        || (a.completeness - b.completeness),
      // Nulls are "no score yet", which is not the same as a low score, so they
      // go last in both directions rather than sorting as zero.
      score_asc: (a, b) => (a.trust_score ?? 1e9) - (b.trust_score ?? 1e9),
      score_desc: (a, b) => (b.trust_score ?? -1) - (a.trust_score ?? -1),
      reports: (a, b) => b.reports_about - a.reports_about,
      newest: (a, b) => new Date(b.created_at) - new Date(a.created_at),
      name: (a, b) => (a.name || '').localeCompare(b.name || '', 'ar'),
    }
    return [...out].sort(by[sort] || by.attention)
  }, [rows, filter, search, sort])

  useEffect(() => { setPage(1) }, [filter, search, sort])
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE))
  const shown = filtered.slice((page - 1) * PAGE, page * PAGE)

  // ---- actions -------------------------------------------------------------

  const setStatus = async (company, status, why) => {
    try {
      setBusy(true)
      const supabase = getSupabase()
      const patch = status === 'suspended'
        ? { status, status_reason: why }
        : { status }

      const { data, error: e } = await supabase
        .from('companies').update(patch).eq('id', company.company_id)
        .select('id, status')
      if (e) throw e
      // An UPDATE that RLS filters out matches nothing and raises nothing.
      if (!data?.length) throw new Error('لم تُحفظ الحالة — تحقّق من صلاحيتك')

      const { data: owner } = await supabase
        .from('tenants').select('id').eq('company_id', company.company_id).maybeSingle()
      if (owner?.id) {
        await notifyTenant(owner.id, 'company_data_updated', {
          title: status === 'suspended' ? 'عُلِّق سجل شركتك' : 'أُعيد تفعيل سجل شركتك',
          message: status === 'suspended'
            ? `لم يعد سجل «${company.name}» ظاهراً في نتائج البحث. السبب: ${why}`
            : `عاد سجل «${company.name}» للظهور في مرصد.`,
          meta: { company_id: company.company_id, status, reason: why || null },
        })
      }
      await supabase.from('audit_logs').insert([{
        actor_id: user?.id || null,
        action: status === 'suspended' ? 'company_suspended' : 'company_reactivated',
        entity: 'company', entity_id: company.company_id,
        created_at: new Date().toISOString(),
      }])

      setSuspending(false)
      setReason('')
      showToast(status === 'suspended' ? 'تم تعليق الشركة' : 'تم إعادة تفعيل الشركة')
      await load()
    } catch (err) {
      showToast('❌ تعذّر تغيير الحالة: ' + (err?.message || 'خطأ غير معروف'))
    } finally { setBusy(false) }
  }

  const findDuplicates = async () => {
    try {
      setBusy(true)
      const { data, error: e } = await getSupabase()
        .rpc('company_duplicates', { p_threshold: 0.55, p_limit: 100 })
      if (e) throw e
      setDupes(data || [])
      if (!data?.length) showToast('لا توجد سجلات متشابهة فوق الحد')
    } catch (err) { showToast('❌ ' + (err?.message || 'تعذّر الفحص')) } finally { setBusy(false) }
  }

  // Irreversible: the losing record is deleted after everything on it moves. The
  // confirmation asks which record survives rather than assuming, because the
  // older row is not always the better one.
  const doMerge = async () => {
    try {
      setBusy(true)
      const { data, error: e } = await getSupabase().rpc('merge_companies', {
        p_keep: merge.keep, p_drop: merge.drop, p_reason: merge.reason.trim(),
      })
      if (e) throw e
      const moved = data?.moved || {}
      showToast(`✅ دُمج السجلّان · ${moved.reports || 0} تقرير و${moved.documents || 0} مستند`)
      setMerge(null)
      setDupes(null)
      await load()
    } catch (err) { showToast('❌ ' + (err?.message || 'تعذّر الدمج')) } finally { setBusy(false) }
  }

  // The database side is invite_company(); this only carries the Clerk session
  // to the endpoint that may hold the secret. A failure to send must not leave a
  // half-invited company behind, which the endpoint undoes.
  const sendInvite = async () => {
    try {
      setBusy(true)
      let token = null
      try { token = await getToken() } catch { token = null }
      if (!token) { showToast('❌ الجلسة منتهية — أعد تسجيل الدخول'); return }

      const resp = await fetch('/api/invite-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          company_id: invite.companyId,
          email: invite.email.trim().toLowerCase(),
          note: invite.note.trim() || null,
        }),
      })
      const ct = resp.headers.get('content-type') || ''
      if (!ct.includes('application/json')) {
        showToast('❌ خدمة الدعوات غير منشورة على الخادم')
        return
      }
      const data = await resp.json().catch(() => null)
      if (!resp.ok || !data?.emailSent) {
        showToast('❌ ' + (data?.error || 'تعذّر إرسال الدعوة'))
        return
      }
      showToast(`✅ أُرسلت الدعوة إلى ${data.email || invite.email}`)
      setInvite(null)
      await load()
    } catch (err) {
      showToast('❌ ' + (err?.message || 'تعذّر إرسال الدعوة'))
    } finally { setBusy(false) }
  }

  const exportCsv = () => {
    const head = ['الشركة', 'السجل التجاري', 'القطاع', 'المدينة', 'مؤشر الثقة',
      'الاكتمال %', 'مستندات موثقة', 'مستندات معلّقة', 'توضيحات مفتوحة',
      'تقارير معتمدة', 'المالك', 'الحالة', 'سبب التعليق', 'الحالة الرسمية',
      'ملاحظات على البيانات', 'حالة الدعوة']
    const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const body = filtered.map((r) => [
      r.name, r.cr_number, r.sector, r.city, r.trust_score ?? '',
      r.completeness, r.docs_verified, r.docs_pending, r.open_clarifications,
      r.reports_about, r.claimed_by || 'غير مطالَب بها',
      statusMeta(r.status).label, r.status_reason || '',
      OFFICIAL[r.official_status] || '',
      (r.quality_issues || []).map((i) => ISSUE[i] || i).join(' · '),
      r.claimed_by ? 'مُستلَم' : (INVITE[r.invite_status]?.t || 'لم تُدعَ'),
    ].map(cell).join(','))

    // BOM first, or Excel opens Arabic as mojibake.
    const blob = new Blob(['﻿' + [head.map(cell).join(','), ...body].join('\r\n')],
      { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `marsad-companies-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
    showToast(`صُدِّرت ${filtered.length} شركة`)
  }

  // ---- render --------------------------------------------------------------

  const CHIPS = [
    { key: 'all', label: 'الكل', value: stats.all, color: '#1E2A52' },
    { key: 'attention', label: 'تحتاج متابعة', value: stats.attention, color: '#B45309' },
    { key: 'flagged', label: 'حالة رسمية', value: stats.flagged, color: '#DC2626' },
    { key: 'suspended', label: 'موقوفة', value: stats.suspended, color: '#DC2626' },
    { key: 'broken', label: 'بيانات غير سليمة', value: stats.broken, color: '#DC2626' },
    { key: 'unclaimed', label: 'غير مطالَب بها', value: stats.unclaimed, color: '#64748B' },
    { key: 'weak', label: 'بلا مؤشر', value: stats.weak, color: '#F59E0B' },
  ]

  const chipStyle = (f) => ({
    padding: '9px 16px', borderRadius: '999px', fontSize: '13px', fontWeight: 800,
    cursor: 'pointer', fontFamily: 'inherit',
    border: `1.5px solid ${filter === f ? '#1E2A52' : '#E2E8F0'}`,
    background: filter === f ? '#1E2A52' : '#fff',
    color: filter === f ? '#fff' : '#64748B',
  })

  const COLS = '2.3fr 1.1fr 0.7fr 1fr 1.1fr 0.9fr 0.9fr 30px'

  if (loading) {
    return (
      <>
        <SkeletonPage stats={0} panels={0} />
        <SkeletonTable rows={7} cols={4} />
      </>
    )
  }

  return (
    <div>
      {toast && <div style={{ position: 'fixed', bottom: '24px', insetInlineStart: '24px', background: '#0F172A', color: '#fff', borderRadius: '10px', padding: '12px 18px', fontSize: '13.5px', fontWeight: 700, zIndex: 300, boxShadow: '0 8px 24px rgba(15,23,42,.25)' }}>{toast}</div>}

      {error && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C', borderRadius: '12px', padding: '14px 18px', marginBottom: '16px', fontSize: '13.5px', fontWeight: 700 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        <LiveBadge connected={connected} liveAt={liveAt} />
        <span style={{ marginInlineStart: 'auto', fontSize: '13px', color: '#64748B', fontWeight: 700 }}>
          {filtered.length.toLocaleString('en-US')} من {rows.length.toLocaleString('en-US')} شركة
        </span>
      </div>

      {/* Counts that are also the filters — a number you cannot act on is decoration. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: '12px', marginBottom: '18px' }}>
        {CHIPS.map((s) => (
          <div key={s.key} onClick={() => setFilter(s.key)}
               style={{ background: '#fff', border: `1px solid ${filter === s.key ? s.color : '#E2E8F0'}`, borderRadius: '14px', padding: '16px 18px', cursor: 'pointer' }}>
            <div style={{ fontSize: '12.5px', color: '#64748B', fontWeight: 700, marginBottom: '7px' }}>{s.label}</div>
            <div style={{ fontSize: '24px', fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.value.toLocaleString('en-US')}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: '220px', display: 'flex', alignItems: 'center', gap: '11px', background: '#fff', border: '1.5px solid #E2E8F0', borderRadius: '11px', padding: '0 14px' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m21 21-4.3-4.3"></path></svg>
          <input value={search} onChange={(e) => setSearch(e.target.value)}
                 placeholder="بحث بالاسم أو السجل التجاري أو المالك"
                 style={{ flex: 1, border: 0, background: 'transparent', padding: '12px 0', fontSize: '14.5px', outline: 'none', textAlign: 'right', fontFamily: 'inherit' }} />
        </div>
        <select value={sort} onChange={(e) => setSort(e.target.value)}
                aria-label="ترتيب القائمة"
                style={{ background: '#fff', border: '1.5px solid #E2E8F0', borderRadius: '11px', padding: '12px 14px', fontSize: '13.5px', fontWeight: 700, color: '#334155', fontFamily: 'inherit', cursor: 'pointer' }}>
          {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <button onClick={findDuplicates} disabled={busy}
                style={{ background: '#fff', color: '#B45309', border: '1.5px solid #FDE68A', borderRadius: '11px', padding: '12px 18px', fontSize: '13.5px', fontWeight: 800, cursor: busy ? 'default' : 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit' }}>
          ⧉ التكرارات المحتملة
        </button>
        <button onClick={exportCsv} disabled={!filtered.length}
                style={{ background: '#fff', color: '#334155', border: '1.5px solid #E2E8F0', borderRadius: '11px', padding: '12px 18px', fontSize: '13.5px', fontWeight: 800, cursor: filtered.length ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap', fontFamily: 'inherit' }}>
          ⬇ تصدير المعروض
        </button>
        <button onClick={() => navigate('/admin/bulk-import')}
                style={{ background: '#F5F3FF', color: '#6D28D9', border: '1.5px solid #DDD6FE', borderRadius: '11px', padding: '12px 18px', fontSize: '13.5px', fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit' }}>
          ⬆ رفع دفعة (Excel)
        </button>
      </div>

      <div style={{ display: 'flex', gap: '9px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {CHIPS.map((s) => <span key={s.key} onClick={() => setFilter(s.key)} style={chipStyle(s.key)}>{s.label}</span>)}
      </div>

      {/* Table */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: COLS, padding: '14px 22px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', fontSize: '12.5px', fontWeight: 800, color: '#64748B' }}>
          <span>الشركة</span><span>السجل التجاري</span><span>المؤشر</span>
          <span>المخاطر</span><span>الملف</span><span>المالك</span><span>الحالة</span><span></span>
        </div>

        {shown.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#64748B', fontSize: '14px' }}>لا توجد شركات مطابقة</div>
        ) : shown.map((r) => {
          const risk = riskFrom(r.trust_score)
          const st = statusMeta(r.status)
          const flag = r.official_status && r.official_status !== 'none' ? OFFICIAL[r.official_status] : null
          return (
            <div key={r.company_id}
                 onClick={() => navigate(`/admin/company/${r.company_id}`)}
                 style={{ display: 'grid', gridTemplateColumns: COLS, padding: '13px 22px', borderBottom: '1px solid #F1F5F9', alignItems: 'center', cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                <span style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#1E2A52', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '15px', flex: 'none' }}>{(r.name || '؟').charAt(0)}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.name}{r.verified ? ' ✔' : ''}
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748B' }}>
                    {r.sector || '—'} · {r.city || '—'}
                    {flag && <span style={{ color: '#B91C1C', fontWeight: 800 }}> · {flag}</span>}
                    {(r.quality_issues || []).map((i) => (
                      <span key={i} style={{ color: '#B45309', fontWeight: 800 }}> · {ISSUE[i] || i}</span>
                    ))}
                  </div>
                </div>
              </div>

              <span style={{ fontSize: '13.5px', color: '#64748B', fontWeight: 600, direction: 'ltr', textAlign: 'right' }}>{r.cr_number || '—'}</span>
              <span style={{ fontSize: '16px', fontWeight: 900, color: '#1E2A52' }}>{r.trust_score != null ? r.trust_score : '—'}</span>
              <span><span style={{ background: risk.bg, color: risk.c, borderRadius: '7px', padding: '4px 11px', fontSize: '12px', fontWeight: 800 }}>{risk.label}</span></span>

              {/* What the file is waiting on, without opening it. */}
              <span style={{ fontSize: '12.5px', color: '#64748B', fontWeight: 700 }}>
                {r.completeness}%
                {r.docs_pending > 0 && <span style={{ color: '#B45309' }}> · {r.docs_pending} مستند</span>}
                {r.open_clarifications > 0 && <span style={{ color: '#B45309' }}> · {r.open_clarifications} سؤال</span>}
              </span>

              <span style={{ fontSize: '12.5px', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                             color: r.claimed_by ? '#334155' : (INVITE[r.invite_status]?.c || '#94A3B8') }}>
                {r.claimed_by || INVITE[r.invite_status]?.t || 'غير مطالَب بها'}
              </span>

              <span><span style={{ background: st.bg, color: st.c, borderRadius: '7px', padding: '4px 11px', fontSize: '12.5px', fontWeight: 800 }}>{st.label}</span></span>

              <button onClick={(e) => { e.stopPropagation(); setDrawer(r) }}
                      title="إجراءات الحساب"
                      style={{ background: 'transparent', border: 0, color: '#94A3B8', fontWeight: 900, fontSize: '17px', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>⋮</button>
            </div>
          )
        })}
      </div>

      {pages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginTop: '16px' }}>
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                  style={{ padding: '9px 16px', borderRadius: '9px', border: '1.5px solid #E2E8F0', background: '#fff', color: page === 1 ? '#CBD5E1' : '#334155', fontWeight: 800, fontSize: '13px', cursor: page === 1 ? 'default' : 'pointer', fontFamily: 'inherit' }}>السابق</button>
          <span style={{ fontSize: '13px', color: '#64748B', fontWeight: 700 }}>صفحة {page} من {pages}</span>
          <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page === pages}
                  style={{ padding: '9px 16px', borderRadius: '9px', border: '1.5px solid #E2E8F0', background: '#fff', color: page === pages ? '#CBD5E1' : '#334155', fontWeight: 800, fontSize: '13px', cursor: page === pages ? 'default' : 'pointer', fontFamily: 'inherit' }}>التالي</button>
        </div>
      )}

      {/* Account actions. The company's data lives in its file, not in here. */}
      {drawer && (
        <>
          <div onClick={() => { setDrawer(null); setSuspending(false); setReason('') }}
               style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(15,23,42,.5)' }}></div>
          <div dir="rtl" style={{ position: 'fixed', top: 0, bottom: 0, insetInlineEnd: 0, zIndex: 201, width: '520px', maxWidth: '94vw', background: '#fff', boxShadow: '-8px 0 40px rgba(0,0,0,.2)', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 26px', borderBottom: '1px solid #E2E8F0', position: 'sticky', top: 0, background: '#fff', zIndex: 2 }}>
              <h3 style={{ fontSize: '18px', fontWeight: 900, color: '#0F172A', margin: 0 }}>إجراءات الحساب</h3>
              <button onClick={() => { setDrawer(null); setSuspending(false); setReason('') }}
                      aria-label="إغلاق"
                      style={{ background: '#F1F5F9', border: 0, borderRadius: '9px', width: '34px', height: '34px', fontSize: '18px', cursor: 'pointer', color: '#64748B', fontFamily: 'inherit' }}>✕</button>
            </div>

            <div style={{ padding: '26px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '22px' }}>
                <div style={{ width: '56px', height: '56px', borderRadius: '14px', background: '#1E2A52', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', fontWeight: 900, flex: 'none' }}>{(drawer.name || '؟').charAt(0)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h2 style={{ fontSize: '19px', fontWeight: 900, color: '#0F172A', margin: '0 0 6px', lineHeight: 1.3 }}>{drawer.name}</h2>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ background: statusMeta(drawer.status).bg, color: statusMeta(drawer.status).c, borderRadius: '7px', padding: '3px 10px', fontSize: '12px', fontWeight: 800 }}>{statusMeta(drawer.status).label}</span>
                    <span style={{ background: riskFrom(drawer.trust_score).bg, color: riskFrom(drawer.trust_score).c, borderRadius: '7px', padding: '3px 10px', fontSize: '12px', fontWeight: 800 }}>{riskFrom(drawer.trust_score).label}</span>
                    {drawer.official_status && drawer.official_status !== 'none' && (
                      <span style={{ background: '#FEF2F2', color: '#B91C1C', borderRadius: '7px', padding: '3px 10px', fontSize: '12px', fontWeight: 800 }}>{OFFICIAL[drawer.official_status]}</span>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '22px' }}>
                {[
                  ['مؤشر الثقة', drawer.trust_score != null ? drawer.trust_score : '—'],
                  ['اكتمال الملف', `${drawer.completeness}%`],
                  ['مستندات موثقة', `${drawer.docs_verified}${drawer.docs_pending ? ` · ${drawer.docs_pending} معلّق` : ''}`],
                  ['تقارير معتمدة', drawer.reports_about],
                  ['المالك', drawer.claimed_by || INVITE[drawer.invite_status]?.t || 'غير مطالَب بها'],
                  ['أُضيفت', fmt(drawer.created_at)],
                ].map(([l, v]) => (
                  <div key={l} style={{ background: '#F8FAFC', borderRadius: '11px', padding: '14px' }}>
                    <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 700, marginBottom: '4px' }}>{l}</div>
                    <div style={{ fontSize: '14.5px', fontWeight: 800, color: '#0F172A' }}>{v}</div>
                  </div>
                ))}
              </div>

              {drawer.status === 'suspended' && drawer.status_reason && (
                <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '12px', padding: '14px 16px', marginBottom: '22px' }}>
                  <div style={{ fontSize: '12px', color: '#B91C1C', fontWeight: 800, marginBottom: '5px' }}>سبب التعليق</div>
                  <div style={{ fontSize: '13.5px', color: '#7F1D1D', fontWeight: 600, lineHeight: 1.6 }}>{drawer.status_reason}</div>
                  <div style={{ fontSize: '12px', color: '#B91C1C', marginTop: '7px' }}>{fmt(drawer.status_at)}{drawer.status_by ? ` · ${drawer.status_by}` : ''}</div>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <button onClick={() => navigate(`/admin/company/${drawer.company_id}`)}
                        style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#1E2A52', border: 0, borderRadius: '12px', padding: '14px 16px', cursor: 'pointer', textAlign: 'right', width: '100%', fontFamily: 'inherit' }}>
                  <span style={{ width: '38px', height: '38px', borderRadius: '10px', background: 'rgba(255,255,255,.15)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '17px', flex: 'none' }}>📁</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '14.5px', fontWeight: 800, color: '#fff' }}>فتح ملفّ الشركة</div>
                    <div style={{ fontSize: '12.5px', color: 'rgba(255,255,255,.75)' }}>البيانات والمستندات والتقارير وطلبات التوضيح</div>
                  </div>
                </button>

                {!drawer.claimed_by && (
                  <button onClick={() => setInvite({
                            companyId: drawer.company_id, name: drawer.name,
                            email: drawer.invited_email || '', note: '',
                          })}
                          style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#FFFBEB', border: '1.5px solid #FDE68A', borderRadius: '12px', padding: '14px 16px', cursor: 'pointer', textAlign: 'right', width: '100%', fontFamily: 'inherit' }}>
                    <span style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#B45309', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '17px', flex: 'none' }}>✉</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '14.5px', fontWeight: 800, color: '#92400E' }}>
                        {drawer.invite_status === 'pending' ? 'إعادة إرسال دعوة الاستلام' : 'دعوة الشركة لاستلام سجلّها'}
                      </div>
                      <div style={{ fontSize: '12.5px', color: '#B45309' }}>
                        {drawer.invite_status === 'pending'
                          ? `أُرسلت ${fmt(drawer.invited_at)} إلى ${drawer.invited_email}`
                          : 'شرط مطالبتها بالمستندات لاحقاً'}
                      </div>
                    </div>
                  </button>
                )}

                <button onClick={() => navigate(`/trust-report/${drawer.company_id}`)}
                        style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#fff', border: '1.5px solid #E2E8F0', borderRadius: '12px', padding: '14px 16px', cursor: 'pointer', textAlign: 'right', width: '100%', fontFamily: 'inherit' }}>
                  <span style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#EEF2FF', color: '#1E2A52', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '17px', flex: 'none' }}>📊</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '14.5px', fontWeight: 800, color: '#0F172A' }}>تقرير الثقة كما يراه العميل</div>
                    <div style={{ fontSize: '12.5px', color: '#64748B' }}>نفس الصفحة التي تُباع للمشترك</div>
                  </div>
                </button>

                {drawer.status === 'suspended' ? (
                  <button onClick={() => setStatus(drawer, 'active')} disabled={busy}
                          style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#F0FDF4', border: '1.5px solid #BBF7D0', borderRadius: '12px', padding: '14px 16px', cursor: busy ? 'not-allowed' : 'pointer', textAlign: 'right', width: '100%', fontFamily: 'inherit' }}>
                    <span style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#16A34A', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '17px', flex: 'none' }}>✓</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '14.5px', fontWeight: 800, color: '#15803D' }}>{busy ? 'جارٍ التنفيذ…' : 'إعادة تفعيل الحساب'}</div>
                      <div style={{ fontSize: '12.5px', color: '#16A34A' }}>استئناف ظهور الشركة في المنصة</div>
                    </div>
                  </button>
                ) : !suspending ? (
                  <button onClick={() => setSuspending(true)}
                          style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#FEF2F2', border: '1.5px solid #FECACA', borderRadius: '12px', padding: '14px 16px', cursor: 'pointer', textAlign: 'right', width: '100%', fontFamily: 'inherit' }}>
                    <span style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#DC2626', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '17px', flex: 'none' }}>⛔</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '14.5px', fontWeight: 800, color: '#B91C1C' }}>تعليق حساب الشركة</div>
                      <div style={{ fontSize: '12.5px', color: '#DC2626' }}>إخفاء من نتائج البحث حتى إشعار آخر</div>
                    </div>
                  </button>
                ) : (
                  <div style={{ background: '#FEF2F2', border: '1.5px solid #FECACA', borderRadius: '12px', padding: '16px' }}>
                    <label>
                      <span style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#B91C1C', marginBottom: '8px' }}>
                        سبب التعليق — يُعرض للشركة
                      </span>
                      <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3}
                                placeholder="مثال: تكرار بلاغات موثّقة عن عدم السداد دون ردّ على طلبات التوضيح"
                                style={{ width: '100%', padding: '11px 13px', border: '1.5px solid #FECACA', borderRadius: '9px', fontSize: '13.5px', fontFamily: 'inherit', resize: 'vertical' }} />
                    </label>
                    <div style={{ display: 'flex', gap: '9px', marginTop: '12px' }}>
                      <button onClick={() => setStatus(drawer, 'suspended', reason.trim())}
                              disabled={busy || !reason.trim()}
                              style={{ padding: '11px 20px', background: reason.trim() ? '#DC2626' : '#FCA5A5', color: '#fff', border: 0, borderRadius: '9px', fontSize: '13.5px', fontWeight: 800, cursor: reason.trim() && !busy ? 'pointer' : 'default', fontFamily: 'inherit' }}>
                        {busy ? 'جارٍ التعليق…' : 'تأكيد التعليق'}
                      </button>
                      <button onClick={() => { setSuspending(false); setReason('') }}
                              style={{ padding: '11px 18px', background: '#fff', color: '#475569', border: '1.5px solid #E2E8F0', borderRadius: '9px', fontSize: '13.5px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>إلغاء</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {invite && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', display: 'grid', placeItems: 'center', zIndex: 230, padding: '20px' }}
             onClick={(e) => { if (e.target === e.currentTarget && !busy) setInvite(null) }}>
          <div style={{ background: '#fff', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '480px' }}>
            <h2 style={{ fontSize: '17px', fontWeight: 900, color: '#0F172A', margin: '0 0 4px' }}>دعوة الشركة لاستلام سجلّها</h2>
            <p style={{ fontSize: '13px', color: '#64748B', margin: '0 0 16px', lineHeight: 1.8 }}>
              يصل «{invite.name}» بريد لإنشاء حساب مرتبط بسجلّها مباشرة. بعد أن تقبل الدعوة
              تستطيع مطالبتها بالمستندات، وتصلها الإشعارات.
            </p>

            <label>
              <span style={{ display: 'block', fontSize: '12.5px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                البريد الرسمي للشركة <span style={{ color: '#B91C1C' }}>*</span>
              </span>
              <input type="email" dir="ltr" value={invite.email}
                     onChange={(e) => setInvite((v) => ({ ...v, email: e.target.value }))}
                     placeholder="info@company.com"
                     style={{ width: '100%', padding: '10px 13px', border: '1.5px solid #E2E8F0', borderRadius: '9px', fontSize: '13.5px', fontFamily: 'inherit' }} />
            </label>

            <label style={{ display: 'block', marginTop: '12px' }}>
              <span style={{ display: 'block', fontSize: '12.5px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>ملاحظة داخلية</span>
              <input value={invite.note}
                     onChange={(e) => setInvite((v) => ({ ...v, note: e.target.value }))}
                     placeholder="تُحفظ في سجل الشركة ولا تُرسل"
                     style={{ width: '100%', padding: '10px 13px', border: '1.5px solid #E2E8F0', borderRadius: '9px', fontSize: '13.5px', fontFamily: 'inherit' }} />
            </label>

            <p style={{ fontSize: '12px', color: '#94A3B8', margin: '12px 0 0', lineHeight: 1.7 }}>
              يُحفظ البريد على السجل إن لم يكن له بريد رسمي، ويصبح أول من يقبل الدعوة مديراً للحساب.
            </p>

            <div style={{ display: 'flex', gap: '9px', marginTop: '18px' }}>
              <button onClick={sendInvite} disabled={busy || !invite.email.trim()}
                      style={{ padding: '11px 22px', background: invite.email.trim() ? '#1E2A52' : '#CBD5E1', color: '#fff', border: 0, borderRadius: '9px', fontSize: '13.5px', fontWeight: 800, cursor: invite.email.trim() && !busy ? 'pointer' : 'default', fontFamily: 'inherit' }}>
                {busy ? 'جارٍ الإرسال…' : 'إرسال الدعوة'}
              </button>
              <button onClick={() => setInvite(null)} disabled={busy}
                      style={{ padding: '11px 20px', background: '#fff', color: '#475569', border: '1.5px solid #E2E8F0', borderRadius: '9px', fontSize: '13.5px', fontWeight: 800, cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit' }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* Possible duplicates. Two records for one business means two trust
          scores, and the reports split between them — so both are wrong. */}
      {dupes && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', display: 'grid', placeItems: 'center', zIndex: 220, padding: '20px' }}
             onClick={(e) => { if (e.target === e.currentTarget) setDupes(null) }}>
          <div style={{ background: '#fff', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '900px', maxHeight: '88vh', overflowY: 'auto' }}>
            <h2 style={{ fontSize: '17px', fontWeight: 900, color: '#0F172A', margin: '0 0 4px' }}>
              التكرارات المحتملة — {dupes.length}
            </h2>
            <p style={{ fontSize: '13px', color: '#64748B', margin: '0 0 18px', lineHeight: 1.7 }}>
              سجلّان لنفس الشركة يعنيان مؤشّرَي ثقة، والتقارير موزّعة بينهما — فكلاهما خطأ.
              راجع الطرفين قبل الدمج: التشابه في الاسم لا يعني دائماً أنها نفس المنشأة.
            </p>

            {dupes.length === 0 ? (
              <div style={{ padding: '30px', textAlign: 'center', color: '#64748B' }}>لا شيء فوق حدّ التشابه</div>
            ) : dupes.map((d) => (
              <div key={`${d.a_id}-${d.b_id}`}
                   style={{ border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '9px', marginBottom: '12px' }}>
                  <span style={{ background: d.reason === 'same_name' ? '#FEF2F2' : '#FFFBEB', color: d.reason === 'same_name' ? '#B91C1C' : '#B45309', borderRadius: '7px', padding: '3px 10px', fontSize: '12px', fontWeight: 800 }}>
                    {d.reason === 'same_name' ? 'الاسم نفسه' : `تشابه ${Math.round(d.similarity * 100)}%`}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  {[['a', d.a_id, d.a_name, d.a_cr, d.a_reports, d.a_score, d.a_created],
                    ['b', d.b_id, d.b_name, d.b_cr, d.b_reports, d.b_score, d.b_created]].map(
                    ([side, cid, cname, ccr, creports, cscore, ccreated]) => (
                      <div key={side} style={{ background: '#F8FAFC', borderRadius: '11px', padding: '14px' }}>
                        <div style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A', marginBottom: '7px' }}>{cname}</div>
                        <div style={{ fontSize: '12.5px', color: '#64748B', fontWeight: 700, lineHeight: 1.9 }}>
                          <div>السجل: <span style={{ direction: 'ltr', display: 'inline-block' }}>{ccr || '—'}</span></div>
                          <div>التقارير المعتمدة: {creports}</div>
                          <div>المؤشر: {cscore != null ? cscore : 'لا يوجد'}</div>
                          <div>أُضيف: {fmt(ccreated)}</div>
                        </div>
                        <div style={{ display: 'flex', gap: '7px', marginTop: '11px' }}>
                          <button onClick={() => navigate(`/admin/company/${cid}`)}
                                  style={{ padding: '7px 12px', borderRadius: '8px', border: '1.5px solid #E2E8F0', background: '#fff', color: '#334155', fontSize: '12px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                            فتح الملف
                          </button>
                          <button onClick={() => setMerge({
                                    keep: cid, drop: side === 'a' ? d.b_id : d.a_id,
                                    keepName: cname, dropName: side === 'a' ? d.b_name : d.a_name,
                                    dropReports: side === 'a' ? d.b_reports : d.a_reports,
                                    reason: '',
                                  })}
                                  style={{ padding: '7px 12px', borderRadius: '8px', border: 0, background: '#1E2A52', color: '#fff', fontSize: '12px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                            أبقِ هذا وادمج الآخر
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            ))}

            <button onClick={() => setDupes(null)}
                    style={{ padding: '11px 20px', background: '#fff', color: '#475569', border: '1.5px solid #E2E8F0', borderRadius: '9px', fontSize: '13.5px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>إغلاق</button>
          </div>
        </div>
      )}

      {/* The merge itself deletes a record, so it asks once, plainly, and says
          exactly what moves and what disappears. */}
      {merge && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.6)', display: 'grid', placeItems: 'center', zIndex: 240, padding: '20px' }}
             onClick={(e) => { if (e.target === e.currentTarget && !busy) setMerge(null) }}>
          <div style={{ background: '#fff', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '520px' }}>
            <h2 style={{ fontSize: '17px', fontWeight: 900, color: '#B91C1C', margin: '0 0 12px' }}>دمج لا يمكن التراجع عنه</h2>

            <div style={{ background: '#F8FAFC', borderRadius: '11px', padding: '15px', fontSize: '13.5px', lineHeight: 2, color: '#334155', fontWeight: 700 }}>
              <div>يبقى: <span style={{ color: '#15803D', fontWeight: 900 }}>{merge.keepName}</span></div>
              <div>يُحذف: <span style={{ color: '#B91C1C', fontWeight: 900 }}>{merge.dropName}</span></div>
            </div>

            <ul style={{ fontSize: '13px', color: '#475569', lineHeight: 1.9, margin: '14px 0', paddingInlineStart: '20px' }}>
              <li>تنتقل تقارير السجل المحذوف ({merge.dropReports}) ومستنداته واعتراضاته إلى السجل الباقي</li>
              <li>تُملأ الحقول الفارغة في السجل الباقي من المحذوف — ولا يُستبدل شيء موجود</li>
              <li>يبقى الاسم القديم قابلاً للبحث ضمن «الأسماء السابقة»</li>
              <li>يُعاد حساب مؤشر الثقة على التقارير مجتمعة</li>
            </ul>

            <label>
              <span style={{ display: 'block', fontSize: '12.5px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                سبب الدمج <span style={{ color: '#B91C1C' }}>*</span>
              </span>
              <input value={merge.reason} onChange={(e) => setMerge((m) => ({ ...m, reason: e.target.value }))}
                     placeholder="مثال: نفس المنشأة، أُضيفت مرتين بسجلّين مختلفين"
                     style={{ width: '100%', padding: '10px 13px', border: '1.5px solid #E2E8F0', borderRadius: '9px', fontSize: '13.5px', fontFamily: 'inherit' }} />
            </label>

            <div style={{ display: 'flex', gap: '9px', marginTop: '18px' }}>
              <button onClick={doMerge} disabled={busy || !merge.reason.trim()}
                      style={{ padding: '11px 22px', background: merge.reason.trim() ? '#B91C1C' : '#FCA5A5', color: '#fff', border: 0, borderRadius: '9px', fontSize: '13.5px', fontWeight: 800, cursor: merge.reason.trim() && !busy ? 'pointer' : 'default', fontFamily: 'inherit' }}>
                {busy ? 'جارٍ الدمج…' : 'تأكيد الدمج'}
              </button>
              <button onClick={() => setMerge(null)} disabled={busy}
                      style={{ padding: '11px 20px', background: '#fff', color: '#475569', border: '1.5px solid #E2E8F0', borderRadius: '9px', fontSize: '13.5px', fontWeight: 800, cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit' }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
