# Authentication Infrastructure - Quick Start Guide

## What Was Built

A complete authentication system with:
- Centralized auth state management using React Context
- Automatic JWT token persistence to localStorage
- 401 error handling and automatic logout
- Role-based routing (admin vs company users)
- Automatic token injection on all API requests
- Loading states and comprehensive error handling

---

## Files Modified/Created

### Core Files

1. **src/context/AuthContext.jsx** (updated)
   - Complete auth context with state management
   - Handles initialization from localStorage
   - Provides `useAuth()` hook
   - Exports `AuthProvider` wrapper

2. **src/lib/api.ts** (updated)
   - Token management functions
   - JWT interceptor for all requests
   - 401 error handling
   - Token persistence utilities

3. **src/App.jsx** (updated)
   - Wrapped with `<AuthProvider>`
   - Routes protected based on auth state
   - Loading state during initialization
   - Role-based route rendering

4. **src/pages/Login.jsx** (updated)
   - Uses `useAuth()` hook
   - Automatic token persistence
   - Loading state handling
   - Admin login support

5. **src/pages/Register.jsx** (updated)
   - Uses `useAuth()` hook
   - Automatic token persistence
   - Form validation
   - Error handling

6. **src/AUTH_INFRASTRUCTURE.md** (created)
   - Complete documentation
   - Architecture diagrams
   - Usage examples
   - Backend integration guide
   - Security considerations

---

## How It Works

### Login Flow

```
User enters email/password
        ↓
Click "تسجيل الدخول"
        ↓
useAuth.login(email, password)
        ↓
lib/api.login() calls mock API
        ↓
Token + user stored in localStorage
        ↓
AuthContext state updated
        ↓
Navigate to /dashboard
```

### Protected Routes

```
AuthProvider initializes
        ↓
Reads token from localStorage
        ↓
Sets isLoggedIn, isAdmin flags
        ↓
Routes re-evaluated
        ↓
User sees dashboard (if logged in)
        ↓
User sees login page (if not logged in)
```

### API Requests

```
Component calls: api.getMyReports()
        ↓
JWT automatically attached as Bearer token
        ↓
Request: GET /api/reports
         Headers: Authorization: Bearer {token}
        ↓
Response received
        ↓
If 401: Auth cleared, user logged out
```

---

## Using in Components

### Access Auth State

```javascript
import { useAuth } from '../context/AuthContext'

export default function MyComponent() {
  const { user, isLoggedIn, isAdmin, logout, getToken } = useAuth()
  
  if (!isLoggedIn) {
    return <p>Please login</p>
  }
  
  return (
    <div>
      <p>User: {user.email}</p>
      <p>Admin: {isAdmin}</p>
      <button onClick={logout}>Logout</button>
    </div>
  )
}
```

### Make Authenticated API Calls

```javascript
import { useEffect, useState } from 'react'
import * as api from '../lib/api'

export default function Reports() {
  const [reports, setReports] = useState([])
  
  useEffect(() => {
    // Token automatically attached
    api.getMyReports()
      .then(res => setReports(res.data))
      .catch(err => console.error(err)) // 401 auto-handled
  }, [])
  
  return <ul>{reports.map(r => <li key={r.id}>{r.id}</li>)}</ul>
}
```

---

## Test Credentials

### Company User
```
Email: test1@marsad.sa
Password: Test@1234
Role: company_admin
```

### Admin User
```
Click "دخول الإدارة" button on login page
Or manually login with test1@marsad.sa
```

### Test Flow

1. Go to http://localhost:5173/login
2. Enter test1@marsad.sa / Test@1234
3. Click تسجيل الدخول
4. Redirect to /dashboard
5. Refresh page → stays logged in (token persisted)
6. Check localStorage → see accessToken, user
7. Click logout → cleared from storage and state
8. Try accessing /dashboard → redirected to /login

---

## What Happens On:

### Page Reload
- Token loaded from localStorage
- User loaded from localStorage
- Auth state restored
- Routes re-evaluated
- No need to login again

### 401 Response
- API client catches error
- localStorage cleared
- auth:logout event dispatched
- AuthContext updates state
- User redirected to login

### Tab Close
- localStorage persists
- Next login uses same credentials
- Token still valid across sessions

### Logout Click
- localStorage cleared
- State cleared
- Routes re-evaluated
- User sees login page

---

## API Functions

### Authentication
```javascript
import * as api from '../lib/api'

// Login
const response = await api.login('email@example.com', 'password')
// Returns: { accessToken, refreshToken, user }

// Register
const response = await api.register({ name, email, crNumber, ... })
// Returns: { message, accessToken, refreshToken, tenant }

// Clear auth
api.clearAuth()
// Clears localStorage
```

### Company Data
```javascript
// Search
const result = await api.searchCompanies('query', page, limit)

// Get report
const report = await api.getCompanyReport(companyId, planName)
```

### Reports
```javascript
// Submit
const report = await api.submitReport({ targetCompanyId, ... })

// Get my reports
const result = await api.getMyReports()
```

### Watchlist
```javascript
// Add
const item = await api.addToWatchlist(companyId)

// Get all
const result = await api.getWatchlist()
```

---

## Debugging

### Check Current Auth
```javascript
// Browser console
localStorage.getItem('accessToken')
localStorage.getItem('user')
JSON.parse(localStorage.getItem('user'))
```

### Monitor State
```javascript
// In component
import { useAuth } from '../context/AuthContext'

export default function Debug() {
  const auth = useAuth()
  console.log('Auth state:', auth)
  return <pre>{JSON.stringify(auth, null, 2)}</pre>
}
```

### Decode Token
```javascript
const token = localStorage.getItem('accessToken')
const parts = token.split('.')
const payload = JSON.parse(atob(parts[1]))
console.log('Expires at:', new Date(payload.exp * 1000))
```

---

## Common Issues

### "useAuth must be used within AuthProvider"
- AuthProvider not wrapping component
- Fix: Check App.jsx has `<AuthProvider><AppContent /></AuthProvider>`

### Token not persisting
- localStorage not enabled
- Incognito mode might clear storage
- Check browser DevTools → Application → localStorage

### 401 errors not handled
- API endpoint not returning 401 correctly
- Check response status in Network tab
- Ensure backend sends 401 for invalid tokens

### Routes not updating
- AuthContext not being read in App.jsx
- Fix: Use `const { isLoggedIn, isAdmin } = useAuth()` in AppContent

---

## For Production

1. **Replace Mock API**
   - Update src/lib/api.ts
   - Replace mock functions with real API calls
   - Use actual backend URLs

2. **Environment Variables**
   ```javascript
   const API_BASE_URL = process.env.REACT_APP_API_URL
   ```

3. **Token Refresh**
   - Add refresh token logic
   - Auto-refresh before expiry

4. **Security**
   - Use httpOnly cookies (not localStorage)
   - Enable CSRF protection
   - Use HTTPS only
   - Set secure headers

5. **Error Logging**
   - Log auth failures
   - Monitor 401 errors
   - Track user sessions

---

## Next Steps

### Immediate
1. Test login/register flows
2. Verify token persistence
3. Check protected routes work
4. Test logout clears everything

### Short Term
1. Connect to real backend
2. Test token refresh
3. Add password reset
4. Add email verification

### Long Term
1. Implement 2FA
2. Add session management
3. Add audit logging
4. Implement role-based access control

---

## File Locations

```
marsd/
├── src/
│   ├── context/
│   │   └── AuthContext.jsx          (updated)
│   ├── lib/
│   │   └── api.ts                   (updated)
│   ├── pages/
│   │   ├── Login.jsx                (updated)
│   │   └── Register.jsx             (updated)
│   ├── App.jsx                      (updated)
│   └── AUTH_INFRASTRUCTURE.md       (created)
└── AUTH_QUICK_START.md              (created - this file)
```

---

## Support

For detailed information, see:
- **Documentation**: src/AUTH_INFRASTRUCTURE.md
- **Context**: src/context/AuthContext.jsx
- **API**: src/lib/api.ts
- **Usage**: src/pages/Login.jsx, Register.jsx

