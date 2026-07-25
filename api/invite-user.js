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
//
// Body: { email, role, resend? }
//  - resend=false (default): a still-pending invite for that email is a 409.
//  - resend=true: the existing invite row is refreshed (new expiry) and the
//    email goes out again. Clerk rejects a duplicate pending invitation, so we
//    revoke the old one first — see revokePendingClerkInvitations().

import { verifyToken } from '@clerk/backend'
import { createClient } from '@supabase/supabase-js'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const VALID_ROLES = ['company_member', 'company_admin']
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000

const CLERK_SECRET = process.env.CLERK_SECRET_KEY
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY

// A committed .env file does not reach a serverless function — only the host's
// environment settings do. Name the missing variables so the fix is obvious;
// never echo a value.
function missingEnvVars() {
  const missing = []
  if (!CLERK_SECRET) missing.push('CLERK_SECRET_KEY')
  if (!SUPABASE_URL) missing.push('SUPABASE_URL')
  if (!SUPABASE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY')
  return missing
}

// Step 3 reads another user's row to authorize the caller. Under RLS the anon
// key cannot see it, so the request would fail later with a confusing "no
// company linked". Fail here instead, naming the real cause.
const HAS_SERVICE_ROLE = !!process.env.SUPABASE_SERVICE_ROLE_KEY

// Diagnostics for a rejected token. Reads the payload WITHOUT verifying it —
// only ever used to explain a failure that already happened, never to trust
// anything. Returns claims that identify the issuer and timing, no user data.
function describeToken(token) {
  try {
    const [, payload] = String(token).split('.')
    if (!payload) return { malformed: true }
    const json = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    const now = Math.floor(Date.now() / 1000)
    return {
      iss: json.iss || null,
      azp: json.azp || null,
      exp: json.exp || null,
      expiredSecondsAgo: json.exp ? now - json.exp : null,
      serverClockSkewHint: json.iat ? now - json.iat : null,
    }
  } catch {
    return { malformed: true }
  }
}

// A Clerk publishable key base64-encodes its own instance host, so the expected
// issuer can be derived without another env var.
function issuerFromPublishableKey(pk) {
  try {
    if (!pk) return null
    const host = Buffer.from(pk.replace(/^pk_(test|live)_/, ''), 'base64').toString('utf8').replace(/\$$/, '')
    return `https://${host}`
  } catch {
    return null
  }
}

const clerkApi = (path, init = {}) =>
  fetch(`https://api.clerk.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${CLERK_SECRET}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })

// Clerk refuses to create a second pending invitation for the same address, so
// a resend must revoke whatever is outstanding first. Best-effort: if Clerk's
// list/revoke calls fail we still try the create below and surface its error.
async function revokePendingClerkInvitations(email) {
  try {
    const resp = await clerkApi(`/invitations?status=pending&query=${encodeURIComponent(email)}`)
    if (!resp.ok) return
    const body = await resp.json().catch(() => null)
    const list = Array.isArray(body) ? body : body?.data
    if (!Array.isArray(list)) return
    await Promise.all(
      list
        .filter((inv) => String(inv?.email_address || '').toLowerCase() === email)
        .map((inv) => clerkApi(`/invitations/${inv.id}/revoke`, { method: 'POST' })),
    )
  } catch {
    // Non-fatal — the create call below reports the real problem.
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const missing = missingEnvVars()
  if (missing.length) {
    return res.status(500).json({
      error: `الخادم غير مُهيّأ — أضف هذه المتغيرات في إعدادات البيئة على Vercel: ${missing.join('، ')}`,
      missingEnvVars: missing,
    })
  }
  if (!HAS_SERVICE_ROLE) {
    return res.status(500).json({
      error: 'الخادم يستخدم مفتاح anon — الدعوة تحتاج SUPABASE_SERVICE_ROLE_KEY لتجاوز RLS عند التحقق من صلاحية المدير',
      missingEnvVars: ['SUPABASE_SERVICE_ROLE_KEY'],
    })
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
    } catch (err) {
      // Swallowing this made every rejection look identical. Clerk's reason is
      // safe to pass on — it names the check that failed, never a key. The
      // unverified claims say which instance minted the token, which is what
      // separates "expired" from "signed by a different Clerk instance"; both
      // reach this line and they need opposite fixes.
      const t = describeToken(token)
      const expected = issuerFromPublishableKey(process.env.VITE_CLERK_PUBLISHABLE_KEY)
      const parts = [err?.reason || err?.message || 'سبب غير معروف']
      if (t.malformed) parts.push('التوكن غير صالح البنية')
      if (t.iss) parts.push(`المُصدِر ${t.iss}`)
      if (expected && t.iss && expected !== t.iss) parts.push(`لكن المتوقع ${expected}`)
      if (typeof t.expiredSecondsAgo === 'number' && t.expiredSecondsAgo > 0) {
        parts.push(`منتهٍ منذ ${t.expiredSecondsAgo} ثانية`)
      }
      return res.status(401).json({
        error: `جلسة غير صالحة — ${parts.join(' · ')}`,
        detail: { reason: err?.reason || null, message: err?.message || null, token: t, expectedIssuer: expected },
      })
    }

    // 2) Validate input.
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
    const email = String(body.email || '').trim().toLowerCase()
    const role = String(body.role || 'company_member')
    const resend = body.resend === true
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'صيغة البريد الإلكتروني غير صحيحة' })
    if (!VALID_ROLES.includes(role)) return res.status(400).json({ error: 'دور غير صالح' })

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })

    // 3) Authorize: caller must be a company_admin, and we invite into HIS tenant.
    const { data: caller, error: callerErr } = await supabase
      .from('users').select('tenant_id, role').eq('id', callerId).single()
    if (callerErr || !caller?.tenant_id) return res.status(403).json({ error: 'لا يوجد حساب شركة مرتبط' })
    if (caller.role !== 'company_admin') return res.status(403).json({ error: 'الدعوة متاحة لمدير الشركة فقط' })
    const tenantId = caller.tenant_id

    // 4) An address that already belongs to a member is always a conflict. An
    //    outstanding invite is a conflict only when this is not a resend.
    const { data: existingUser } = await supabase
      .from('users').select('id').eq('tenant_id', tenantId).ilike('email', email).maybeSingle()
    if (existingUser) return res.status(409).json({ error: 'هذا البريد مسجّل بالفعل ضمن مستخدمي الشركة' })
    const { data: existingInvite } = await supabase
      .from('pending_invites').select('id').eq('tenant_id', tenantId).ilike('email', email).eq('status', 'pending').maybeSingle()
    if (existingInvite && !resend) {
      return res.status(409).json({ error: 'توجد دعوة معلّقة لهذا البريد بالفعل' })
    }
    if (resend && !existingInvite) {
      return res.status(404).json({ error: 'لا توجد دعوة معلّقة لإعادة إرسالها' })
    }

    // 5) Create the Clerk invitation — Clerk sends the email.
    if (resend) await revokePendingClerkInvitations(email)
    const origin = process.env.APP_URL || `https://${req.headers.host}`
    const clerkResp = await clerkApi('/invitations', {
      method: 'POST',
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

    // 6) Record the invite (source of truth for the UI list). A resend refreshes
    //    the existing row — role and expiry — instead of adding a second one.
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString()
    const { error: writeErr } = existingInvite
      ? await supabase
          .from('pending_invites')
          .update({ role, invited_by: callerId, expires_at: expiresAt })
          .eq('id', existingInvite.id)
      : await supabase.from('pending_invites').insert([{
          tenant_id: tenantId,
          email,
          role,
          invited_by: callerId,
          status: 'pending',
          expires_at: expiresAt,
        }])
    if (writeErr) {
      // Email already went out; surface a soft warning rather than a hard fail.
      return res.status(200).json({ emailSent: true, recorded: false, resent: resend, warning: writeErr.message })
    }

    return res.status(200).json({ emailSent: true, recorded: true, resent: resend, clerkInvitationId: clerkData.id })
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'خطأ غير متوقع' })
  }
}
