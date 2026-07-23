import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ClerkProvider } from './context/ClerkProvider'
import { useUser, useAuth as useClerkAuth } from '@clerk/react'
import VisitorShell from './components/VisitorShell'
import CompanyShell from './components/CompanyShell'
import AdminShell from './components/AdminShell'
import CompanyStatusRouter from './components/CompanyStatusRouter'
import { AdminRoute, CompanyRoute } from './components/ProtectedRoute'
import NotFound from './pages/NotFound'
import Unauthorized from './pages/Unauthorized'
import Landing from './pages/Landing'
import About from './pages/About'
import Pricing from './pages/Pricing'
import Partners from './pages/Partners'
import FAQ from './pages/FAQ'
import Contact from './pages/Contact'
import Register from './pages/Register'
import CompanyRegister from './pages/CompanyRegister'
import CompanyOnboarding from './pages/CompanyOnboarding'
import Login from './pages/Login'
import AdminLogin from './pages/AdminLogin'
import ForgotPassword from './pages/ForgotPassword'
import CompanyDashboard from './pages/CompanyDashboard'
import Search from './pages/Search'
import AddCompany from './pages/AddCompany'
import AddReport from './pages/AddReport'
import MyReports from './pages/MyReports'
import TrustReport from './pages/TrustReport'
import Watchlist from './pages/Watchlist'
import Compare from './pages/Compare'
import CompanyUsers from './pages/CompanyUsers'
import Subscription from './pages/Subscription'
import Profile from './pages/Profile'
import Notifications from './pages/Notifications'
import BusinessRequests from './pages/BusinessRequests'
import AdminDashboard from './pages/AdminDashboard'
import AdminRequests from './pages/AdminRequests'
import AdminReports from './pages/AdminReports'
import AdminBulkImport from './pages/AdminBulkImport'
import AdminCompanies from './pages/AdminCompanies'
import AdminCompaniesManagement from './pages/AdminCompaniesManagement'
import AdminUsers from './pages/AdminUsers'
import AdminLogs from './pages/AdminLogs'
import AdminSettings from './pages/AdminSettings'
import AdminTenants from './pages/AdminTenants'
import AdminSubscriptions from './pages/AdminSubscriptions'
import AdminAdminUsers from './pages/AdminAdminUsers'
import AdminPlans from './pages/AdminPlans'
import AdminPayments from './pages/AdminPayments'
import AdminTrustScore from './pages/AdminTrustScore'
import AdminReportAnalytics from './pages/AdminReportAnalytics'
import AdminEmailTemplates from './pages/AdminEmailTemplates'
import AdminDataExport from './pages/AdminDataExport'
import AdminDisputes from './pages/AdminDisputes'
import AdminSystemHealth from './pages/AdminSystemHealth'
import AdminFraudDetection from './pages/AdminFraudDetection'
import AdminIntegrations from './pages/AdminIntegrations'
import AdminTenantAnalytics from './pages/AdminTenantAnalytics'
import AdminCompanyVerification from './pages/AdminCompanyVerification'
import AdminBackup from './pages/AdminBackup'
import AdminCompanyApproval from './pages/AdminCompanyApproval'
import AccountPendingApproval from './pages/AccountPendingApproval'
import AccountRejected from './pages/AccountRejected'
import AccountSuspended from './pages/AccountSuspended'
import RegistrationPending from './pages/RegistrationPending'
import CompanyClaimPending from './pages/CompanyClaimPending'
import ModalDemo from './pages/ModalDemo'
import SupabaseTest from './pages/SupabaseTest'
import TestSupabase from './pages/TestSupabase'

/**
 * AppContent Component
 * Separated from App to allow useAuth hook access within provider
 */
function AppContent() {
  const { isLoaded, isSignedIn } = useClerkAuth()
  const { user } = useUser()

  // Show loading state while initializing auth
  if (!isLoaded) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        fontSize: '18px',
      }}>
        جاري التحميل...
      </div>
    )
  }

  return (
    <BrowserRouter>
      <Routes>
        {/* Modal Demo Route */}
        <Route path="/modals-demo" element={<ModalDemo />} />

        {/* Supabase Test Route */}
        <Route path="/supabase-test" element={<SupabaseTest />} />

        {/* Visitor Routes - Always accessible */}
        <Route element={<VisitorShell />}>
          <Route path="/" element={<Landing />} />
          <Route path="/about" element={<About />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/partners" element={<Partners />} />
          <Route path="/faq" element={<FAQ />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/register" element={<Register />} />
          <Route path="/company-register" element={<CompanyRegister />} />
          <Route path="/company-onboarding" element={<CompanyOnboarding />} />
          <Route path="/login" element={<Login />} />
        </Route>

        {/* Auth Routes - No layout */}
        <Route path="/admin-login" element={<AdminLogin />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/account-pending" element={<AccountPendingApproval />} />
        <Route path="/account-rejected" element={<AccountRejected />} />
        <Route path="/account-suspended" element={<AccountSuspended />} />
        <Route path="/registration-pending" element={<RegistrationPending />} />
        <Route path="/company-claim-pending" element={<CompanyClaimPending />} />
        <Route path="/test-supabase" element={<TestSupabase />} />

        {/* Company Routes - Protected & Company Status Checked */}
        <Route element={<CompanyStatusRouter><CompanyShell user={user} /></CompanyStatusRouter>}>
          <Route path="/dashboard" element={<CompanyRoute><CompanyDashboard /></CompanyRoute>} />
          <Route path="/search" element={<CompanyRoute><Search /></CompanyRoute>} />
          <Route path="/add-company" element={<CompanyRoute><AddCompany /></CompanyRoute>} />
          <Route path="/add-report" element={<CompanyRoute><AddReport /></CompanyRoute>} />
          <Route path="/my-reports" element={<CompanyRoute><MyReports /></CompanyRoute>} />
          <Route path="/trust-report/:id" element={<CompanyRoute><TrustReport /></CompanyRoute>} />
          <Route path="/watchlist" element={<CompanyRoute><Watchlist /></CompanyRoute>} />
          <Route path="/compare" element={<CompanyRoute><Compare /></CompanyRoute>} />
          <Route path="/users" element={<CompanyRoute><CompanyUsers /></CompanyRoute>} />
          <Route path="/subscription" element={<CompanyRoute><Subscription /></CompanyRoute>} />
          <Route path="/profile" element={<CompanyRoute><Profile /></CompanyRoute>} />
          <Route path="/notifications" element={<CompanyRoute><Notifications /></CompanyRoute>} />
          <Route path="/business-requests" element={<CompanyRoute><BusinessRequests /></CompanyRoute>} />
        </Route>

        {/* Admin Routes - Protected */}
        <Route element={<AdminShell user={user} />}>
          <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
          <Route path="/admin/requests" element={<AdminRoute><AdminRequests /></AdminRoute>} />
          <Route path="/admin/reports" element={<AdminRoute><AdminReports /></AdminRoute>} />
          <Route path="/admin/bulk-import" element={<AdminRoute><AdminBulkImport /></AdminRoute>} />
          <Route path="/admin/companies" element={<AdminRoute><AdminCompaniesManagement /></AdminRoute>} />
          <Route path="/admin/users" element={<AdminRoute><AdminUsers /></AdminRoute>} />
          <Route path="/admin/logs" element={<AdminRoute><AdminLogs /></AdminRoute>} />
          <Route path="/admin/settings" element={<AdminRoute><AdminSettings /></AdminRoute>} />
          <Route path="/admin/tenants" element={<AdminRoute><AdminTenants /></AdminRoute>} />
          <Route path="/admin/subscriptions" element={<AdminRoute><AdminSubscriptions /></AdminRoute>} />
          <Route path="/admin/admin-users" element={<AdminRoute><AdminAdminUsers /></AdminRoute>} />
          <Route path="/admin/plans" element={<AdminRoute><AdminPlans /></AdminRoute>} />
          <Route path="/admin/payments" element={<AdminRoute><AdminPayments /></AdminRoute>} />
          <Route path="/admin/trust-score" element={<AdminRoute><AdminTrustScore /></AdminRoute>} />
          <Route path="/admin/report-analytics" element={<AdminRoute><AdminReportAnalytics /></AdminRoute>} />
          <Route path="/admin/email-templates" element={<AdminRoute><AdminEmailTemplates /></AdminRoute>} />
          <Route path="/admin/data-export" element={<AdminRoute><AdminDataExport /></AdminRoute>} />
          <Route path="/admin/disputes" element={<AdminRoute><AdminDisputes /></AdminRoute>} />
          <Route path="/admin/system-health" element={<AdminRoute><AdminSystemHealth /></AdminRoute>} />
          <Route path="/admin/fraud-detection" element={<AdminRoute><AdminFraudDetection /></AdminRoute>} />
          <Route path="/admin/integrations" element={<AdminRoute><AdminIntegrations /></AdminRoute>} />
          <Route path="/admin/tenant-analytics" element={<AdminRoute><AdminTenantAnalytics /></AdminRoute>} />
          <Route path="/admin/company-verification" element={<AdminRoute><AdminCompanyVerification /></AdminRoute>} />
          <Route path="/admin/company-approval" element={<AdminRoute><AdminCompanyApproval /></AdminRoute>} />
          <Route path="/admin/backup" element={<AdminRoute><AdminBackup /></AdminRoute>} />
        </Route>

        {/* Error Pages */}
        <Route path="/unauthorized" element={<Unauthorized />} />
        <Route path="/404" element={<NotFound />} />

        {/* Catch-all 404 */}
        <Route path="*" element={<Navigate to="/404" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

/**
 * App Component
 * Wraps the entire application with ClerkProvider
 * This enables all components to use Clerk auth
 */
export default function App() {
  return (
    <ClerkProvider>
      <AppContent />
    </ClerkProvider>
  )
}
