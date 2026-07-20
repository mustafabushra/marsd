# Authentication Infrastructure Guide

## Overview

A complete, production-ready authentication system for the Marsad application with centralized state management, JWT token handling, and automatic persistence.

**Key Features:**
- Centralized authentication context
- JWT token persistence across page reloads
- Automatic token validation on app start
- 401 error handling and logout
- Role-based access control (admin vs company users)
- Automatic JWT injection on all API requests
- Loading states and error handling

---

## Architecture

### Component Hierarchy

```
App.jsx
├── AuthProvider (context wrapper)
│   └── AppContent
│       ├── BrowserRouter
│       └── Routes (protected based on auth state)
│           ├── VisitorShell (public routes)
│           ├── CompanyShell (private routes)
│           └── AdminShell (admin routes)
```

### Data Flow

```
User Action (Login)
    ↓
Login Page → useAuth.login()
    ↓
lib/api.login() → stores tokens & user
    ↓
AuthContext state updated
    ↓
localStorage updated
    ↓
Routes re-evaluated
    ↓
User navigated to /dashboard
```

---

## Core Files

### 1. **src/context/AuthContext.jsx**
Centralized authentication state management

**Exports:**
- `AuthProvider` - Wrapper component
- `useAuth()` - Hook to access auth state

**State:**
```javascript
{
  user,           // User object with id, email, role, etc.
  token,          // Current access token
  isLoggedIn,     // Boolean flag
  isAdmin,        // Boolean flag for role checking
  isLoading,      // Loading state during auth operations
  error,          // Error messages
}
```

**Functions:**
- `login(email, password)` - Authenticate user
- `register(data)` - Create new company account
- `logout()` - Clear session and localStorage
- `getToken()` - Get current token

**Lifecycle:**
```javascript
// On app start:
useEffect(() => {
  // 1. Load token from localStorage
  // 2. Load user from localStorage
  // 3. Validate token isn't expired
  // 4. Set state
  // 5. Listen for 401 logout events
}, [])
```

### 2. **src/lib/api.ts**
API client with JWT interceptor

**Token Management Functions:**
```javascript
// Storage functions
getToken()              // Returns access token or null
setToken(token)         // Stores token in localStorage
getRefreshToken()       // Returns refresh token or null
setRefreshToken(token)  // Stores refresh token
getUser()               // Returns parsed user object
setUser(user)           // Stores user as JSON
clearAuth()             // Clears all auth data
```

**API Features:**
```javascript
// Automatic JWT injection
// Before: fetch('/api/companies')
// After: fetch with headers: Authorization: Bearer {token}

// 401 handling
if (response.status === 401) {
  clearAuth()
  window.dispatchEvent(new Event('auth:logout'))
  throw new Error('Token expired')
}

// Token validation
function isTokenExpired(token) {
  // Decodes JWT payload
  // Checks if exp < current time
  // Considers <1 min left as expired
}
```

### 3. **src/App.jsx**
Application root with auth provider

**Structure:**
```javascript
export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}

function AppContent() {
  const { isLoggedIn, isAdmin, user, logout, isLoading } = useAuth()
  
  // Show loading state while initializing
  if (isLoading) return <LoadingScreen />
  
  // Render routes based on auth state
  return <BrowserRouter>
    <Routes>
      {/* Public routes always visible */}
      <Route element={<VisitorShell />}>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
      </Route>
      
      {/* Protected company routes */}
      {isLoggedIn && !isAdmin && (
        <Route element={<CompanyShell user={user} onLogout={logout} />}>
          <Route path="/dashboard" element={<CompanyDashboard />} />
          {/* ... other company routes */}
        </Route>
      )}
      
      {/* Protected admin routes */}
      {isLoggedIn && isAdmin && (
        <Route element={<AdminShell user={user} onLogout={logout} />}>
          <Route path="/admin" element={<AdminDashboard />} />
          {/* ... other admin routes */}
        </Route>
      )}
    </Routes>
  </BrowserRouter>
}
```

### 4. **src/pages/Login.jsx**
User login page

```javascript
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { login, isLoading } = useAuth()
  
  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      await login(email, password)
      navigate('/dashboard')
    } catch (err) {
      setError(err.message)
    }
  }
  
  return (
    <form onSubmit={handleSubmit}>
      <input type="email" value={email} onChange={...} />
      <input type="password" value={password} onChange={...} />
      <button disabled={isLoading}>
        {isLoading ? 'جاري التحقق...' : 'تسجيل الدخول'}
      </button>
    </form>
  )
}
```

### 5. **src/pages/Register.jsx**
Company registration page

```javascript
import { useAuth } from '../context/AuthContext'

export default function Register() {
  const { register, isLoading } = useAuth()
  
  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      await register({
        name: formData.company,
        email: formData.email,
        crNumber: formData.commercialNumber,
        // ...
      })
      navigate('/dashboard')
    } catch (err) {
      setError(err.message)
    }
  }
  
  return (
    <form onSubmit={handleSubmit}>
      {/* form fields */}
      <button disabled={isLoading}>
        {isLoading ? 'جاري الإنشاء...' : 'إنشاء الحساب'}
      </button>
    </form>
  )
}
```

---

## Usage Examples

### Using useAuth in a Component

```javascript
import { useAuth } from '../context/AuthContext'

export default function Dashboard() {
  const { user, isLoggedIn, isAdmin, logout } = useAuth()
  
  if (!isLoggedIn) {
    return <Redirect to="/login" />
  }
  
  return (
    <div>
      <h1>Welcome, {user.email}</h1>
      <p>User ID: {user.id}</p>
      <p>Role: {user.role}</p>
      {isAdmin && <p>You are an admin</p>}
      <button onClick={logout}>Logout</button>
    </div>
  )
}
```

### Making Authenticated API Calls

```javascript
import * as api from '../lib/api'

export default function MyReports() {
  const [reports, setReports] = useState([])
  
  useEffect(() => {
    // Token is automatically attached by getMyReports()
    api.getMyReports()
      .then(res => setReports(res.data))
      .catch(err => {
        // 401 errors trigger logout automatically
        console.error(err)
      })
  }, [])
  
  return (
    <ul>
      {reports.map(report => <li key={report.id}>{report.id}</li>)}
    </ul>
  )
}
```

### Custom API Request

```javascript
import * as api from '../lib/api'

// Get current token
const token = api.getToken()
console.log('Current token:', token)

// Clear auth and logout
api.clearAuth()
// This triggers auth:logout event, causing AuthContext to update
```

---

## Edge Cases & Error Handling

### 1. Token Expiration

**Flow:**
1. User makes API call
2. Server returns 401 Unauthorized
3. API client catches 401, clears auth
4. Dispatches `auth:logout` event
5. AuthContext catches event, updates state
6. User redirected to login page

**Code:**
```javascript
// In lib/api.ts
if (response.status === 401) {
  clearAuth()
  window.dispatchEvent(new Event('auth:logout'))
  throw new Error('Token expired')
}

// In AuthContext.jsx
useEffect(() => {
  const handleLogout = () => logout()
  window.addEventListener('auth:logout', handleLogout)
  return () => window.removeEventListener('auth:logout', handleLogout)
}, [])
```

### 2. Page Reload

**Flow:**
1. User refreshes page
2. App mounts
3. AuthProvider initializes
4. Reads token from localStorage
5. Reads user from localStorage
6. Sets auth state
7. Routes re-evaluate based on new state

**Code:**
```javascript
// In AuthContext.jsx
useEffect(() => {
  initializeAuth() // Runs on mount
  // Loads from localStorage
}, [])
```

### 3. Multiple Tabs

**Flow:**
1. User logs out in Tab A
2. Tab A clears localStorage
3. Tab B makes API call
4. Server returns 401
5. Tab B clears auth
6. Tab B dispatches auth:logout event
7. Tab B's useAuth catches event and updates state
8. Tab B redirects to login

**Note:** localStorage changes are NOT automatically synced across tabs. If you need this, add:
```javascript
window.addEventListener('storage', (e) => {
  if (e.key === 'accessToken' && !e.newValue) {
    logout()
  }
})
```

### 4. Network Errors

**Handled by:**
```javascript
try {
  await login(email, password)
} catch (err) {
  setError(err.message)
  // Component displays error to user
}
```

---

## Token Structure

### JWT Payload (Mock)
```json
{
  "id": "tenant-1",
  "email": "test1@marsad.sa",
  "firstName": "مدير",
  "role": "company_admin",
  "tenantId": "tenant-1",
  "exp": 1723305600,
  "iat": 1723219200
}
```

### Storage in localStorage
```
Key: "accessToken"
Value: "mock-jwt-token-test1"

Key: "refreshToken"
Value: "mock-refresh-token-test1"

Key: "user"
Value: '{"id":"tenant-1","email":"test1@marsad.sa",...}'

Key: "tokenExpiry"
Value: "1723305600"
```

---

## Test Credentials

**Company User:**
```
Email: test1@marsad.sa
Password: Test@1234
Role: company_admin
```

**Company User 2:**
```
Email: test2@marsad.sa
Password: Test@1234
Role: company_admin
```

**Admin Access:**
- Click "دخول الإدارة" button on login page
- Uses test1@marsad.sa credentials

---

## Security Considerations

### 1. Token Storage
- Tokens stored in localStorage (NOT httpOnly cookies in this implementation)
- Suitable for development and internal SPAs
- For production: Use httpOnly cookies with CSRF protection

### 2. Token Validation
- Client-side expiration check (cosmetic)
- Server must validate every token
- Server returns 401 if token invalid

### 3. Secrets
- Never commit real API keys or secrets
- Use environment variables: `process.env.REACT_APP_API_KEY`

### 4. HTTPS
- Always use HTTPS in production
- Prevents token interception

### 5. CORS
- Configure backend to allow origin
- Include credentials: `credentials: 'include'`

---

## Backend Integration

### Replacing Mock Data

**Current:**
```javascript
// src/lib/api.ts
export async function login(email, password) {
  await new Promise(r => setTimeout(r, 500))
  if (email === 'test1@marsad.sa' && password === 'Test@1234') {
    return { accessToken: 'mock-...', user: {...} }
  }
  throw new Error('Invalid credentials')
}
```

**Replace with:**
```javascript
export async function login(email, password) {
  const response = await apiRequest('http://localhost:3333/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  })
  
  if (!response.ok) throw new Error('Login failed')
  
  const data = await response.json()
  setToken(data.accessToken)
  setRefreshToken(data.refreshToken)
  setUser(data.user)
  return data
}
```

### Expected Backend Endpoints

```
POST /api/auth/login
  Request: { email, password }
  Response: { accessToken, refreshToken, user }

POST /api/auth/register
  Request: { name, email, crNumber, password, ... }
  Response: { accessToken, refreshToken, tenant }

POST /api/auth/refresh
  Request: { refreshToken }
  Response: { accessToken }

GET /api/companies
  Headers: Authorization: Bearer {token}
  Response: { data: [...] }
```

---

## Debugging

### Check Current Auth State
```javascript
// In browser console
localStorage.getItem('accessToken')
localStorage.getItem('user')
JSON.parse(localStorage.getItem('user'))
```

### Monitor Auth Events
```javascript
// In component
window.addEventListener('auth:logout', () => {
  console.log('User logged out')
})
```

### Decode Token Payload
```javascript
function decodeToken(token) {
  const parts = token.split('.')
  return JSON.parse(atob(parts[1]))
}

const payload = decodeToken(localStorage.getItem('accessToken'))
console.log('Token expires at:', new Date(payload.exp * 1000))
```

---

## Checklist for Production

- [ ] Replace mock data with real API endpoints
- [ ] Configure backend CORS
- [ ] Test token refresh flow
- [ ] Test logout from all tabs
- [ ] Test 401 error handling
- [ ] Switch to httpOnly cookies (optional but recommended)
- [ ] Add CSRF protection if needed
- [ ] Enable HTTPS
- [ ] Test on staging environment
- [ ] Monitor auth errors in production

---

## API Functions Reference

### Authentication

```javascript
import * as api from '../lib/api'

// Login
await api.login('email@example.com', 'password')
// Returns: { accessToken, refreshToken, user }

// Register
await api.register({
  name: 'Company Name',
  email: 'company@example.com',
  crNumber: '1010123456',
  // ...
})
// Returns: { message, accessToken, refreshToken, tenant }

// Logout
api.clearAuth()
// Clears localStorage
```

### Companies

```javascript
// Search companies
await api.searchCompanies('search term', page, limit)
// Returns: { data: [...], pagination: {...} }

// Get company report
await api.getCompanyReport(companyId, planName)
// Returns: { company, trustScore, status, ... }
```

### Reports

```javascript
// Submit report
await api.submitReport({
  targetCompanyId: '1',
  paymentCommitment: 'full',
  // ...
})
// Returns: { id, status, ... }

// Get my reports
await api.getMyReports()
// Returns: { data: [...] }
```

### Watchlist

```javascript
// Add to watchlist
await api.addToWatchlist(companyId)
// Returns: { id, companyId, createdAt }

// Get watchlist
await api.getWatchlist()
// Returns: { data: [...] }
```

### Token Management

```javascript
// Get current token
const token = api.getToken()

// Get user from storage
const user = api.getUser()

// Clear all auth data
api.clearAuth()
```

---

## Related Files

- `/src/context/AuthContext.jsx` - Auth context provider
- `/src/lib/api.ts` - API client and token management
- `/src/App.jsx` - Root component with provider
- `/src/pages/Login.jsx` - Login page
- `/src/pages/Register.jsx` - Register page
- `/src/components/VisitorShell.jsx` - Public layout
- `/src/components/CompanyShell.jsx` - Private company layout
- `/src/components/AdminShell.jsx` - Admin layout

---

## Version History

- **v1.0** (2026-07-13) - Initial implementation
  - Centralized auth context
  - JWT token management
  - Automatic persistence
  - 401 error handling
  - Role-based routing

