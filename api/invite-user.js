// Vercel serverless function: POST /api/invite-user
//
// Sends a real Clerk invitation email to a prospective company user and records
// a pending_invites row. The Clerk secret key never touches the browser — it is
// read here from a server-only env var.
//
// Auth model (Clerk, text ids):
//  - Caller sends their Clerk session token as `Authorization: Bearer <token>`.
//  - We verify it, then confirm in Supabase that the caller is a company_admin
//    of the target tenant before inviting anyone.
//
// The invited role/tenant are carried in the invitation's public_metadata and
// consumed on sign-up by /auth/callback (which attaches the new user to the
// tenant). See src/pages/AuthCallback.jsx.

import { verifyToken } from '@clerk/backend'
import { createClient } from '@supabase/supabase-js'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const VALID_ROLES = ['company_member', 'company_admin']

const CLERK_SECRET = process.env.CLERK_SECRET_KEY
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (!CLERK_SECRET || !SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: 'الخادم غير مُهيّأ: مفاتيح البيئة ناقصة' })
  }

  try {
    // 1) Verify the caller's Clerk session token.
    const authz = req.headers.authorization || ''
    const token = authz.startsWith('Bearer ') ? authz.slice(7) : null
    if (!token) return res.status(401).json({ error: 'غير مصرّح' })

    let callerId
    try {
      const claims = await verifyToken(token, { secretKey: CLERK_SECRET })
      callerId = claims.sub
    } catch {
      return res.status(401).json({ error: 'جلسة غير صالحة' })
    }

    // 2) Validate input.
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
    const email = String(body.email || '').trim().toLowerCase()
    const role = String(body.role || 'company_member')
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'صيغة البريد الإلكتروني غير صحيحة' })
    if (!VALID_ROLES.includes(role)) return res.status(400).json({ error: 'دور غير صالح' })

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })

    // 3) Authorize: caller must be a company_admin, and we invite into HIS tenant.
    const { data: caller, error: callerErr } = await supabase
      .from('users').select('tenant_id, role').eq('id', callerId).single()
    if (callerErr || !caller?.tenant_id) return res.status(403).json({ error: 'لا يوجد حساب شركة مرتبط' })
    if (caller.role !== 'company_admin') return res.status(403).json({ error: 'الدعوة متاحة لمدير الشركة فقط' })
    const tenantId = caller.tenant_id

    // 4) Reject duplicates (existing member or already-pending invite in tenant).
    const { data: existingUser } = await supabase
      .from('users').select('id').eq('tenant_id', tenantId).ilike('email', email).maybeSingle()
    if (existingUser) return res.status(409).json({ error: 'هذا البريد مسجّل بالفعل ضمن مستخدمي الشركة' })
    const { data: existingInvite } = await supabase
      .from('pending_invites').select('id').eq('tenant_id', tenantId).ilike('email', email).eq('status', 'pending').maybeSingle()
    if (existingInvite) return res.status(409).json({ error: 'توجد دعوة معلّقة لهذا البريد بالفعل' })

    // 5) Create the Clerk invitation — Clerk sends the email.
    const origin = process.env.APP_URL || `https://${req.headers.host}`
    const clerkResp = await fetch('https://api.clerk.com/v1/invitations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${CLERK_SECRET}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email_address: email,
        public_metadata: { tenant_id: tenantId, role },
        redirect_url: `${origin}/auth/callback`,
        notify: true,
        ignore_existing: true,
      }),
    })
    const clerkData = await clerkResp.json().catch(() => ({}))
    if (!clerkResp.ok) {
      const msg = clerkData?.errors?.[0]?.long_message || clerkData?.errors?.[0]?.message || 'تعذّر إرسال دعوة Clerk'
      return res.status(502).json({ error: msg })
    }

    // 6) Record the pending invite (source of truth for the UI list).
    const { error: insErr } = await supabase.from('pending_invites').insert([{
      tenant_id: tenantId,
      email,
      role,
      invited_by: callerId,
      status: 'pending',
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    }])
    if (insErr) {
      // Email already went out; surface a soft warning rather than a hard fail.
      return res.status(200).json({ emailSent: true, recorded: false, warning: insErr.message })
    }

    return res.status(200).json({ emailSent: true, recorded: true, clerkInvitationId: clerkData.id })
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'خطأ غير متوقع' })
  }
}
