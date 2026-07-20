# 🚀 Getting Started with Marsad Development

A quick reference guide for developers starting work on the Marsad SaaS platform.

---

## 📦 Installation

```bash
# Clone and navigate to project
cd marsd

# Install dependencies
npm install

# Start development server
npm run dev

# Server runs at: http://localhost:3002
```

---

## 📚 Documentation First

Before writing code, read these documents in order:

1. **README.md** - Project overview and feature list
2. **PROJECT_ARCHITECTURE.md** - How the codebase is organized
3. **DEVELOPMENT_GUIDE.md** - Coding standards and best practices
4. **ENTERPRISE_REFACTOR_SUMMARY.md** - What has been implemented

---

## 🏗️ Understanding the Structure

### Quick Tour

```
src/
├── components/common/          ← Reusable UI parts (Button, Card, etc.)
├── components/layout/          ← Page shells (headers, sidebars)
├── pages/                       ← Full pages (Landing, Dashboard, etc.)
├── services/                    ← Business logic (auth, company data)
├── hooks/                       ← Custom React hooks
├── context/                     ← Global state (Auth, UI)
├── constants/                   ← Design system (colors, spacing)
├── utils/                       ← Helper functions
├── styles/                      ← Global CSS
├── data/                        ← Mock data
├── App.jsx                      ← Main routing
└── main.jsx                     ← Entry point
```

### Key Exports

**To import components:**
```javascript
import { Button, Card, FormField } from '../components/common'
```

**To import services:**
```javascript
import { authService, companyService } from '../services'
```

**To import hooks:**
```javascript
import { useFormState, useAuth } from '../hooks'
```

**To import constants:**
```javascript
import { COLORS, SPACING, TYPOGRAPHY } from '../constants'
```

**To import utilities:**
```javascript
import { validateEmail, formatDate } from '../utils'
```

---

## 🎨 Using the Design System

### Colors
```javascript
import { COLORS } from '../constants/colors'

// Use predefined colors
style={{ background: COLORS.primary }}    // Navy (#1E2A52)
style={{ color: COLORS.textSecondary }}   // #475569
style={{ border: `1px solid ${COLORS.border}` }} // #E2E8F0
```

### Spacing
```javascript
import { SPACING, BORDER_RADIUS } from '../constants/spacing'

// Use predefined spacing
style={{
  padding: SPACING.xl,              // 28px
  marginBottom: SPACING.lg,          // 20px
  borderRadius: BORDER_RADIUS.lg     // 14px
}}
```

### Typography
```javascript
import { TYPOGRAPHY, PRESET_STYLES } from '../constants/typography'

// Use preset text styles
const headingStyle = PRESET_STYLES.h1  // 46px, 900, navy
const bodyStyle = PRESET_STYLES.body   // 16px, 400, #475569
```

---

## 🔧 Common Tasks

### Creating a New Page

**Step 1: Create the file**
```jsx
// src/pages/company/NewFeature.jsx
import { Button, Card } from '../../components/common'
import { COLORS, SPACING } from '../../constants'
import { companyService } from '../../services'

export default function NewFeature() {
  return (
    <main style={{ padding: SPACING.sectionPadding }}>
      <h1>New Feature</h1>
    </main>
  )
}
```

**Step 2: Add route in App.jsx**
```jsx
{isLoggedIn && !isAdmin ? (
  <Route path="/new-feature" element={<NewFeature />} />
) : null}
```

**Step 3: Add navigation link** (if needed)
```jsx
onClick={() => navigate('/new-feature')}
```

### Creating a Reusable Component

**Step 1: Create component**
```jsx
// src/components/common/Badge.jsx
import { COLORS, SPACING } from '../../constants'

export default function Badge({ label, variant = 'default' }) {
  const variants = {
    default: { bg: COLORS.bgLight, text: COLORS.textPrimary },
    success: { bg: COLORS.successLight, text: COLORS.success }
  }

  const v = variants[variant]

  return (
    <span style={{
      background: v.bg,
      color: v.text,
      padding: `${SPACING.sm} ${SPACING.md}`,
      borderRadius: '999px',
      fontSize: '12px',
      fontWeight: 700
    }}>
      {label}
    </span>
  )
}
```

**Step 2: Export from index.js**
```javascript
// src/components/common/index.js
export { default as Badge } from './Badge'
```

**Step 3: Use in other components**
```jsx
import { Badge } from '../components/common'

<Badge label="Active" variant="success" />
```

### Working with Forms

**Use the custom hook:**
```jsx
import { useFormState } from '../hooks'
import { FormField, Button } from '../components/common'

export default function MyForm() {
  const { 
    values, 
    errors, 
    touched,
    handleChange, 
    handleBlur, 
    handleSubmit 
  } = useFormState(
    { email: '', password: '' },
    async (values) => {
      // Submit logic
    },
    (values) => {
      const errors = {}
      if (!values.email) errors.email = 'Email required'
      return errors
    }
  )

  return (
    <form onSubmit={handleSubmit}>
      <FormField
        label="Email"
        name="email"
        type="email"
        value={values.email}
        onChange={handleChange}
        onBlur={handleBlur}
        error={touched.email && errors.email}
      />
      <Button type="submit">Submit</Button>
    </form>
  )
}
```

### Using Authentication

**Access auth state:**
```jsx
import { useAuth } from '../hooks'

export default function Profile() {
  const { user, isAuthenticated, logout } = useAuth()

  if (!isAuthenticated) return <div>Please login</div>

  return (
    <div>
      <h1>Welcome, {user.name}</h1>
      <button onClick={logout}>Logout</button>
    </div>
  )
}
```

### Calling Services

**Example: Search companies**
```jsx
import { companyService } from '../services'
import { useState } from 'react'

export default function CompanySearch() {
  const [results, setResults] = useState([])

  const handleSearch = async (query) => {
    const companies = await companyService.searchCompanies(query)
    setResults(companies)
  }

  return (
    <div>
      <input 
        onKeyUp={(e) => handleSearch(e.target.value)}
        placeholder="Search..."
      />
      {results.map(c => <div key={c.id}>{c.name}</div>)}
    </div>
  )
}
```

---

## 🎯 Before You Commit

### Checklist

- [ ] Code follows naming conventions from DEVELOPMENT_GUIDE.md
- [ ] Using constants instead of hardcoded values
- [ ] Components are small and focused
- [ ] No code duplication (refactor if repeating)
- [ ] Styles use design constants
- [ ] Proper imports from index.js files
- [ ] JSDoc comments for complex functions
- [ ] No console.log statements
- [ ] No commented-out code
- [ ] RTL text renders correctly
- [ ] Mobile responsive layout works
- [ ] Page matches approved design (pixel-perfect)
- [ ] No console errors or warnings

### Git Commit

```bash
# Follow format from DEVELOPMENT_GUIDE.md
git add .
git commit -m "feat(component-name): brief description"
git push
```

---

## 🛠️ Useful Commands

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Format code (if configured)
npm run format

# Run tests (if configured)
npm run test
```

---

## 🎨 Design Tokens Reference

### Colors (Most Common)
```javascript
COLORS.navy          // #1E2A52 (Primary brand color)
COLORS.green         // #16A34A (CTA, success)
COLORS.sky           // #F8FAFC (Background)
COLORS.bgWhite       // #fff (Card background)
COLORS.textPrimary   // #1E2A52 (Main headings)
COLORS.textSecondary // #475569 (Body text)
COLORS.border        // #E2E8F0 (Card borders)
```

### Spacing (Most Common)
```javascript
SPACING.sm      // 8px
SPACING.md      // 14px
SPACING.lg      // 20px
SPACING.xl      // 28px
SPACING.xxl     // 32px
```

### Border Radius (Most Common)
```javascript
BORDER_RADIUS.md    // 10px (Inputs)
BORDER_RADIUS.lg    // 14px (Cards)
BORDER_RADIUS.xl    // 18px (Large cards)
BORDER_RADIUS.2xl   // 20px (Very large)
```

---

## 🔍 Troubleshooting

### Styles not applying?
- ✅ Make sure you're importing from `constants/`
- ✅ Check the prop name (camelCase in JS, not kebab-case)
- ✅ Verify the component is receiving the style prop correctly

### Component not found?
- ✅ Check the import path is correct
- ✅ Verify component is exported from `index.js`
- ✅ Make sure the filename matches the component name (PascalCase)

### Service not working?
- ✅ Check imports from `services/index.js`
- ✅ Verify the service method exists
- ✅ Currently services return mock data - not integrated with backend yet

### Form not validating?
- ✅ Make sure you're passing the `validate` function to `useFormState`
- ✅ Check that field names match in form data and validation
- ✅ Verify error display with `touched[fieldName]`

---

## 📊 Project Architecture at a Glance

```
User Action
    ↓
Component (Page or Section)
    ↓
Handler/Hook (useFormState, useAuth)
    ↓
Service (authService, companyService)
    ↓
API Call (when backend ready)
    ↓
Response
    ↓
Store in Context/State
    ↓
Re-render Component
```

---

## 🚀 Next Features to Build

1. **Complete Company Dashboard** - Use existing page structure
2. **Complete Admin Dashboard** - Use existing page structure
3. **Add Backend Integration** - Replace mock services
4. **Add Database** - Implement Prisma ORM
5. **Add Testing** - Unit and integration tests
6. **Add Error Handling** - Proper error boundaries
7. **Add Loading States** - Loading indicators
8. **Add Authentication** - JWT implementation

---

## 📞 Quick Reference

| Need | Where to Find | How to Import |
|------|---------------|---------------|
| Button component | `components/common/` | `import { Button } from '../components/common'` |
| Company search | `services/` | `import { companyService } from '../services'` |
| Form state | `hooks/` | `import { useFormState } from '../hooks'` |
| Navy color | `constants/` | `import { COLORS } from '../constants'` |
| Validation | `utils/` | `import { validateEmail } from '../utils'` |
| Auth state | `context/` | `import { useAuth } from '../hooks'` |

---

## 🎓 Learning Resources

- **React Docs**: https://react.dev
- **React Router**: https://reactrouter.com
- **Vite**: https://vitejs.dev
- **NPM Scripts**: Run `npm run --list` to see all available commands

---

## ✅ You're Ready!

You now have:
- ✅ Understanding of project structure
- ✅ Knowledge of design system
- ✅ Templates for common tasks
- ✅ Reference for imports and usage
- ✅ Troubleshooting guide

**Happy coding!** 🚀

For detailed information:
- 📐 See `PROJECT_ARCHITECTURE.md`
- 📝 See `DEVELOPMENT_GUIDE.md`
- 📖 See `README.md`

---

**Last Updated**: July 11, 2026  
**Project**: Marsad SaaS Platform  
**Quality**: Enterprise Grade
