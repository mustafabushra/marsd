// Vercel serverless function: POST /api/award-credits
//
// The only writer to credits_ledger. RLS restricts inserts to service_role for
// a reason that cannot be worked around in the browser: the balance decides
// what a plan allows, so it must not be writable by the party it benefits. Any
// client-side rule permissive enough to credit a member for their contribution
// is permissive enough for that member to choose the amount.
//
// Everything that decides the outcome is read here, server-side: whether the
// tenant's plan earns at all, what the action is worth, and how much of the
// monthly ceiling is left. The caller sends an action name and nothing else
// that matters.
//
// Body: { action, reportId?, tenantId? }
//   tenantId is the approval case — an administrator crediting the company that
//   filed a report. It requires platform_admin; without it the award goes to the
//   caller's own tenant.

import { verifyToken } from '@clerk/backend'
import { createClient } from '@supabase/supabase-js'

const clean = (v) => (typeof v === 'string' ? v.replace(/^﻿/, '').trim() : v) || undefined

const CLERK_SECRET = clean(process.env.CLERK_SECRET_KEY)
const SUPABASE_URL = clean(process.env.SUPABASE_URL) || clean(process.env.VITE_SUPABASE_URL)
const SERVICE_KEY = clean(process.env.SUPABASE_SERVICE_ROLE_KEY)

// Reasons the ledger's CHECK constraint accepts as earnings. Kept here as well
// so an unknown action is refused before it reaches the database, with a message
// that says which one was wrong.
const EARN_ACTIONS = ['company_added', 'company_completed', 'documents_uploaded', 'report_approved']

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  if (!CLERK_SECRET || !SUPABASE_URL || !SERVICE_KEY) {
    const missing = [
      !CLERK_SECRET && 'CLERK_SECRET_KEY',
      !SUPABASE_URL && 'SUPABASE_URL',
      !SERVICE_KEY && 'SUPABASE_SERVICE_ROLE_KEY',
    ].filter(Boolean)
    return res.status(500).json({ error: `الخادم غير مُهيّأ — ناقص: ${missing.join('، ')}`, missingEnvVars: missing })
  }

  try {
    // 1) Who is asking.
    const authz = req.headers.authorization || ''
    const token = authz.startsWith('Bearer ') ? authz.slice(7) : null
    if (!token) return res.status(401).json({ error: 'غير مصرّح' })

    let callerId
    try {
      callerId = (await verifyToken(token, { secretKey: CLERK_SECRET })).sub
    } catch (err) {
      return res.status(401).json({ error: `جلسة غير صالحة: ${err?.reason || err?.message || 'سبب غير معروف'}` })
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
    const action = String(body.action || '')
    if (!EARN_ACTIONS.includes(action)) {
      return res.status(400).json({ error: `إجراء غير معروف: ${action || '—'}` })
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

    // 2) Whose balance. Crediting another company is an administrator action,
    //    so it is checked against the database rather than taken on trust from
    //    the request.
    const { data: caller } = await supabase
      .from('users').select('tenant_id, role').eq('id', callerId).maybeSingle()
    if (!caller) return res.status(403).json({ error: 'لا يوجد حساب مرتبط' })

    let tenantId = caller.tenant_id
    if (body.tenantId && body.tenantId !== caller.tenant_id) {
      if (caller.role !== 'platform_admin') {
        return res.status(403).json({ error: 'منح رصيد لكيان آخر متاح لإدارة المنصة فقط' })
      }
      tenantId = body.tenantId
    }
    if (!tenantId) return res.status(403).json({ error: 'لا يوجد كيان مرتبط' })

    // 3) Does this tenant's plan earn, and what is the action worth.
    const [{ data: sub }, { data: setting }] = await Promise.all([
      supabase.from('subscriptions').select('plans(give_to_get_enabled)').eq('tenant_id', tenantId).maybeSingle(),
      supabase.from('system_settings').select('value').eq('key', 'give_to_get_rules').maybeSingle(),
    ])

    if (!sub?.plans?.give_to_get_enabled) {
      return res.status(200).json({ awarded: 0, reason: 'الباقة لا تكسب بالمساهمة' })
    }

    const rules = setting?.value || {}
    const points = Number(rules.earn?.[action]?.points) || 0
    if (points <= 0) return res.status(200).json({ awarded: 0, reason: 'لا نقاط لهذا الإجراء' })

    // 4) Monthly ceiling. Contribution is unlimited; what it converts into is
    //    not, or filing enough reports would turn the free plan into an
    //    unlimited one. Positive rows only — spending must not create room to
    //    earn again.
    const cap = Number(rules.monthly_earn_cap) || 0
    let grant = points
    if (cap > 0) {
      const monthStart = new Date()
      monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0)

      const { data: earnedRows, error: capErr } = await supabase
        .from('credits_ledger').select('amount')
        .eq('tenant_id', tenantId).gt('amount', 0)
        .gte('created_at', monthStart.toISOString())
      // A failed count must not silently uncap the month.
      if (capErr) return res.status(200).json({ awarded: 0, reason: 'تعذّر التحقق من سقف الشهر' })

      const earned = (earnedRows || []).reduce((s, r) => s + (Number(r.amount) || 0), 0)
      grant = Math.max(0, Math.min(points, cap - earned))
      if (grant <= 0) {
        return res.status(200).json({ awarded: 0, reason: `بلغت شركتك سقف الكسب الشهري (${cap} نقطة)`, capReached: true })
      }
    }

    // 5) Write it. The unique index on (report_id, reason) refuses a second
    //    award for the same report, which matters because approval gets
    //    repeated — a double click, a reopened review, a status corrected back.
    const { error: insErr } = await supabase.from('credits_ledger').insert([{
      tenant_id: tenantId,
      report_id: body.reportId || null,
      user_id: callerId,
      amount: grant,
      reason: action,
    }])

    if (insErr) {
      if (insErr.code === '23505') return res.status(200).json({ awarded: 0, reason: 'سبق منح النقاط لهذا التقرير' })
      throw insErr
    }

    return res.status(200).json({ awarded: grant, partial: grant < points })
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'خطأ غير متوقع' })
  }
}
