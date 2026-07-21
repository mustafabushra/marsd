import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import VisitorShell from './components/VisitorShell'
import CompanyShell from './components/CompanyShell'
import AdminShell from './components/AdminShell'
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
import Login from './pages/Login'
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
import ModalDemo from './pages/ModalDemo'
import SupabaseTest from './pages/SupabaseTest'

/**
 * AppContent Component
 * Separated from App to allow useAuth hook access within provider
 */
function AppContent() {
  const { isLoggedIn, isAdmin, user, logout, isLoading } = useAuth()

  // Show loading state while initializing auth
  if (isLoading) {
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
          <Route path="/login" element={<Login />} />
        </Route>

        {/* Auth Routes - No layout */}
        <Route path="/forgot-password" element={<ForgotPassword />} />

        {/* Company Routes - Protected */}
        <Route element={<CompanyShell user={user} onLogout={logout} />}>
          <Route path="/dashboard" element={<CompanyRoute isLoggedIn={isLoggedIn} isAdmin={isAdmin}><CompanyDashboard /></CompanyRoute>} />
          <Route path="/search" element={<CompanyRoute isLoggedIn={isLoggedIn} isAdmin={isAdmin}><Search /></CompanyRoute>} />
          <Route path="/add-company" element={<CompanyRoute isLoggedIn={isLoggedIn} isAdmin={isAdmin}><AddCompany /></CompanyRoute>} />
          <Route path="/add-report" element={<CompanyRoute isLoggedIn={isLoggedIn} isAdmin={isAdmin}><AddReport /></CompanyRoute>} />
          <Route path="/my-reports" element={<CompanyRoute isLoggedIn={isLoggedIn} isAdmin={isAdmin}><MyReports /></CompanyRoute>} />
          <Route path="/trust-report/:id" element={<CompanyRoute isLoggedIn={isLoggedIn} isAdmin={isAdmin}><TrustReport /></CompanyRoute>} />
          <Route path="/watchlist" element={<CompanyRoute isLoggedIn={isLoggedIn} isAdmin={isAdmin}><Watchlist /></CompanyRoute>} />
          <Route path="/compare" element={<CompanyRoute isLoggedIn={isLoggedIn} isAdmin={isAdmin}><Compare /></CompanyRoute>} />
          <Route path="/users" element={<CompanyRoute isLoggedIn={isLoggedIn} isAdmin={isAdmin}><CompanyUsers /></CompanyRoute>} />
          <Route path="/subscription" element={<CompanyRoute isLoggedIn={isLoggedIn} isAdmin={isAdmin}><Subscription /></CompanyRoute>} />
          <Route path="/profile" element={<CompanyRoute isLoggedIn={isLoggedIn} isAdmin={isAdmin}><Profile /></CompanyRoute>} />
          <Route path="/notifications" element={<CompanyRoute isLoggedIn={isLoggedIn} isAdmin={isAdmin}><Notifications /></CompanyRoute>} />
          <Route path="/business-requests" element={<CompanyRoute isLoggedIn={isLoggedIn} isAdmin={isAdmin}><BusinessRequests /></CompanyRoute>} />
        </Route>

        {/* Admin Routes - Protected */}
        <Route element={<AdminShell user={user} onLogout={logout} />}>
          <Route path="/admin" element={<AdminRoute isLoggedIn={isLoggedIn} isAdmin={isAdmin}><AdminDashboard /></AdminRoute>} />
          <Route path="/admin/requests" element={<AdminRoute isLoggedIn={isLoggedIn} isAdmin={isAdmin}><AdminRequests /></AdminRoute>} />
          <Route path="/admin/reports" element={<AdminRoute isLoggedIn={isLoggedIn} isAdmin={isAdmin}><AdminReports /></AdminRoute>} />
          <Route path="/admin/bulk-import" element={<AdminRoute isLoggedIn={isLoggedIn} isAdmin={isAdmin}><AdminBulkImport /></AdminRoute>} />
          <Route path="/admin/companies" element={<AdminRoute isLoggedIn={isLoggedIn} isAdmin={isAdmin}><AdminCompanies /></AdminRoute>} />
          <Route path="/admin/users" element={<AdminRoute isLoggedIn={isLoggedIn} isAdmin={isAdmin}><AdminUsers /></AdminRoute>} />
          <Route path="/admin/logs" element={<AdminRoute isLoggedIn={isLoggedIn} isAdmin={isAdmin}><AdminLogs /></AdminRoute>} />
          <Route path="/admin/settings" element={<AdminRoute isLoggedIn={isLoggedIn} isAdmin={isAdmin}><AdminSettings /></AdminRoute>} />
          <Route path="/admin/tenants" element={<AdminRoute isLoggedIn={isLoggedIn} isAdmin={isAdmin}><AdminTenants /></AdminRoute>} />
          <Route path="/admin/subscriptions" element={<AdminRoute isLoggedIn={isLoggedIn} isAdmin={isAdmin}><AdminSubscriptions /></AdminRoute>} />
          <Route path="/admin/admin-users" element={<AdminRoute isLoggedIn={isLoggedIn} isAdmin={isAdmin}><AdminAdminUsers /></AdminRoute>} />
          <Route path="/admin/plans" element={<AdminRoute isLoggedIn={isLoggedIn} isAdmin={isAdmin}><AdminPlans /></AdminRoute>} />
          <Route path="/admin/payments" element={<AdminRoute isLoggedIn={isLoggedIn} isAdmin={isAdmin}><AdminPayments /></AdminRoute>} />
          <Route path="/admin/trust-score" element={<AdminRoute isLoggedIn={isLoggedIn} isAdmin={isAdmin}><AdminTrustScore /></AdminRoute>} />
          <Route path="/admin/report-analytics" element={<AdminRoute isLoggedIn={isLoggedIn} isAdmin={isAdmin}><AdminReportAnalytics /></AdminRoute>} />
          <Route path="/admin/email-templates" element={<AdminRoute isLoggedIn={isLoggedIn} isAdmin={isAdmin}><AdminEmailTemplates /></AdminRoute>} />
          <Route path="/admin/data-export" element={<AdminRoute isLoggedIn={isLoggedIn} isAdmin={isAdmin}><AdminDataExport /></AdminRoute>} />
          <Route path="/admin/disputes" element={<AdminRoute isLoggedIn={isLoggedIn} isAdmin={isAdmin}><AdminDisputes /></AdminRoute>} />
          <Route path="/admin/system-health" element={<AdminRoute isLoggedIn={isLoggedIn} isAdmin={isAdmin}><AdminSystemHealth /></AdminRoute>} />
          <Route path="/admin/fraud-detection" element={<AdminRoute isLoggedIn={isLoggedIn} isAdmin={isAdmin}><AdminFraudDetection /></AdminRoute>} />
          <Route path="/admin/integrations" element={<AdminRoute isLoggedIn={isLoggedIn} isAdmin={isAdmin}><AdminIntegrations /></AdminRoute>} />
          <Route path="/admin/tenant-analytics" element={<AdminRoute isLoggedIn={isLoggedIn} isAdmin={isAdmin}><AdminTenantAnalytics /></AdminRoute>} />
          <Route path="/admin/company-verification" element={<AdminRoute isLoggedIn={isLoggedIn} isAdmin={isAdmin}><AdminCompanyVerification /></AdminRoute>} />
          <Route path="/admin/backup" element={<AdminRoute isLoggedIn={isLoggedIn} isAdmin={isAdmin}><AdminBackup /></AdminRoute>} />
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
 * Wraps the entire application with AuthProvider
 * This enables all components to use the useAuth hook
 */
export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}
