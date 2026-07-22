/**
 * API Client — يربط React مع Supabase مباشرة
 * Real-time database access with Row-Level Security
 * Authentication: Clerk (for user login/signup)
 * Database: Supabase (PostgreSQL with RLS)
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'

let supabaseClient: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (!supabaseClient) {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Supabase configuration missing')
    }

    supabaseClient = createClient(supabaseUrl, supabaseAnonKey)
  }

  return supabaseClient
}

// ============================================================================
// TOKEN MANAGEMENT
// ============================================================================

const TOKEN_KEY = 'accessToken'
const REFRESH_TOKEN_KEY = 'refreshToken'
const USER_KEY = 'user'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function setRefreshToken(token: string): void {
  localStorage.setItem(REFRESH_TOKEN_KEY, token)
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY)
}

export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

export function setUser(user: Record<string, any>): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function getUser(): Record<string, any> | null {
  try {
    const userStr = localStorage.getItem(USER_KEY)
    return userStr ? JSON.parse(userStr) : null
  } catch {
    return null
  }
}

// ============================================================================
// AUTH API
// ============================================================================

export async function login(email: string, password: string) {
  const supabase = getSupabase()

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    throw new Error(error.message || 'فشل تسجيل الدخول')
  }

  if (!data.session || !data.user) {
    throw new Error('فشل تسجيل الدخول: لم يتم الحصول على جلسة')
  }

  // Wait a moment for trigger to create user profile
  await new Promise(resolve => setTimeout(resolve, 500))

  // Fetch user profile from public.users
  const { data: userData, error: userError } = await supabase
    .from('users')
    .select('id, email, first_name, last_name, role, tenant_id, status')
    .eq('id', data.user.id)
    .single()

  if (userError || !userData) {
    // Create minimal user profile if not found (fallback)
    await supabase
      .from('users')
      .upsert([
        {
          id: data.user.id,
          email: data.user.email,
          role: 'company_member',
          status: 'active',
        },
      ])
      .select()
      .single()

    throw new Error('User profile being created, please login again')
  }

  const user = {
    id: userData.id,
    email: userData.email,
    firstName: userData.first_name || '',
    lastName: userData.last_name || '',
    role: userData.role || 'company_member',
    tenantId: userData.tenant_id,
    status: userData.status,
  }

  setToken(data.session.access_token)
  if (data.session.refresh_token) {
    setRefreshToken(data.session.refresh_token)
  }
  setUser(user)

  return {
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    user,
  }
}

export async function register(data: any) {
  const supabase = getSupabase()

  // 1. Create auth user
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: data.email,
    password: data.password,
  })

  if (authError) {
    console.error('Auth signup error:', authError)
    throw new Error(authError.message || 'فشل إنشاء الحساب')
  }

  if (!authData.user) {
    throw new Error('فشل إنشاء المستخدم')
  }

  console.log('Auth user created:', authData.user.id)

  try {
    // 2. Create tenant record
    const tenantPayload = {
      name: data.companyName || data.name,
      cr_number: data.crNumber || 'temp-' + Date.now(),
      email: data.email,
      phone: data.phone || '',
      city: data.city || '',
      sector: data.sector || '',
      status: 'active',
    }

    console.log('Creating tenant with payload:', tenantPayload)

    const { data: tenantData, error: tenantError } = await supabase
      .from('tenants')
      .insert([tenantPayload])
      .select()
      .single()

    if (tenantError || !tenantData) {
      console.error('Tenant creation error:', tenantError)
      throw new Error('فشل إنشاء الشركة: ' + tenantError?.message)
    }

    console.log('Tenant created:', tenantData.id)

    // 3. Update user record with tenant_id (trigger creates basic user, we update it)
    await new Promise(resolve => setTimeout(resolve, 300))

    const { data: userData, error: userError } = await supabase
      .from('users')
      .update({
        tenant_id: tenantData.id,
        first_name: data.firstName || '',
        last_name: data.lastName || '',
        role: 'company_admin',
      })
      .eq('id', authData.user.id)
      .select()
      .single()

    if (userError) {
      console.error('User update error:', userError)
      throw new Error('فشل تحديث ملف المستخدم: ' + userError.message)
    }

    console.log('User updated:', userData.id)

    // 4. Create default subscription (Free plan)
    const { data: plansData } = await supabase
      .from('plans')
      .select('id')
      .eq('name', 'مجاني')
      .limit(1)

    if (plansData && plansData.length > 0) {
      const futureDate = new Date()
      futureDate.setDate(futureDate.getDate() + 30)

      await supabase
        .from('subscriptions')
        .insert([
          {
            tenant_id: tenantData.id,
            plan_id: plansData[0].id,
            status: 'active',
            current_period_start: new Date().toISOString(),
            current_period_end: futureDate.toISOString(),
          },
        ])
    }

    const user = {
      id: userData.id,
      email: userData.email,
      firstName: userData.first_name || '',
      lastName: userData.last_name || '',
      role: userData.role,
      tenantId: userData.tenant_id,
    }

    if (authData.session) {
      setToken(authData.session.access_token)
      if (authData.session.refresh_token) {
        setRefreshToken(authData.session.refresh_token)
      }
    }
    setUser(user)

    return {
      accessToken: authData.session?.access_token || '',
      refreshToken: authData.session?.refresh_token || '',
      user,
    }
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : 'خطأ في إنشاء الحساب')
  }
}

export async function logout() {
  const supabase = getSupabase()
  await supabase.auth.signOut()
  clearAuth()
}

// ============================================================================
// COMPANIES API
// ============================================================================

export async function searchCompanies(q: string, page = 1, limit = 20) {
  const supabase = getSupabase()

  const offset = (page - 1) * limit

  // Search companies with trust scores
  const { data: companies, count, error } = await supabase
    .from('companies')
    .select(`
      *,
      trust_scores(*)
    `, { count: 'exact' })
    .ilike('name', `%${q}%`)
    .or(`cr_number.ilike.%${q}%,sector.ilike.%${q}%`)
    .range(offset, offset + limit - 1)

  if (error) {
    throw new Error('Search failed: ' + error.message)
  }

  return {
    data: companies?.map(c => ({
      ...c,
      trust_score: c.trust_scores?.[0] || null,
    })) || [],
    pagination: {
      page,
      limit,
      total: count || 0,
      pages: Math.ceil((count || 0) / limit),
    },
  }
}

export async function getCompanyReport(companyId: string) {
  const supabase = getSupabase()

  // Get company + trust score + approved reports count
  const { data: company, error: companyError } = await supabase
    .from('companies')
    .select(`
      *,
      trust_scores(score, risk_band, tier, approved_reports, breakdown)
    `)
    .eq('id', companyId)
    .single()

  if (companyError) {
    throw new Error('Company not found')
  }

  const { data: userData } = await supabase
    .from('users')
    .select('tenant_id')
    .eq('id', (await supabase.auth.getUser()).data.user?.id)
    .single()

  // Get user's subscription
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('plan_id')
    .eq('tenant_id', userData?.tenant_id)
    .single()

  // Get plan details
  const { data: plan } = await supabase
    .from('plans')
    .select('name, limits')
    .eq('id', subscription?.plan_id)
    .single()

  const trustScore = company.trust_scores?.[0]
  const planName = plan?.name || 'مجاني'

  // Gating logic based on plan
  if (planName === 'مجاني') {
    return {
      company,
      status: 'limited',
      tier: trustScore?.tier || 'none',
      score: null,
      message: 'المؤشر محدود في الباقة المجانية',
    }
  }

  return {
    company,
    status: 'full',
    tier: trustScore?.tier || 'none',
    score: trustScore?.score || 0,
    riskBand: trustScore?.risk_band || 'high',
    approvedReports: trustScore?.approved_reports || 0,
  }
}

// ============================================================================
// REPORTS API
// ============================================================================

export async function submitReport(reportData: any) {
  const supabase = getSupabase()
  const user = await supabase.auth.getUser()

  if (!user.data.user) {
    throw new Error('Unauthorized')
  }

  // Get user's tenant
  const { data: userData } = await supabase
    .from('users')
    .select('tenant_id')
    .eq('id', user.data.user.id)
    .single()

  // Check BR-05: Prevent duplicate reports within 90 days
  const ninetyDaysAgo = new Date()
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

  const { data: existingReport } = await supabase
    .from('reports')
    .select('id')
    .eq('reporter_tenant_id', userData?.tenant_id)
    .eq('target_company_id', reportData.targetCompanyId)
    .gte('created_at', ninetyDaysAgo.toISOString())
    .limit(1)

  if (existingReport && existingReport.length > 0) {
    throw new Error('لا يمكن رفع تقريرين عن نفس الشركة خلال 90 يوماً (BR-05)')
  }

  // Check credits balance
  const { data: creditBalance } = await supabase
    .rpc('get_credit_balance', { p_tenant_id: userData?.tenant_id })

  if ((creditBalance || 0) < 1) {
    throw new Error('رصيد كافي غير متوفر')
  }

  // Insert report
  const { data: report, error } = await supabase
    .from('reports')
    .insert([
      {
        reporter_tenant_id: userData?.tenant_id,
        target_company_id: reportData.targetCompanyId,
        status: 'pending_review',
        deal_amount_range: reportData.dealAmountRange,
        payment_commitment: reportData.paymentCommitment,
        delay_days: reportData.delayDays || 0,
        defaulted: reportData.defaulted || false,
        dealt_at: reportData.dealtAt || new Date().toISOString(),
        submitted_at: new Date().toISOString(),
      },
    ])
    .select()
    .single()

  if (error) {
    throw new Error('Failed to submit report: ' + error.message)
  }

  // Deduct credits immediately
  await supabase
    .from('credits_ledger')
    .insert([
      {
        tenant_id: userData?.tenant_id,
        report_id: report.id,
        amount: -1,
        reason: 'report_approved',
      },
    ])

  return report
}

export async function getMyReports(page = 1, limit = 10) {
  const supabase = getSupabase()
  const user = await supabase.auth.getUser()

  if (!user.data.user) {
    throw new Error('Unauthorized')
  }

  const { data: userData } = await supabase
    .from('users')
    .select('tenant_id')
    .eq('id', user.data.user.id)
    .single()

  const offset = (page - 1) * limit

  const { data: reports, count, error } = await supabase
    .from('reports')
    .select(`
      *,
      target_company:companies(id, name, cr_number, sector),
      review_actions(*)
    `, { count: 'exact' })
    .eq('reporter_tenant_id', userData?.tenant_id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) {
    throw new Error('Failed to fetch reports: ' + error.message)
  }

  return {
    data: reports || [],
    pagination: {
      page,
      limit,
      total: count || 0,
      pages: Math.ceil((count || 0) / limit),
    },
  }
}

// ============================================================================
// WATCHLIST API
// ============================================================================

export async function addToWatchlist(companyId: string) {
  const supabase = getSupabase()
  const user = await supabase.auth.getUser()

  const { data: userData } = await supabase
    .from('users')
    .select('tenant_id')
    .eq('id', user.data.user?.id)
    .single()

  const { error } = await supabase
    .from('watchlist_items')
    .insert([
      {
        tenant_id: userData?.tenant_id,
        company_id: companyId,
        created_by: user.data.user?.id,
      },
    ])

  if (error) {
    if (error.code === '23505') {
      throw new Error('Already in watchlist')
    }
    throw new Error('Failed to add to watchlist: ' + error.message)
  }

  return { success: true }
}

export async function removeFromWatchlist(companyId: string) {
  const supabase = getSupabase()
  const user = await supabase.auth.getUser()

  const { data: userData } = await supabase
    .from('users')
    .select('tenant_id')
    .eq('id', user.data.user?.id)
    .single()

  const { error } = await supabase
    .from('watchlist_items')
    .delete()
    .eq('tenant_id', userData?.tenant_id)
    .eq('company_id', companyId)

  if (error) {
    throw new Error('Failed to remove from watchlist: ' + error.message)
  }

  return { success: true }
}

export async function getWatchlist(page = 1, limit = 20) {
  const supabase = getSupabase()
  const user = await supabase.auth.getUser()

  const { data: userData } = await supabase
    .from('users')
    .select('tenant_id')
    .eq('id', user.data.user?.id)
    .single()

  const offset = (page - 1) * limit

  const { data: watchlist, count, error } = await supabase
    .from('watchlist_items')
    .select(`
      *,
      company:companies(
        *,
        trust_scores(*)
      )
    `, { count: 'exact' })
    .eq('tenant_id', userData?.tenant_id)
    .range(offset, offset + limit - 1)

  if (error) {
    throw new Error('Failed to fetch watchlist: ' + error.message)
  }

  return {
    data: watchlist?.map(w => ({
      id: w.id,
      ...w.company,
      trust_score: w.company?.trust_scores?.[0] || null,
    })) || [],
    pagination: {
      page,
      limit,
      total: count || 0,
      pages: Math.ceil((count || 0) / limit),
    },
  }
}

// ============================================================================
// NOTIFICATIONS API
// ============================================================================

export async function listNotifications(page = 1, limit = 20) {
  const supabase = getSupabase()
  const user = await supabase.auth.getUser()

  if (!user.data.user) {
    throw new Error('Unauthorized')
  }

  const offset = (page - 1) * limit

  const { data: notifications, count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact' })
    .eq('user_id', user.data.user.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) {
    throw new Error('Failed to fetch notifications: ' + error.message)
  }

  return {
    data: notifications || [],
    pagination: {
      page,
      limit,
      total: count || 0,
      pages: Math.ceil((count || 0) / limit),
    },
  }
}

export async function markNotificationRead(notificationId: string) {
  const supabase = getSupabase()

  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId)

  if (error) {
    throw new Error('Failed to mark notification: ' + error.message)
  }

  return { success: true }
}

// ============================================================================
// BUSINESS REQUESTS API
// ============================================================================

export async function listBusinessRequests() {
  const supabase = getSupabase()
  const user = await supabase.auth.getUser()

  const { data: userData } = await supabase
    .from('users')
    .select('tenant_id')
    .eq('id', user.data.user?.id)
    .single()

  const { data: requests, error } = await supabase
    .from('business_requests')
    .select(`
      *,
      from_tenant:tenants!business_requests_from_tenant_id_fkey(id, name),
      to_tenant:tenants!business_requests_to_tenant_id_fkey(id, name)
    `)
    .or(`from_tenant_id.eq.${userData?.tenant_id},to_tenant_id.eq.${userData?.tenant_id}`)

  if (error) {
    throw new Error('Failed to fetch requests: ' + error.message)
  }

  return { data: requests || [] }
}

export async function createBusinessRequest(toTenantId: string, subject: string, body: string) {
  const supabase = getSupabase()
  const user = await supabase.auth.getUser()

  const { data: userData } = await supabase
    .from('users')
    .select('tenant_id')
    .eq('id', user.data.user?.id)
    .single()

  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 30)

  const { error } = await supabase
    .from('business_requests')
    .insert([
      {
        from_tenant_id: userData?.tenant_id,
        to_tenant_id: toTenantId,
        subject,
        body,
        status: 'pending',
        expires_at: expiresAt.toISOString(),
      },
    ])

  if (error) {
    throw new Error('Failed to create request: ' + error.message)
  }

  return { success: true }
}

export async function respondToBusinessRequest(requestId: string, accept: boolean) {
  const supabase = getSupabase()

  const { error } = await supabase
    .from('business_requests')
    .update({ status: accept ? 'accepted' : 'rejected' })
    .eq('id', requestId)

  if (error) {
    throw new Error('Failed to respond: ' + error.message)
  }

  return { success: true }
}

// ============================================================================
// ADMIN API
// ============================================================================

export async function getAdminDashboard() {
  const supabase = getSupabase()

  const { data: tenants } = await supabase.from('tenants').select('*', { count: 'exact' })
  const { data: reports } = await supabase.from('reports').select('status', { count: 'exact' })
  const { data: users } = await supabase.from('users').select('*', { count: 'exact' })

  return {
    totalCompanies: (await supabase.from('companies').select('*', { count: 'exact' })).count || 0,
    totalTenants: tenants?.length || 0,
    totalUsers: users?.length || 0,
    pendingReports: reports?.filter(r => r.status === 'pending_review').length || 0,
    approvedReports: reports?.filter(r => r.status === 'approved').length || 0,
  }
}

export async function getAdminRequests(page = 1, limit = 20) {
  const supabase = getSupabase()
  const offset = (page - 1) * limit

  const { data: requests, count, error } = await supabase
    .from('business_requests')
    .select(`
      *,
      from_tenant:tenants!business_requests_from_tenant_id_fkey(id, name),
      to_tenant:tenants!business_requests_to_tenant_id_fkey(id, name)
    `, { count: 'exact' })
    .range(offset, offset + limit - 1)

  if (error) throw new Error('Failed to fetch requests: ' + error.message)

  return {
    data: requests || [],
    pagination: { page, limit, total: count || 0, pages: Math.ceil((count || 0) / limit) },
  }
}

export async function getAdminReports(page = 1, limit = 20) {
  return listAdminReports(page, limit)
}

export async function getAdminCompanies(page = 1, limit = 20) {
  const supabase = getSupabase()
  const offset = (page - 1) * limit

  const { data: companies, count, error } = await supabase
    .from('companies')
    .select(`
      *,
      trust_scores(*)
    `, { count: 'exact' })
    .range(offset, offset + limit - 1)

  if (error) throw new Error('Failed to fetch companies: ' + error.message)

  return {
    data: companies?.map(c => ({ ...c, trust_score: c.trust_scores?.[0] || null })) || [],
    pagination: { page, limit, total: count || 0, pages: Math.ceil((count || 0) / limit) },
  }
}

export async function approveCompany(companyId: string) {
  const supabase = getSupabase()

  const { error } = await supabase
    .from('companies')
    .update({ approved: true })
    .eq('id', companyId)

  if (error) throw new Error('Failed to approve: ' + error.message)

  return { success: true }
}

export async function getAdminUsers(page = 1, limit = 20) {
  const supabase = getSupabase()
  const offset = (page - 1) * limit

  const { data: users, count, error } = await supabase
    .from('users')
    .select('*', { count: 'exact' })
    .range(offset, offset + limit - 1)

  if (error) throw new Error('Failed to fetch users: ' + error.message)

  return {
    data: users || [],
    pagination: { page, limit, total: count || 0, pages: Math.ceil((count || 0) / limit) },
  }
}

export async function getAuditLogs(page = 1, limit = 20) {
  const supabase = getSupabase()
  const offset = (page - 1) * limit

  const { data: logs, count, error } = await supabase
    .from('audit_logs')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) throw new Error('Failed to fetch logs: ' + error.message)

  return {
    data: logs || [],
    pagination: { page, limit, total: count || 0, pages: Math.ceil((count || 0) / limit) },
  }
}

export async function listAdminReports(page = 1, limit = 20) {
  const supabase = getSupabase()

  const offset = (page - 1) * limit

  const { data: reports, count, error } = await supabase
    .from('reports')
    .select(`
      *,
      target_company:companies(id, name, cr_number),
      review_actions(*)
    `, { count: 'exact' })
    .range(offset, offset + limit - 1)

  if (error) {
    throw new Error('Failed to fetch reports: ' + error.message)
  }

  return {
    data: reports || [],
    pagination: { page, limit, total: count || 0, pages: Math.ceil((count || 0) / limit) },
  }
}

export async function approveReport(reportId: string) {
  const supabase = getSupabase()
  const user = await supabase.auth.getUser()

  const { error } = await supabase
    .from('reports')
    .update({ status: 'approved', approved_at: new Date().toISOString() })
    .eq('id', reportId)

  if (error) {
    throw new Error('Failed to approve: ' + error.message)
  }

  await supabase
    .from('review_actions')
    .insert([
      {
        report_id: reportId,
        reviewer_id: user.data.user?.id,
        action: 'approved',
      },
    ])

  return { success: true }
}

export async function rejectReport(reportId: string, reason: string) {
  const supabase = getSupabase()
  const user = await supabase.auth.getUser()

  const { error } = await supabase
    .from('reports')
    .update({ status: 'rejected', rejected_at: new Date().toISOString() })
    .eq('id', reportId)

  if (error) {
    throw new Error('Failed to reject: ' + error.message)
  }

  await supabase
    .from('review_actions')
    .insert([
      {
        report_id: reportId,
        reviewer_id: user.data.user?.id,
        action: 'rejected',
        reason,
      },
    ])

  return { success: true }
}

// ============================================================================
// COMPANY USERS API
// ============================================================================

export async function listCompanyUsers() {
  const supabase = getSupabase()
  const user = await supabase.auth.getUser()

  const { data: userData } = await supabase
    .from('users')
    .select('tenant_id')
    .eq('id', user.data.user?.id)
    .single()

  const { data: users, error } = await supabase
    .from('users')
    .select('id, email, first_name, last_name, role, status')
    .eq('tenant_id', userData?.tenant_id)

  if (error) {
    throw new Error('Failed to fetch users: ' + error.message)
  }

  return { data: users || [] }
}

export async function inviteCompanyUser(email: string, role: string) {
  const supabase = getSupabase()
  const user = await supabase.auth.getUser()

  const { data: userData } = await supabase
    .from('users')
    .select('tenant_id')
    .eq('id', user.data.user?.id)
    .single()

  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 30)

  const { error } = await supabase
    .from('pending_invites')
    .insert([
      {
        tenant_id: userData?.tenant_id,
        email,
        role,
        invited_by: user.data.user?.id,
        expires_at: expiresAt.toISOString(),
      },
    ])

  if (error) {
    throw new Error('Failed to send invite: ' + error.message)
  }

  return { success: true }
}

// ============================================================================
// CREDITS API
// ============================================================================

export async function getCreditsBalance() {
  const supabase = getSupabase()
  const user = await supabase.auth.getUser()

  const { data: userData } = await supabase
    .from('users')
    .select('tenant_id')
    .eq('id', user.data.user?.id)
    .single()

  const balance = await supabase.rpc('get_credit_balance', { p_tenant_id: userData?.tenant_id })

  return { balance: balance || 0 }
}
