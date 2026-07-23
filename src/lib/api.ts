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

// Ensure storage bucket exists
export async function ensureStorageBucket(bucketName: string): Promise<void> {
  try {
    const supabase = getSupabase()

    // Try to get bucket info (will fail if not exists)
    const { data: buckets } = await supabase.storage.listBuckets()
    const bucketExists = buckets?.some(b => b.name === bucketName)

    if (!bucketExists) {
      // Create bucket if not found
      const { error } = await supabase.storage.createBucket(bucketName, {
        public: false,
        fileSizeLimit: 52428800 // 50MB
      })

      if (error && !error.message.includes('already exists')) {
        console.warn(`Warning: Could not create bucket ${bucketName}:`, error.message)
      }
    }
  } catch (err) {
    console.warn('Storage bucket check failed:', err)
  }
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
// SEARCH API — Knowledge Graph (Reports as Products)
// ============================================================================

/**
 * Search in Knowledge Graph:
 * Reports are "products" (منتجات) aggregated by mرصد
 * Search looks in: report descriptions, report types, company names
 * Results show companies with their aggregated reports (without revealing reporter identity)
 */

export async function searchKnowledgeGraph(q: string, filters?: { sector?: string; city?: string; riskLevel?: string; trustScoreMin?: number }) {
  const supabase = getSupabase()

  if (!q.trim()) {
    return { results: [], totalResults: 0, metadata: { searchTime: 0 } }
  }

  // FTS search query for reports aggregated by company
  const { data, error } = await supabase
    .from('companies')
    .select(`
      id,
      name,
      commercial_name,
      tax_id,
      sector,
      city,
      trust_score,
      approved_reports_count,
      reports(id, description, type, created_at)
    `)
    .or(`name.ilike.%${q}%,commercial_name.ilike.%${q}%,tax_id.ilike.%${q}%`)
    .limit(20)

  if (error) {
    console.error('Search error:', error)
    return { results: [], totalResults: 0, metadata: { searchTime: 0 } }
  }

  // Also search in report descriptions/types to find related companies
  const { data: reportMatches, error: reportError } = await supabase
    .from('reports')
    .select('target_company_id, description, type')
    .or(`description.ilike.%${q}%,type.ilike.%${q}%`)
    .eq('status', 'approved')
    .limit(100)

  if (reportError) {
    console.error('Report search error:', reportError)
  }

  // Collect unique company IDs from report matches
  const companyIdsFromReports = new Set(
    reportMatches?.map(r => r.target_company_id) || []
  )

  // Fetch companies from report matches
  if (companyIdsFromReports.size > 0) {
    const { data: reportRelatedCompanies, error: e2 } = await supabase
      .from('companies')
      .select(`
        id,
        name,
        commercial_name,
        sector,
        city,
        trust_score,
        approved_reports_count,
        reports(id, description, type, created_at)
      `)
      .in('id', Array.from(companyIdsFromReports))
      .limit(20)

    if (!e2 && reportRelatedCompanies) {
      // Merge results, remove duplicates
      const merged = [...(data || [])].concat(reportRelatedCompanies || [])
      const unique = Array.from(
        new Map(merged.map(c => [c.id, c])).values()
      )

      return {
        results: unique.map(c => ({
          type: 'company',
          id: c.id,
          name: c.name || c.commercial_name,
          sector: c.sector,
          city: c.city,
          trustScore: c.trust_score,
          reportCount: c.approved_reports_count || 0,
          aggregatedReports: c.reports || [],
          relevance: 0.85
        })),
        totalResults: unique.length,
        metadata: {
          searchTime: 0,
          indexedDocuments: (data?.length || 0) + (reportMatches?.length || 0)
        }
      }
    }
  }

  return {
    results: (data || []).map(c => ({
      type: 'company',
      id: c.id,
      name: c.name || c.commercial_name,
      sector: c.sector,
      city: c.city,
      trustScore: c.trust_score,
      reportCount: c.approved_reports_count || 0,
      aggregatedReports: c.reports || [],
      relevance: 0.90
    })),
    totalResults: data?.length || 0,
    metadata: {
      searchTime: 0,
      indexedDocuments: data?.length || 0
    }
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
  // NOTE: This function is deprecated with Clerk authentication
  // Use the Clerk SDK for signup instead, then create tenant/user records via Supabase
  throw new Error('Use Clerk authentication for signup')
}

export async function logout() {
  const supabase = getSupabase()
  await supabase.auth.signOut()
  clearAuth()
}

export async function createTenantAndUser(userId: string, companyData: any) {
  const supabase = getSupabase()

  try {
    // Generate unique CR number if not provided or if it exists
    let crNumber = companyData.crNumber?.trim()

    if (!crNumber) {
      // If not provided, generate a unique one based on user ID + timestamp
      // Max length is 20 chars, so use short format: CRXXXXXXXX (CR + 8 chars of timestamp)
      const shortTimestamp = Date.now().toString().slice(-8)
      crNumber = `CR${shortTimestamp}`
    } else {
      // Trim to max 20 chars if needed
      if (crNumber.length > 20) {
        crNumber = crNumber.substring(0, 20)
      }

      // Check if CR number already exists
      const { data: existing } = await supabase
        .from('tenants')
        .select('id')
        .eq('cr_number', crNumber)
        .limit(1)

      if (existing && existing.length > 0) {
        // CR number exists, generate new one with timestamp
        const shortTimestamp = Date.now().toString().slice(-8)
        crNumber = `CR${shortTimestamp}`
      }
    }

    // 1. Create or update Tenant record (UPSERT on email)
    const { data: tenantData, error: tenantError } = await supabase
      .from('tenants')
      .upsert([{
        email: companyData.email,
        name: companyData.name,
        cr_number: crNumber,
        phone: companyData.phone || '',
        city: companyData.city || '',
        sector: companyData.sector || '',
        status: 'active',
        cr_file_url: companyData.crFileUrl || null,
        approval_status: companyData.status || 'active'
      }], {
        onConflict: 'email'
      })
      .select()
      .single()

    if (tenantError || !tenantData) {
      throw new Error('فشل إنشاء الشركة: ' + tenantError?.message)
    }

    // 2. Create/Update User record with tenant_id
    const { error: userError } = await supabase
      .from('users')
      .upsert([{
        id: userId,
        tenant_id: tenantData.id,
        email: companyData.email,
        first_name: companyData.firstName || '',
        last_name: companyData.lastName || '',
        role: 'company_admin',
        status: 'active'
      }])

    if (userError) {
      throw new Error('فشل تحديث ملف المستخدم: ' + userError.message)
    }

    // 3. Create Company Record (for searchability)
    await supabase
      .from('companies')
      .insert([{
        name: companyData.name,
        cr_number: companyData.crNumber,
        sector: companyData.sector,
        city: companyData.city,
        founded_year: companyData.foundedYear,
        cr_status: companyData.crStatus || 'active',
        source: 'self_registered',
        approved: true
      }])

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
        .insert([{
          tenant_id: tenantData.id,
          plan_id: plansData[0].id,
          status: 'active',
          current_period_start: new Date().toISOString(),
          current_period_end: futureDate.toISOString()
        }])
    }

    // 5. Initialize Credits Ledger (0 initial balance, companies earn credits by submitting approved reports)
    try {
      await supabase
        .from('credits_ledger')
        .insert([{
          tenant_id: tenantData.id,
          amount: 0,
          reason: 'initial',
          created_at: new Date().toISOString()
        }])
    } catch (err) {
      console.warn('Credits initialization warning:', err)
    }

    // 6. Send Welcome Notification
    try {
      await supabase
        .from('notifications')
        .insert([{
          tenant_id: tenantData.id,
          type: 'welcome',
          title: 'أهلاً وسهلاً في مرصد',
          message: `مرحباً بـ ${companyData.name}! تم تفعيل حسابك بنجاح. ابدأ بإرسال التقارير والبحث عن الشركات.`,
          is_read: false,
          created_at: new Date().toISOString()
        }])
    } catch (err) {
      console.warn('Welcome notification warning:', err)
    }

    // 7. Log registration in audit logs
    try {
      await supabase
        .from('audit_logs')
        .insert([{
          tenant_id: tenantData.id,
          actor_id: userId,
          action: 'company_registered',
          resource_type: 'company',
          resource_id: tenantData.id,
          details: JSON.stringify({
            company_name: companyData.name,
            cr_number: crNumber,
            sector: companyData.sector,
            city: companyData.city,
            auto_created: !companyData.crNumber ? 'cr_number_generated' : 'cr_provided'
          }),
          created_at: new Date().toISOString()
        }])
    } catch (err) {
      console.warn('Audit log warning:', err)
    }

    return { success: true, tenantId: tenantData.id }
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : 'خطأ في إنشاء الحساب')
  }
}

// ============================================================================
// COMPANIES API
// ============================================================================

// Get Company Dashboard Data for current logged-in company
export async function getCompanyDashboard() {
  const supabase = getSupabase()
  const user = await supabase.auth.getUser()

  if (!user.data.user) {
    throw new Error('Unauthorized')
  }

  const { data: userData } = await supabase
    .from('users')
    .select('tenant_id, email, first_name, last_name, role')
    .eq('id', user.data.user.id)
    .single()

  if (!userData) {
    throw new Error('User not found')
  }

  // Get tenant/company info
  const { data: tenantData } = await supabase
    .from('tenants')
    .select('id, name, sector, city, cr_number, status')
    .eq('id', userData.tenant_id)
    .single()

  // Get company detailed info
  const { data: companyData } = await supabase
    .from('companies')
    .select(`
      id, name, sector, city, cr_number, logo_url,
      trust_scores(score, tier, calculated_at),
      reports(count)
    `)
    .eq('cr_number', tenantData?.cr_number)
    .single()

  // Get subscription info
  const { data: subscriptionData } = await supabase
    .from('subscriptions')
    .select(`
      id, status, current_period_start, current_period_end,
      plans(name, features, price)
    `)
    .eq('tenant_id', userData.tenant_id)
    .eq('status', 'active')
    .single()

  // Get credits balance
  const { data: creditBalance } = await supabase
    .rpc('get_credit_balance', { p_tenant_id: userData.tenant_id })

  // Get recent activity (approved reports, credits earned, users invited)
  const { data: recentReports } = await supabase
    .from('reports')
    .select('id, status, created_at, type')
    .eq('reporter_tenant_id', userData.tenant_id)
    .order('created_at', { ascending: false })
    .limit(5)

  const { data: watchlistCount } = await supabase
    .from('watchlist_items')
    .select('id', { count: 'exact' })
    .eq('tenant_id', userData.tenant_id)

  return {
    company: {
      name: tenantData?.name || companyData?.name,
      sector: tenantData?.sector || companyData?.sector,
      city: tenantData?.city || companyData?.city,
      crNumber: tenantData?.cr_number,
      logoUrl: companyData?.logo_url,
      status: tenantData?.status
    },
    stats: {
      trustScore: companyData?.trust_scores?.[0]?.score || null,
      trustTier: companyData?.trust_scores?.[0]?.tier || 'none',
      approvedReportsCount: recentReports?.filter(r => r.status === 'approved').length || 0,
      watchedByCount: watchlistCount?.length || 0,
      creditsBalance: creditBalance || 0,
      subscriptionTier: subscriptionData?.plans?.name || 'free',
      subscriptionExpiry: subscriptionData?.current_period_end
    },
    recentActivity: recentReports?.map(r => ({
      type: r.status === 'approved' ? 'report_approved' : 'report_pending',
      title: `تقرير ${r.type}`,
      date: r.created_at,
      status: r.status
    })) || [],
    user: {
      email: userData.email,
      name: `${userData.first_name} ${userData.last_name}`,
      role: userData.role
    }
  }
}

// Autocomplete function for company names, CR numbers, etc.
export async function getAutocompleteCompanies(q: string, limit = 10) {
  const supabase = getSupabase()

  if (!q || q.trim().length < 1) {
    return { data: [] }
  }

  const { data, error } = await supabase
    .rpc('autocomplete_companies', {
      search_query: q.trim(),
      limit_val: limit
    })

  if (error) {
    console.warn('Autocomplete RPC failed, returning empty:', error)
    return { data: [] }
  }

  return { data: data || [] }
}

export async function searchCompanies(q: string, page = 1, limit = 20) {
  const supabase = getSupabase()
  const offset = (page - 1) * limit

  if (!q || q.trim().length === 0) {
    // Return top companies if no search query
    const { data: companies, count, error } = await supabase
      .from('companies')
      .select(`
        *,
        trust_scores(*)
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) throw new Error('Failed to fetch companies: ' + error.message)

    return {
      data: companies?.map(c => ({
        ...c,
        trust_score: c.trust_scores?.[0] || null,
      })) || [],
      pagination: { page, limit, total: count || 0, pages: Math.ceil((count || 0) / limit) },
    }
  }

  // Use Full Text Search for better search quality
  const { data: companies, count, error } = await supabase
    .rpc('search_companies_fts', {
      search_query: q.trim(),
      limit_val: limit,
      offset_val: offset
    })

  if (error) {
    // Fallback to ILIKE if RPC not available
    console.warn('FTS not available, falling back to ILIKE:', error)

    const { data: companies, count, error: fallbackError } = await supabase
      .from('companies')
      .select(`
        *,
        trust_scores(*)
      `, { count: 'exact' })
      .ilike('name', `%${q}%`)
      .range(offset, offset + limit - 1)

    if (fallbackError) throw new Error('Search failed: ' + fallbackError.message)

    return {
      data: companies?.map(c => ({
        ...c,
        trust_score: c.trust_scores?.[0] || null,
      })) || [],
      pagination: { page, limit, total: count || 0, pages: Math.ceil((count || 0) / limit) },
    }
  }

  // Format FTS results
  const companyIds = companies?.map((c: any) => c.id) || []

  if (companyIds.length === 0) {
    return {
      data: [],
      pagination: { page, limit, total: 0, pages: 0 },
    }
  }

  // Fetch full company data with trust scores
  const { data: fullCompanies, error: fetchError } = await supabase
    .from('companies')
    .select(`
      *,
      trust_scores(*)
    `)
    .in('id', companyIds)

  if (fetchError) throw new Error('Failed to fetch company details: ' + fetchError.message)

  return {
    data: fullCompanies?.map(c => ({
      ...c,
      trust_score: c.trust_scores?.[0] || null,
    })) || [],
    pagination: { page, limit, total: companyIds.length, pages: Math.ceil((companyIds.length) / limit) },
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

// Get company reports timeline
export async function getCompanyReportsTimeline(companyId: string, limit = 10) {
  const supabase = getSupabase()

  const { data, error } = await supabase
    .rpc('get_company_reports_timeline', {
      company_id: companyId,
      limit_val: limit
    })

  if (error) {
    console.warn('Timeline RPC error:', error)
    return { data: [] }
  }

  return { data: data || [] }
}

// Get company trends over time
export async function getCompanyTrends(companyId: string) {
  const supabase = getSupabase()

  const { data, error } = await supabase
    .rpc('get_company_trends', {
      company_id: companyId
    })

  if (error) {
    console.warn('Trends RPC error:', error)
    return { data: [] }
  }

  return { data: data || [] }
}

// Get reports summary by category
export async function getCompanyReportsSummary(companyId: string) {
  const supabase = getSupabase()

  const { data, error } = await supabase
    .rpc('get_company_reports_summary', {
      company_id: companyId
    })

  if (error) {
    console.warn('Summary RPC error:', error)
    return { data: [] }
  }

  return { data: data || [] }
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
    .select('tenant_id, role')
    .eq('id', user.data.user.id)
    .single()

  // BR-06: Check if user role can submit reports (not viewer)
  if (userData?.role === 'viewer') {
    throw new Error('لا يمكنك رفع التقارير. اتصل بمدير الشركة.')
  }

  // Check BR-05: Prevent duplicate reports within 90 days
  const ninetyDaysAgo = new Date()
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

  const { data: existingReport } = await supabase
    .from('reports')
    .select('id, created_at')
    .eq('reporter_tenant_id', userData?.tenant_id)
    .eq('target_company_id', reportData.targetCompanyId)
    .eq('status', 'approved')
    .gte('created_at', ninetyDaysAgo.toISOString())
    .limit(1)

  if (existingReport && existingReport.length > 0) {
    const daysSinceLast = Math.floor((Date.now() - new Date(existingReport[0].created_at).getTime()) / (1000 * 60 * 60 * 24))
    throw new Error(`لقد أرسلت تقريراً عن هذه الشركة قبل ${daysSinceLast} أيام. يرجى الانتظار لمدة 90 يوماً من آخر تقرير معتمد.`)
  }

  // Check subscription status
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('status, plans(name)')
    .eq('tenant_id', userData?.tenant_id)
    .eq('status', 'active')
    .single()

  if (!subscription) {
    throw new Error('الاشتراك غير نشط. يرجى تجديد الاشتراك أولاً.')
  }

  // Check BR-04: Subscription free plan limit
  if (subscription.plans?.name === 'مجاني') {
    const { data: monthReports, count } = await supabase
      .from('reports')
      .select('id', { count: 'exact' })
      .eq('reporter_tenant_id', userData?.tenant_id)
      .gte('created_at', new Date(Date.now() - 30*24*60*60*1000).toISOString())

    if ((count || 0) >= 5) {
      throw new Error('لقد وصلت لحد التقارير الشهري (5 تقارير). يرجى الترقية للخطة المدفوعة.')
    }
  }

  // BR-07: Content validation
  if (!reportData.description || reportData.description.trim().length < 20) {
    throw new Error('وصف التقرير يجب أن يكون 20 حرفاً على الأقل.')
  }

  // Check/create company if not exists
  let targetCompanyId = reportData.targetCompanyId
  if (!targetCompanyId && reportData.companyName) {
    const { data: existingCompany } = await supabase
      .from('companies')
      .select('id')
      .or(`name.ilike.%${reportData.companyName}%,cr_number.eq.${reportData.companyCrNumber}`)
      .limit(1)

    if (existingCompany && existingCompany.length > 0) {
      targetCompanyId = existingCompany[0].id
    } else {
      // Create company
      const { data: newCompany, error: companyError } = await supabase
        .from('companies')
        .insert([{
          name: reportData.companyName,
          cr_number: reportData.companyCrNumber || null,
          sector: reportData.companySector || null,
          city: reportData.companyCity || null,
          source: 'from_report',
          approved: false
        }])
        .select()
        .single()

      if (companyError) {
        throw new Error('فشل إنشاء الشركة: ' + companyError.message)
      }
      targetCompanyId = newCompany.id
    }
  }

  if (!targetCompanyId) {
    throw new Error('شركة الهدف مطلوبة')
  }

  // BR-08: Insert report with audit logging
  const { data: report, error } = await supabase
    .from('reports')
    .insert([
      {
        reporter_tenant_id: userData?.tenant_id,
        target_company_id: targetCompanyId,
        status: 'pending_review',
        type: reportData.type,
        title: reportData.title || reportData.type,
        description: reportData.description,
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

  // Deduct credits immediately (1 credit per report submission)
  try {
    await supabase
      .from('credits_ledger')
      .insert([
        {
          tenant_id: userData?.tenant_id,
          report_id: report.id,
          amount: -1,
          reason: 'report_submitted',
          created_at: new Date().toISOString()
        },
      ])
  } catch (err) {
    console.warn('Credit deduction warning:', err)
  }

  // BR-09: Log in audit logs
  try {
    await supabase
      .from('audit_logs')
      .insert([{
        tenant_id: userData?.tenant_id,
        actor_id: user.data.user.id,
        action: 'report_submitted',
        resource_type: 'report',
        resource_id: report.id,
        details: JSON.stringify({
          target_company_id: targetCompanyId,
          type: reportData.type,
          status: 'pending_review'
        }),
        created_at: new Date().toISOString()
      }])
  } catch (err) {
    console.warn('Audit log warning:', err)
  }

  // BR-09: Send notification to admins
  try {
    await supabase
      .from('notifications')
      .insert([{
        type: 'new_report_pending',
        title: 'تقرير جديد ينتظر المراجعة',
        message: `تقرير جديد من شركة ينتظر المراجعة`,
        is_read: false,
        created_at: new Date().toISOString()
      }])
  } catch (err) {
    console.warn('Notification warning:', err)
  }

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

  if (!user.data.user) {
    throw new Error('Unauthorized')
  }

  // Get report info
  const { data: report } = await supabase
    .from('reports')
    .select('id, target_company_id, reporter_tenant_id')
    .eq('id', reportId)
    .single()

  if (!report) {
    throw new Error('Report not found')
  }

  // Update report status to approved
  const { error } = await supabase
    .from('reports')
    .update({ status: 'approved', approved_at: new Date().toISOString() })
    .eq('id', reportId)

  if (error) {
    throw new Error('Failed to approve: ' + error.message)
  }

  // Award 10 credits to reporter
  try {
    await supabase
      .from('credits_ledger')
      .insert([{
        tenant_id: report.reporter_tenant_id,
        report_id: reportId,
        amount: 10,
        reason: 'report_approved',
        created_at: new Date().toISOString()
      }])
  } catch (err) {
    console.warn('Credit award warning:', err)
  }

  // Trigger: Recalculate trust score for the company
  // This would be a trigger in the database, but we can call an RPC
  try {
    await supabase
      .rpc('compute_trust_score', { p_company_id: report.target_company_id })
  } catch (err) {
    console.warn('Trust score calculation warning:', err)
  }

  // Send notification to reporter
  try {
    await supabase
      .from('notifications')
      .insert([{
        tenant_id: report.reporter_tenant_id,
        type: 'report_approved',
        title: '✅ تم اعتماد تقريرك!',
        message: 'تقريرك تمت الموافقة عليه بنجاح وحصلت على 10 نقاط ائتمان.',
        is_read: false,
        created_at: new Date().toISOString()
      }])
  } catch (err) {
    console.warn('Notification warning:', err)
  }

  // Log review action
  try {
    await supabase
      .from('review_actions')
      .insert([{
        report_id: reportId,
        reviewer_id: user.data.user.id,
        action: 'approved',
        created_at: new Date().toISOString()
      }])
  } catch (err) {
    console.warn('Review action warning:', err)
  }

  // Audit log
  try {
    await supabase
      .from('audit_logs')
      .insert([{
        actor_id: user.data.user.id,
        action: 'report_approved',
        resource_type: 'report',
        resource_id: reportId,
        details: JSON.stringify({
          reporter_tenant_id: report.reporter_tenant_id,
          target_company_id: report.target_company_id,
          credits_awarded: 10
        }),
        created_at: new Date().toISOString()
      }])
  } catch (err) {
    console.warn('Audit log warning:', err)
  }

  return { success: true }
}

export async function rejectReport(reportId: string, reason: string) {
  const supabase = getSupabase()
  const user = await supabase.auth.getUser()

  if (!user.data.user) {
    throw new Error('Unauthorized')
  }

  // Get report info
  const { data: report } = await supabase
    .from('reports')
    .select('id, reporter_tenant_id')
    .eq('id', reportId)
    .single()

  if (!report) {
    throw new Error('Report not found')
  }

  // Update report status to rejected with reason
  const { error } = await supabase
    .from('reports')
    .update({
      status: 'rejected',
      rejected_at: new Date().toISOString(),
      rejection_reason: reason
    })
    .eq('id', reportId)

  if (error) {
    throw new Error('Failed to reject: ' + error.message)
  }

  // Refund the 1 credit deducted during submission
  try {
    await supabase
      .from('credits_ledger')
      .insert([{
        tenant_id: report.reporter_tenant_id,
        report_id: reportId,
        amount: 1,
        reason: 'report_rejected_refund',
        created_at: new Date().toISOString()
      }])
  } catch (err) {
    console.warn('Credit refund warning:', err)
  }

  // Send notification to reporter
  try {
    await supabase
      .from('notifications')
      .insert([{
        tenant_id: report.reporter_tenant_id,
        type: 'report_rejected',
        title: '❌ تم رفض تقريرك',
        message: `تقريرك لم يتم قبوله. السبب: ${reason}`,
        is_read: false,
        created_at: new Date().toISOString()
      }])
  } catch (err) {
    console.warn('Notification warning:', err)
  }

  // Log review action
  try {
    await supabase
      .from('review_actions')
      .insert([{
        report_id: reportId,
        reviewer_id: user.data.user.id,
        action: 'rejected',
        reason,
        created_at: new Date().toISOString()
      }])
  } catch (err) {
    console.warn('Review action warning:', err)
  }

  // Audit log
  try {
    await supabase
      .from('audit_logs')
      .insert([{
        actor_id: user.data.user.id,
        action: 'report_rejected',
        resource_type: 'report',
        resource_id: reportId,
        details: JSON.stringify({
          reporter_tenant_id: report.reporter_tenant_id,
          rejection_reason: reason,
          credit_refunded: 1
        }),
        created_at: new Date().toISOString()
      }])
  } catch (err) {
    console.warn('Audit log warning:', err)
  }

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
