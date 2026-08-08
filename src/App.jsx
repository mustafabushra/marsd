import { lazy, Suspense } from 'react'
import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import ErrorBoundary from './components/ErrorBoundary'
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
const About = lazy(() => import('./pages/About'))
const PhoneUpload = lazy(() => import('./pages/PhoneUpload'))
const Pricing = lazy(() => import('./pages/Pricing'))
const Partners = lazy(() => import('./pages/Partners'))
const FAQ = lazy(() => import('./pages/FAQ'))
const Contact = lazy(() => import('./pages/Contact'))
import Register from './pages/Register'
const CompanyRegister = lazy(() => import('./pages/CompanyRegister'))
const CompanyOnboarding = lazy(() => import('./pages/CompanyOnboarding'))
import Login from './pages/Login'
const AdminLogin = lazy(() => import('./pages/AdminLogin'))
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'))
const CompanyDashboard = lazy(() => import('./pages/CompanyDashboard'))
const Search = lazy(() => import('./pages/Search'))
const AddCompany = lazy(() => import('./pages/AddCompany'))
const AddReport = lazy(() => import('./pages/AddReport'))
const MyReports = lazy(() => import('./pages/MyReports'))
const MyCompanies = lazy(() => import('./pages/MyCompanies'))
const TrustReport = lazy(() => import('./pages/TrustReport'))
const Watchlist = lazy(() => import('./pages/Watchlist'))
const Compare = lazy(() => import('./pages/Compare'))
const CompanyUsers = lazy(() => import('./pages/CompanyUsers'))
const Subscription = lazy(() => import('./pages/Subscription'))
const Profile = lazy(() => import('./pages/Profile'))
const Notifications = lazy(() => import('./pages/Notifications'))
const ReportsAboutUs = lazy(() => import('./pages/ReportsAboutUs'))
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'))
const AdminRequests = lazy(() => import('./pages/AdminRequests'))
const AdminReports = lazy(() => import('./pages/AdminReports'))
const AdminBulkImport = lazy(() => import('./pages/AdminBulkImport'))
const AdminCompaniesManagement = lazy(() => import('./pages/AdminCompaniesManagement'))
const AdminUsers = lazy(() => import('./pages/AdminUsers'))
const AdminLogs = lazy(() => import('./pages/AdminLogs'))
const AdminSettings = lazy(() => import('./pages/AdminSettings'))
const AdminActivities = lazy(() => import('./pages/AdminActivities'))
import CommandPalette from './components/CommandPalette'
const AdminTenants = lazy(() => import('./pages/AdminTenants'))
const AdminSubscriptions = lazy(() => import('./pages/AdminSubscriptions'))
const AdminPartners = lazy(() => import('./pages/AdminPartners'))
const AdminAdminUsers = lazy(() => import('./pages/AdminAdminUsers'))
const AdminPlans = lazy(() => import('./pages/AdminPlans'))
const AdminPayments = lazy(() => import('./pages/AdminPayments'))
const AdminTrustScore = lazy(() => import('./pages/AdminTrustScore'))
const AdminReportAnalytics = lazy(() => import('./pages/AdminReportAnalytics'))
const AdminEmailTemplates = lazy(() => import('./pages/AdminEmailTemplates'))
const AdminDataExport = lazy(() => import('./pages/AdminDataExport'))
const AdminDisputes = lazy(() => import('./pages/AdminDisputes'))
const AdminDocuments = lazy(() => import('./pages/AdminDocuments'))
const AdminRoster = lazy(() => import('./pages/AdminRoster'))
const AdminCompanyFile = lazy(() => import('./pages/AdminCompanyFile'))
const AdminSystemHealth = lazy(() => import('./pages/AdminSystemHealth'))
const AdminFraudDetection = lazy(() => import('./pages/AdminFraudDetection'))
const AdminIntegrations = lazy(() => import('./pages/AdminIntegrations'))
const AdminTenantAnalytics = lazy(() => import('./pages/AdminTenantAnalytics'))
const AdminCompanyVerification = lazy(() => import('./pages/AdminCompanyVerification'))
const AdminCompanyApproval = lazy(() => import('./pages/AdminCompanyApproval'))
const AccountPendingApproval = lazy(() => import('./pages/AccountPendingApproval'))
const AccountRejected = lazy(() => import('./pages/AccountRejected'))
const AccountSuspended = lazy(() => import('./pages/AccountSuspended'))
const RegistrationPending = lazy(() => import('./pages/RegistrationPending'))
const CompanyClaimPending = lazy(() => import('./pages/CompanyClaimPending'))
const AdminClaimRequests = lazy(() => import('./pages/AdminClaimRequests'))
const CompanyKnowledgeBase = lazy(() => import('./pages/CompanyKnowledgeBase'))
const ReportKnowledgeBase = lazy(() => import('./pages/ReportKnowledgeBase'))
import AuthCallback from './pages/AuthCallback'
import { SkeletonPage } from './components/Skeleton'
import DeferredSkeleton from './components/DeferredSkeleton'
const AcceptInvite = lazy(() => import('./pages/AcceptInvite'))

/**
 * Clerk loads its script from a CDN, and until it answers the whole app is one
 * loading screen. When that request fails there is no error and no timeout —
 * the screen just stays, indistinguishable from a slow network. Give it a
 * deadline and then say what is wrong.
 */
function AuthLoading() {
  const [stalled, setStalled] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setStalled(true), 12000)
    return () => clearTimeout(t)
  }, [])

  const wrap = { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontSize: '18px', padding: '24px' }

  // The very first paint, before Clerk has answered. There is no shell yet and
  // nothing is known about where this person is going, so the skeleton is
  // generic — but it is still a skeleton rather than a sentence, because a line
  // of text centred in an empty viewport is what a crashed app looks like, and
  // this is the screen a slow connection sits on longest.
  //
  // After twelve seconds it gives up and says so; that message is below and is
  // deliberately not a skeleton, because by then the wait is the news.
  if (!stalled) return <div style={{ padding: '28px 32px' }}><SkeletonPage /></div>

  return (
    <div style={wrap}>
      <div style={{ maxWidth: '560px', textAlign: 'center', background: '#fff', border: '1px solid #FDE68A', borderRadius: '16px', padding: '28px' }}>
        <h1 style={{ fontSize: '18px', fontWeight: 900, color: '#92400E', margin: '0 0 12px' }}>⚠️ تعذّر تحميل نظام تسجيل الدخول</h1>
        <p style={{ fontSize: '14.5px', color: '#334155', lineHeight: 1.9, margin: '0 0 18px' }}>
          لم يستجب Clerk خلال 12 ثانية. غالباً انقطاع في الشبكة، أو حجب للنطاق، أو خطأ في إعداد المفتاح.
          افتح وحدة تحكم المتصفح (F12) لرؤية السبب.
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{ background: '#0F172A', color: '#fff', border: 0, borderRadius: '10px', padding: '11px 26px', fontSize: '14px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          إعادة المحاولة
        </button>
      </div>
    </div>
  )
}

/**
 * AppContent Component
 * Separated from App to allow useAuth hook access within provider
 */
function AppContent() {
  const { isLoaded, isSignedIn } = useClerkAuth()
  const { user } = useUser()

  // Show loading state while initializing auth
  if (!isLoaded) {
    return <AuthLoading />
  }

  return (
    <BrowserRouter>
      {/* Inside the router because it navigates, and outside <Routes> because
          Ctrl+K has to work on every screen rather than on a chosen few. */}
      <CommandPalette />
      {/* Still needed for the visitor pages and the auth screens, which have
          no shell to hold a boundary of their own. The shells each carry one
          now, so a navigation inside them never reaches this. */}
      <Suspense fallback={<DeferredSkeleton><div style={{ padding: '28px 32px' }}><SkeletonPage /></div></DeferredSkeleton>}>
        <Routes>
        {/* The phone half of the QR handoff.

            Outside VisitorShell on purpose. Somebody scanned a code to do one
            thing, on a phone, probably standing up — a navigation bar, a
            «سجّل دخولك» prompt and a footer are all ways to leave a task they
            have already committed to. Its authority is the token in the URL and
            nothing else, and that token can buy exactly one upload. */}
        <Route path="/u/:token" element={<PhoneUpload />} />

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
        <Route path="/accept-invite" element={<AcceptInvite />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/admin-login" element={<AdminLogin />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/account-pending" element={<AccountPendingApproval />} />
        <Route path="/account-rejected" element={<AccountRejected />} />
        <Route path="/account-suspended" element={<AccountSuspended />} />
        <Route path="/registration-pending" element={<RegistrationPending />} />
        <Route path="/company-claim-pending" element={<CompanyClaimPending />} />

        {/* Company Routes - Protected & Company Status Checked */}
        <Route element={<CompanyStatusRouter><CompanyShell user={user} /></CompanyStatusRouter>}>
          <Route path="/dashboard" element={<CompanyRoute><CompanyDashboard /></CompanyRoute>} />
          <Route path="/search" element={<CompanyRoute><Search /></CompanyRoute>} />
          <Route path="/add-company" element={<CompanyRoute><AddCompany /></CompanyRoute>} />
          <Route path="/add-report" element={<CompanyRoute><AddReport /></CompanyRoute>} />
          <Route path="/my-reports" element={<CompanyRoute><MyReports /></CompanyRoute>} />
          <Route path="/my-companies" element={<CompanyRoute><MyCompanies /></CompanyRoute>} />
          <Route path="/trust-report/:id" element={<CompanyRoute><TrustReport /></CompanyRoute>} />
          <Route path="/watchlist" element={<CompanyRoute><Watchlist /></CompanyRoute>} />
          {/* The documents screen was merged into the company profile. The route
              stays as a redirect so saved links and the completion card keep working. */}
          <Route path="/documents" element={<Navigate to="/profile" replace />} />
          <Route path="/compare" element={<CompanyRoute><Compare /></CompanyRoute>} />
          <Route path="/users" element={<CompanyRoute><CompanyUsers /></CompanyRoute>} />
          <Route path="/subscription" element={<CompanyRoute><Subscription /></CompanyRoute>} />
          <Route path="/profile" element={<CompanyRoute><Profile /></CompanyRoute>} />
          <Route path="/notifications" element={<CompanyRoute><Notifications /></CompanyRoute>} />
          <Route path="/reports-about-us" element={<CompanyRoute><ReportsAboutUs /></CompanyRoute>} />
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
          <Route path="/admin/activities" element={<AdminRoute><AdminActivities /></AdminRoute>} />
          <Route path="/admin/tenants" element={<AdminRoute><AdminTenants /></AdminRoute>} />
          <Route path="/admin/subscriptions" element={<AdminRoute><AdminSubscriptions /></AdminRoute>} />
          <Route path="/admin/partners" element={<AdminRoute><AdminPartners /></AdminRoute>} />
          <Route path="/admin/admin-users" element={<AdminRoute><AdminAdminUsers /></AdminRoute>} />
          <Route path="/admin/plans" element={<AdminRoute><AdminPlans /></AdminRoute>} />
          <Route path="/admin/payments" element={<AdminRoute><AdminPayments /></AdminRoute>} />
          <Route path="/admin/trust-score" element={<AdminRoute><AdminTrustScore /></AdminRoute>} />
          <Route path="/admin/report-analytics" element={<AdminRoute><AdminReportAnalytics /></AdminRoute>} />
          <Route path="/admin/email-templates" element={<AdminRoute><AdminEmailTemplates /></AdminRoute>} />
          <Route path="/admin/data-export" element={<AdminRoute><AdminDataExport /></AdminRoute>} />
          <Route path="/admin/disputes" element={<AdminRoute><AdminDisputes /></AdminRoute>} />
          <Route path="/admin/documents" element={<AdminRoute><AdminDocuments /></AdminRoute>} />
          <Route path="/admin/roster" element={<AdminRoute><AdminRoster /></AdminRoute>} />
          <Route path="/admin/company/:id" element={<AdminRoute><AdminCompanyFile /></AdminRoute>} />
          <Route path="/admin/system-health" element={<AdminRoute><AdminSystemHealth /></AdminRoute>} />
          <Route path="/admin/fraud-detection" element={<AdminRoute><AdminFraudDetection /></AdminRoute>} />
          <Route path="/admin/integrations" element={<AdminRoute><AdminIntegrations /></AdminRoute>} />
          <Route path="/admin/tenant-analytics" element={<AdminRoute><AdminTenantAnalytics /></AdminRoute>} />
          <Route path="/admin/company-verification" element={<AdminRoute><AdminCompanyVerification /></AdminRoute>} />
          <Route path="/admin/company-approval" element={<AdminRoute><AdminCompanyApproval /></AdminRoute>} />
          <Route path="/admin/claim-requests" element={<AdminRoute><AdminClaimRequests /></AdminRoute>} />
          {/* Knowledge Base Management - Central Repositories */}
          <Route path="/admin/knowledge-base/companies" element={<AdminRoute><CompanyKnowledgeBase /></AdminRoute>} />
          <Route path="/admin/knowledge-base/reports" element={<AdminRoute><ReportKnowledgeBase /></AdminRoute>} />
        </Route>

        {/* Error Pages */}
        <Route path="/unauthorized" element={<Unauthorized />} />
        <Route path="/404" element={<NotFound />} />

        {/* Catch-all 404 */}
        <Route path="*" element={<Navigate to="/404" replace />} />
      </Routes>
        </Suspense>
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
    <ErrorBoundary>
      <ClerkProvider>
        <AppContent />
      </ClerkProvider>
    </ErrorBoundary>
  )
}
