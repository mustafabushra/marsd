import { getSupabase } from './api'

/**
 * Writing a notification that the notifications table will actually accept.
 *
 * Every call site had the shape wrong. The table takes user_id (not null),
 * tenant_id, type, and a jsonb payload; the code sent tenant_id, title, message
 * and is_read — three columns that do not exist and one required column it never
 * provided. No insert could have succeeded, and none of their errors were read,
 * so the platform has written a notification on every report approval, rejection
 * and information request since launch, and the table holds nothing.
 *
 * A notification is addressed to a person, and the review flows know only which
 * company to tell — so this fans out to that company's members. Title and body
 * live in the payload, which is what jsonb is there for.
 */

/** Notify every member of a tenant who has not switched this type off. */
export async function notifyTenant(tenantId, type, { title, message, meta = {} } = {}) {
  if (!tenantId || !type) return 0

  try {
    const supabase = getSupabase()

    const { data: members, error: memberErr } = await supabase
      .from('users')
      .select('id, notification_prefs')
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
    if (memberErr) throw memberErr

    // The preference is read here, at the one place that writes a notification,
    // so a switch cannot be honoured on one path and ignored on another.
    const key = PREF_KEY[type]
    const wanted = members?.filter((m) => !key || m.notification_prefs?.[key] !== false) || []
    if (!wanted.length) return 0

    const { error } = await supabase.from('notifications').insert(
      wanted.map((m) => ({
        user_id: m.id,
        tenant_id: tenantId,
        type,
        payload: { title, message, ...meta },
      })),
    )
    // Read the error. Not reading it is why this was broken for so long.
    if (error) throw error
    return wanted.length
  } catch (err) {
    console.error('Failed to write notification:', err)
    return 0
  }
}

/**
 * The switches offered on /profile, and the notification types they silence.
 *
 * Only types the platform actually sends appear here. The page used to offer
 * "تغيّر تقييم شركة مراقَبة", which nothing has ever emitted — a switch for an
 * event that cannot happen is the same lie as a switch that does not save.
 *
 * A type absent from PREF_KEY cannot be switched off: welcome is the account's
 * first message and there is nowhere to have opted out of it yet.
 */
export const NOTIFICATION_PREFS = [
  { key: 'report_approved', label: 'اعتماد تقرير' },
  { key: 'report_rejected', label: 'رفض تقرير' },
  { key: 'report_request_info', label: 'طلب توضيح على تقرير' },
  { key: 'company_approved', label: 'قبول طلب إضافة شركة' },
  { key: 'credits_awarded', label: 'إضافة نقاط للرصيد' },
]

const PREF_KEY = {
  report_approved: 'report_approved',
  report_rejected: 'report_rejected',
  report_request_info: 'report_request_info',
  company_approved: 'company_approved',
  credits_awarded: 'credits_awarded',
}

/** The title and body of a notification, whatever shape it was stored in. */
export function notificationText(row) {
  const p = row?.payload || {}
  return {
    title: p.title || TYPE_TITLES[row?.type] || 'تحديث',
    message: p.message || '',
  }
}

const TYPE_TITLES = {
  report_approved: 'تم اعتماد تقريرك',
  report_rejected: 'تم رفض تقريرك',
  report_request_info: 'مطلوب توضيح على تقريرك',
  company_approved: 'تمت الموافقة على الشركة',
  credits_awarded: 'أُضيفت نقاط لرصيدك',
  welcome: 'أهلاً بك في مرصد',
}

export const NOTIFICATION_STYLE = {
  report_approved: { icon: '✓', color: '#15803D', bg: '#ECFDF5' },
  company_approved: { icon: '✓', color: '#15803D', bg: '#ECFDF5' },
  credits_awarded: { icon: '💎', color: '#1E2A52', bg: '#EEF2FF' },
  report_rejected: { icon: '✕', color: '#B91C1C', bg: '#FEF2F2' },
  report_request_info: { icon: '!', color: '#92400E', bg: '#FFFBEB' },
  welcome: { icon: '👋', color: '#1E40AF', bg: '#EEF2FF' },
}
