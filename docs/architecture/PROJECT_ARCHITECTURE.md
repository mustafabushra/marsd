# Marsad - Project Architecture Documentation

## 📁 Directory Structure

```
marsd/
├── src/
│   ├── components/                 # Reusable UI components
│   │   ├── common/                 # Shared components across all shells
│   │   │   ├── Button.jsx          # Reusable button component
│   │   │   ├── Card.jsx            # Reusable card component
│   │   │   ├── FormField.jsx       # Form input wrapper
│   │   │   └── index.js            # Common components export
│   │   ├── layout/                 # Layout shells
│   │   │   ├── VisitorShell.jsx    # Visitor/Public layout
│   │   │   ├── CompanyShell.jsx    # Company dashboard layout
│   │   │   └── AdminShell.jsx      # Admin dashboard layout
│   │   ├── sections/               # Page sections (Hero, Features, etc.)
│   │   ├── forms/                  # Form-specific components
│   │   └── cards/                  # Specialized card components
│   │
│   ├── pages/                      # Page components
│   │   ├── visitor/                # Public pages
│   │   │   ├── Landing.jsx         # Landing page
│   │   │   ├── About.jsx           # About page
│   │   │   ├── Pricing.jsx         # Pricing page
│   │   │   ├── FAQ.jsx             # FAQ page
│   │   │   ├── Contact.jsx         # Contact page
│   │   │   ├── Login.jsx           # Login page
│   │   │   └── Register.jsx        # Registration page
│   │   ├── company/                # Company dashboard pages
│   │   │   ├── Dashboard.jsx       # Main company dashboard
│   │   │   ├── Search.jsx          # Company search
│   │   │   ├── AddCompany.jsx      # Add new company
│   │   │   ├── TrustReport.jsx     # Trust report view
│   │   │   ├── Watchlist.jsx       # Watched companies
│   │   │   ├── Compare.jsx         # Company comparison
│   │   │   ├── CompanyUsers.jsx    # Team management
│   │   │   ├── Subscription.jsx    # Billing & subscription
│   │   │   └── Profile.jsx         # User profile settings
│   │   └── admin/                  # Admin dashboard pages
│   │       ├── Dashboard.jsx       # Admin dashboard
│   │       ├── AdminRequests.jsx   # Company requests
│   │       ├── AdminReports.jsx    # Report review
│   │       ├── AdminBulkImport.jsx # Bulk import
│   │       ├── AdminCompanies.jsx  # Company management
│   │       ├── AdminUsers.jsx      # User management
│   │       └── AdminLogs.jsx       # System logs
│   │
│   ├── hooks/                      # Custom React hooks
│   │   ├── useFormState.js         # Form state management
│   │   └── index.js                # Hooks export
│   │
│   ├── context/                    # React Context API
│   │   ├── AuthContext.jsx         # Authentication state
│   │   └── UIContext.jsx           # UI state (theme, etc.)
│   │
│   ├── services/                   # Business logic & API
│   │   ├── authService.js          # Authentication logic
│   │   ├── companyService.js       # Company operations
│   │   └── index.js                # Services export
│   │
│   ├── utils/                      # Utility functions
│   │   ├── validation.js           # Form validation rules
│   │   ├── formatting.js           # Data formatting functions
│   │   └── index.js                # Utils export
│   │
│   ├── constants/                  # Application constants
│   │   ├── colors.js               # Color palette
│   │   ├── spacing.js              # Spacing & border radius
│   │   ├── typography.js           # Font sizes & styles
│   │   └── index.js                # Constants export
│   │
│   ├── styles/                     # Global CSS
│   │   ├── globals.css             # Global styles
│   │   ├── animations.css          # Keyframe animations
│   │   └── variables.css           # CSS custom properties
│   │
│   ├── data/                       # Mock data
│   │   └── mockData.js             # Mock data for development
│   │
│   ├── App.jsx                     # Main app component (routing)
│   └── main.jsx                    # React entry point
│
├── index.html                      # HTML entry point
├── vite.config.js                  # Vite configuration
├── package.json                    # Dependencies
└── PROJECT_ARCHITECTURE.md         # This file
```

## 🏗️ Architecture Principles

### 1. **Separation of Concerns**
- **Components**: UI rendering only
- **Services**: Business logic & API calls
- **Hooks**: Stateful logic reuse
- **Context**: Global state management
- **Utils**: Pure functions & helpers

### 2. **Component Hierarchy**

```
App (Routing)
├── AuthProvider (Global auth state)
│   ├── VisitorShell
│   │   ├── Landing
│   │   ├── About
│   │   ├── Pricing
│   │   ├── FAQ
│   │   ├── Contact
│   │   ├── Login
│   │   └── Register
│   │
│   ├── CompanyShell
│   │   ├── CompanyDashboard
│   │   ├── Search
│   │   ├── AddCompany
│   │   ├── TrustReport
│   │   ├── Watchlist
│   │   ├── Compare
│   │   ├── CompanyUsers
│   │   ├── Subscription
│   │   └── Profile
│   │
│   └── AdminShell
│       ├── AdminDashboard
│       ├── AdminRequests
│       ├── AdminReports
│       ├── AdminBulkImport
│       ├── AdminCompanies
│       ├── AdminUsers
│       └── AdminLogs
```

### 3. **Data Flow**

```
User Action → Component
           ↓
       Hook (useFormState)
           ↓
       Service (authService)
           ↓
       API Call (NestJS Backend)
           ↓
       Response
           ↓
       Context (AuthContext)
           ↓
       Component State Update
           ↓
       UI Render
```

### 4. **File Naming Conventions**

- **Components**: `PascalCase` (e.g., `Button.jsx`, `LoginForm.jsx`)
- **Hooks**: `camelCase` with `use` prefix (e.g., `useFormState.js`)
- **Services**: `camelCase` + `Service` suffix (e.g., `authService.js`)
- **Utils**: `camelCase` (e.g., `validation.js`, `formatting.js`)
- **Constants**: `SCREAMING_SNAKE_CASE` (e.g., `COLORS`, `SPACING`)

## 🎨 Design System Integration

### Colors (constants/colors.js)
- Primary: Navy (#1E2A52), Green (#16A34A)
- Text: Multiple levels (primary, secondary, tertiary, muted)
- Status: Success, warning, danger, info
- Backgrounds & borders

### Spacing (constants/spacing.js)
- Standardized padding/margin values (xs, sm, md, lg, xl, etc.)
- Border radius presets
- Gap utilities

### Typography (constants/typography.js)
- Font family: Tajawal
- Preset font sizes and weights
- Line height utilities
- Preset text styles (h1, h2, body, etc.)

## 🔄 State Management Pattern

### Local Component State
```jsx
const [value, setValue] = useState(initialValue)
```

### Form State
```jsx
const { values, errors, handleChange, handleSubmit } = useFormState(
  initialValues,
  onSubmit,
  validate
)
```

### Global State (Authentication)
```jsx
const { user, isAuthenticated, login, logout } = useAuth()
```

## 🔌 Services Integration

### Authentication Service
```javascript
authService.login(email, password)
authService.register(data)
authService.logout()
authService.getCurrentUser()
```

### Company Service
```javascript
companyService.searchCompanies(query)
companyService.getCompanyById(id)
companyService.getTrustReport(id)
companyService.addToWatchlist(id)
companyService.removeFromWatchlist(id)
```

## 📋 Component Guidelines

### Creating a New Component

1. **Place in correct directory**
   - Shared UI → `components/common/`
   - Layout → `components/layout/`
   - Forms → `components/forms/`
   - Sections → `components/sections/`

2. **Follow naming conventions**
   - Use PascalCase
   - Name should be descriptive

3. **Use constants from constants/**
   ```jsx
   import { COLORS, SPACING, TYPOGRAPHY } from '../constants'
   ```

4. **Export from index.js**
   ```javascript
   // components/common/index.js
   export { default as Button } from './Button'
   ```

### Creating a New Page

1. **Place in correct shell directory**
   - `pages/visitor/` for public pages
   - `pages/company/` for company dashboard
   - `pages/admin/` for admin pages

2. **Use layout shell**
   ```jsx
   // Automatically wrapped by VisitorShell, CompanyShell, or AdminShell
   ```

3. **Use common components**
   ```jsx
   import { Button, Card, FormField } from '../components/common'
   ```

4. **Use services for logic**
   ```jsx
   import { authService, companyService } from '../services'
   ```

## 🚀 Adding New Features

### Step 1: Create Service
Create logic in `services/featureService.js`

### Step 2: Create Component
Use `components/` with appropriate subdirectory

### Step 3: Create Page (if needed)
Place in correct `pages/` directory

### Step 4: Connect in Router
Update `App.jsx` routing

### Step 5: Update Exports
Update all `index.js` files

## 📦 Deployment Checklist

- [ ] All components follow naming conventions
- [ ] All constants centralized in `constants/`
- [ ] All business logic in `services/`
- [ ] No hardcoded values in components
- [ ] Proper error handling in services
- [ ] All exports in `index.js` files
- [ ] Comments for complex logic
- [ ] RTL support verified
- [ ] Mobile responsive tested
- [ ] API integration ready (NestJS)

## 🔗 Integration Points

### Backend (NestJS)
- Replace mock service calls with actual API endpoints
- Add error handling and retry logic
- Implement JWT token management
- Add request/response interceptors

### Database (PostgreSQL + Prisma)
- Prisma models for all entities
- Migrations for schema changes
- Database seeding for test data

## 📚 References

- React Documentation: https://react.dev
- React Router: https://reactrouter.com
- Vite: https://vitejs.dev
- NestJS: https://nestjs.com
- Prisma: https://www.prisma.io
