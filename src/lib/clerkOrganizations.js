// Helper functions for Clerk Organizations integration with Supabase tenants

/**
 * Maps Clerk organization data to Supabase tenant structure
 * Used when syncing Clerk org metadata to our database
 */
export function mapClerkOrgToTenant(clerkOrg) {
  return {
    id: clerkOrg.id, // Clerk org ID is the source of truth
    name: clerkOrg.name,
    email: clerkOrg.publicMetadata?.email || '',
    phone: clerkOrg.publicMetadata?.phone || '',
    city: clerkOrg.publicMetadata?.city || '',
    sector: clerkOrg.publicMetadata?.sector || '',
    cr_number: clerkOrg.publicMetadata?.cr_number || '',
    status: clerkOrg.publicMetadata?.status || 'active',
    plan_id: clerkOrg.publicMetadata?.plan_id || null,
    created_at: clerkOrg.createdAt,
    updated_at: clerkOrg.updatedAt,
  }
}

/**
 * Sync a Clerk organization to Supabase
 * Creates or updates tenant based on Clerk org ID
 * Called after organization creation/update in Clerk
 */
export async function syncClerkOrgToSupabase(supabase, clerkOrg) {
  const tenant = mapClerkOrgToTenant(clerkOrg)

  const { error } = await supabase
    .from('tenants')
    .upsert(
      {
        ...tenant,
        id: clerkOrg.id, // Use Clerk org ID as tenant ID
      },
      { onConflict: 'id' }
    )

  if (error) {
    console.error('Failed to sync Clerk org to Supabase:', error)
    throw error
  }

  return tenant
}

/**
 * Get or create Clerk organization for user after signup
 * Called when user signs up - creates org with user as admin
 */
export async function getOrCreateUserOrganization(user) {
  // In a real implementation, this would call Clerk's backend API
  // to create an organization for the user
  // For now, this is a placeholder for the frontend side

  if (!user?.primaryEmailAddress) {
    throw new Error('User has no email address')
  }

  const email = user.primaryEmailAddress.emailAddress
  const defaultOrgName = email.split('@')[0] || 'My Company'

  return {
    id: user.id, // Temporary - would be Clerk org ID from backend
    name: defaultOrgName,
    email: email,
  }
}

/**
 * Check if user has admin role in organization
 */
export function isUserOrgAdmin(orgMembership) {
  return orgMembership?.role === 'admin' || orgMembership?.role === 'org:admin'
}

/**
 * Prepare user for tenancy context
 * Returns tenant context information
 */
export function getUserTenantContext(organization, user) {
  return {
    tenantId: organization?.id,
    tenantName: organization?.name,
    userId: user?.id,
    userEmail: user?.primaryEmailAddress?.emailAddress,
    isAdmin: isUserOrgAdmin(organization?.membership),
    userRole: organization?.membership?.role,
  }
}
