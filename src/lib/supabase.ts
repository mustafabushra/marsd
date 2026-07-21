import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// ============================================================================
// COMPANIES QUERIES
// ============================================================================

export async function getCompanies() {
  console.log('🔗 Supabase: Fetching companies...')
  const { data, error } = await supabase
    .from('companies')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('❌ Supabase Error:', error.message)
    throw new Error(`Failed to fetch companies: ${error.message}`)
  }
  console.log('✅ Supabase: Companies fetched', data)
  return data || []
}

export async function getCompanyById(id: string) {
  const { data, error } = await supabase
    .from('companies')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw new Error(`Failed to fetch company: ${error.message}`)
  return data
}

export async function searchCompanies(query: string) {
  const { data, error } = await supabase
    .from('companies')
    .select('*')
    .ilike('name', `%${query}%`)

  if (error) throw new Error(`Failed to search companies: ${error.message}`)
  return data || []
}

// ============================================================================
// REPORTS QUERIES
// ============================================================================

export async function getReports() {
  const { data, error } = await supabase
    .from('reports')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Failed to fetch reports: ${error.message}`)
  return data || []
}

export async function createReport(report: {
  company_id: string
  company_name: string
  rating: number
  description: string
  author: string
}) {
  const { data, error } = await supabase
    .from('reports')
    .insert([report])
    .select()

  if (error) throw new Error(`Failed to create report: ${error.message}`)
  return data?.[0]
}

export async function getReportsByCompany(companyId: string) {
  const { data, error } = await supabase
    .from('reports')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Failed to fetch reports: ${error.message}`)
  return data || []
}

// ============================================================================
// AUTH QUERIES
// ============================================================================

export async function signUp(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  })

  if (error) throw new Error(`Sign up failed: ${error.message}`)
  return data.user
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) throw new Error(`Sign in failed: ${error.message}`)
  return data.session
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw new Error(`Sign out failed: ${error.message}`)
}

export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser()
  return user
}
