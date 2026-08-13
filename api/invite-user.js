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

// Dashboards, shells and copy-paste all add stray whitespace, and piping a
// value into a CLI on Windows can prepend a BOM. A key that differs from the
// real one by one invisible character fails as an authentication error, which
// sends you looking at permissions instead of the value. Normalise on read.
// نسخة محلية ثالثة من هذه الدالة نُسيت في trust-report-pdf فسقط وحده.
// المصدر الآن واحد.
import { clean } from './_lib/secrets.js'

const CLERK_SECRET = clean(process.env.CLERK_SECRET_KEY)
const SUPABASE_URL = clean(process.env.SUPABASE_URL) || clean(process.env.VITE_SUPABASE_URL)
const SUPABASE_KEY = clean(process.env.SUPABASE_SERVICE_ROLE_KEY) || clean(process.env.VITE_SUPABASE_ANON_KEY)

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
    const key = clean(pk)
    if (!key) return null
    const host = Buffer.from(key.replace(/^pk_(test|live)_/, ''), 'base64').toString('utf8').replace(/\$$/, '')
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

// The seat-limit trigger raises a plain exception, which reaches here as a
// message a company admin cannot act on. Name the actual constraint.
function seatMessage(err) {
  const raw = String(err?.message || '')
  if (/seat|مقعد|user limit|حدّ المستخدمين/i.test(raw)) {
    return 'بلغت شركتك حدّ المستخدمين في باقتها — رقّ الباقة أو أزل مستخدماً قبل الدعوة'
  }
  return raw || 'تعذّر تسجيل الدعوة'
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
      // The diagnostic goes to the server log, not the response. It named the
      // Clerk instance host, the token's issuer and the server's clock skew —
      // useful while wiring this up, and infrastructure detail handed to anyone
      // who sends a bad token once it is live.
      console.error('Invite rejected — token verification failed:', {
        reason: err?.reason || null, message: err?.message || null, token: t, expectedIssuer: expected,
      })
      return res.status(401).json({ error: `جلسة غير صالحة — ${parts.join(' · ')}` })
    }

    // 2) Validate input.
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
    const email = String(body.email || '').trim().toLowerCase()
    const role = String(body.role || 'company_member')
    const resend = body.resend === true
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'صيغة البريد الإلكتروني غير صحيحة' })
    if (!VALID_ROLES.includes(role)) return res.status(400).json({ error: 'دور غير صالح' })

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })

    // 3a) Inviting a COMPANY to take its own record — a different invitation
    //     with the same delivery. Marsad's registry is mostly bulk-imported, so
    //     most companies have never heard of their record and cannot be asked
    //     for documents until somebody holds it.
    //
    //     The database side is invite_company(): it creates the empty tenant,
    //     records the pending invite and refuses the cases that must not
    //     proceed. This endpoint exists only because Clerk's secret cannot go to
    //     the browser — so it authorizes, delegates, and sends the mail.
    const companyId = String(body.company_id || '').trim()
    if (companyId) {
      const { data: caller, error: callerErr } = await supabase
        .from('users').select('role').eq('id', callerId).single()
      if (callerErr || caller?.role !== 'platform_admin') {
        return res.status(403).json({ error: 'دعوة الشركات من صلاحيات إدارة مرصد' })
      }

      // Whether the tenant already existed decides what can be undone if the
      // mail fails. Read before, because invite_company may create it.
      const { data: priorTenant } = await supabase
        .from('tenants').select('id').eq('company_id', companyId).maybeSingle()

      // The identity does not travel with the call. This client holds the
      // service role key, which is a JWT with no subject, so inside the function
      // get_current_user_id() is null and is_platform_admin() is false — it
      // refused the one caller that had already proved who it was.
      //
      // So the administrator verified above is named explicitly, and the
      // function checks that name against the users table rather than trusting
      // this endpoint. Holding the service key is not enough to invite anyone.
      const { data: result, error: rpcErr } = await supabase.rpc('invite_company', {
        p_company_id: companyId,
        p_email: email,
        p_note: typeof body.note === 'string' ? body.note : null,
        p_actor_id: callerId,
      })
      if (rpcErr) return res.status(500).json({ error: rpcErr.message })
      // The function answers with its own refusal rather than throwing.
      if (!result?.ok) return res.status(409).json({ error: result?.reason || 'تعذّرت الدعوة' })

      const origin = process.env.APP_URL || `https://${req.headers.host}`
      await revokePendingClerkInvitations(email)
      const resp = await clerkApi('/invitations', {
        method: 'POST',
        body: JSON.stringify({
          email_address: email,
          public_metadata: { tenant_id: result.tenant_id, role: 'company_admin' },
          redirect_url: `${origin}/accept-invite`,
          notify: true,
          ignore_existing: true,
        }),
      })
      const data = await resp.json().catch(() => ({}))

      if (!resp.ok) {
        // Nothing may survive an invitation that was never delivered — least of
        // all an empty tenant, which would make the company read as claimed and
        // silently stop every queue that chases it.
        await supabase.from('pending_invites').delete().eq('id', result.invite_id)
        if (!priorTenant?.id) {
          await supabase.from('tenants').delete().eq('id', result.tenant_id)
        }
        const msg = data?.errors?.[0]?.long_message || data?.errors?.[0]?.message || 'تعذّر إرسال الدعوة'
        return res.status(502).json({ error: msg })
      }

      return res.status(200).json({
        emailSent: true, recorded: true, tenantId: result.tenant_id, email: result.email,
      })
    }

    // 3) Authorize: caller must be a company_admin, and we invite into HIS tenant.
    const { data: caller, error: callerErr } = await supabase
      .from('users').select('tenant_id, role').eq('id', callerId).single()
    if (callerErr || !caller?.tenant_id) return res.status(403).json({ error: 'لا يوجد حساب شركة مرتبط' })
    if (caller.role !== 'company_admin') return res.status(403).json({ error: 'الدعوة متاحة لمدير الشركة فقط' })
    const tenantId = caller.tenant_id

    // 4) An address that already belongs to a member is always a conflict. An
    //    outstanding invite is a conflict only when this is not a resend.
    //
    //    Matched in JavaScript rather than with .ilike(). PostgREST passes the
    //    pattern to SQL ILIKE, where % and _ are wildcards — and EMAIL_RE admits
    //    both, since [^\s@]+ does. An address of "%@example.com" matched every
    //    member at that domain and came back as "this email is already
    //    registered" for one that was not. A seat list is at most a plan's user
    //    limit, so comparing exactly costs nothing.
    const [{ data: members }, { data: invites }] = await Promise.all([
      supabase.from('users').select('id, email').eq('tenant_id', tenantId),
      supabase.from('pending_invites').select('id, email').eq('tenant_id', tenantId).eq('status', 'pending'),
    ])
    const sameAddress = (row) => String(row?.email || '').trim().toLowerCase() === email

    if ((members || []).some(sameAddress)) {
      return res.status(409).json({ error: 'هذا البريد مسجّل بالفعل ضمن مستخدمي الشركة' })
    }
    const existingInvite = (invites || []).find(sameAddress) || null
    if (existingInvite && !resend) {
      return res.status(409).json({ error: 'توجد دعوة معلّقة لهذا البريد بالفعل' })
    }
    if (resend && !existingInvite) {
      return res.status(404).json({ error: 'لا توجد دعوة معلّقة لإعادة إرسالها' })
    }

    // 5) Record the invite BEFORE Clerk sends anything.
    //
    //    The order used to be the other way round, and the seat-limit trigger
    //    added in 029 refuses this row once a plan's user limit is reached. So a
    //    company on the free plan — two seats — inviting a third person got the
    //    Clerk email sent, the row refused, and HTTP 200 with recorded:false.
    //    Someone received a real invitation to a company that had no room for
    //    them, and found out at sign-up.
    //
    //    Writing first means the trigger decides before anyone is told. The row
    //    is the reservation; the email is the notification of one that exists.
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString()
    let inviteId = existingInvite?.id || null

    if (existingInvite) {
      const { error: updErr } = await supabase
        .from('pending_invites')
        .update({ role, invited_by: callerId, expires_at: expiresAt })
        .eq('id', existingInvite.id)
      if (updErr) return res.status(409).json({ error: seatMessage(updErr) })
    } else {
      const { data: created, error: insErr } = await supabase
        .from('pending_invites')
        .insert([{
          tenant_id: tenantId,
          email,
          role,
          invited_by: callerId,
          status: 'pending',
          expires_at: expiresAt,
        }])
        .select('id')
      if (insErr) return res.status(409).json({ error: seatMessage(insErr) })
      // A row filtered out by RLS raises nothing and returns nothing. Without
      // this the email would go out for an invitation that was never recorded —
      // the same failure the reordering exists to prevent.
      if (!created?.length) {
        return res.status(403).json({ error: 'لم تُسجَّل الدعوة — تحقّق من صلاحيتك' })
      }
      inviteId = created[0].id
    }

    // 6) Now Clerk sends the email.
    if (resend) await revokePendingClerkInvitations(email)
    const origin = process.env.APP_URL || `https://${req.headers.host}`
    const clerkResp = await clerkApi('/invitations', {
      method: 'POST',
      body: JSON.stringify({
        email_address: email,
        public_metadata: { tenant_id: tenantId, role },
        // Must land on a page that renders <SignUp/>: Clerk appends
        // __clerk_ticket here and only that component can consume it. Pointing
        // this at /auth/callback left the ticket unread and the invitee signed
        // out. /accept-invite forces /auth/callback once sign-up completes.
        redirect_url: `${origin}/accept-invite`,
        notify: true,
        ignore_existing: true,
      }),
    })
    const clerkData = await clerkResp.json().catch(() => ({}))
    if (!clerkResp.ok) {
      // Release the seat this reserved. A first-time invite that never reached
      // anyone must not sit in the list holding a place; a resend keeps its row,
      // because that invitation is still outstanding from the earlier send.
      if (!existingInvite && inviteId) {
        await supabase.from('pending_invites').delete().eq('id', inviteId)
      }
      const msg = clerkData?.errors?.[0]?.long_message || clerkData?.errors?.[0]?.message || 'تعذّر إرسال دعوة Clerk'
      return res.status(502).json({ error: msg })
    }

    return res.status(200).json({ emailSent: true, recorded: true, resent: resend, clerkInvitationId: clerkData.id })
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'خطأ غير متوقع' })
  }
}
