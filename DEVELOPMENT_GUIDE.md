# Development Guide - Marsad SaaS Platform

This guide outlines coding standards, best practices, and workflow for developing Marsad.

## 🎯 Core Principles

1. **Pixel-Perfect Design**: All UIs must match the approved design exactly
2. **Clean Architecture**: Separation of concerns, no mixed responsibilities
3. **Reusable Components**: Build once, use everywhere
4. **Type Safety**: Clear naming, documentation, and constants
5. **Enterprise Quality**: Production-ready, maintainable code
6. **No Duplication**: DRY principle throughout

## 📐 Code Standards

### Component Structure

```jsx
// 1. Imports
import { useState } from 'react'
import { Button, Card } from '../components/common'
import { COLORS, SPACING } from '../constants'
import { formatDate } from '../utils'

// 2. Component definition
export default function ComponentName({ prop1, prop2 }) {
  // 3. Hooks
  const [state, setState] = useState(null)

  // 4. Handlers
  const handleClick = () => {
    // Logic here
  }

  // 5. Render
  return (
    <div style={{ ...SPACING.section }}>
      {/* JSX here */}
    </div>
  )
}
```

### Naming Conventions

**Files & Directories**
```
components/
├── common/Button.jsx           # PascalCase for components
├── common/index.js             # Export file
services/authService.js         # camelCase + Service suffix
hooks/useFormState.js           # camelCase + use prefix
utils/validation.js             # camelCase for utilities
constants/colors.js             # camelCase for files
```

**Variables & Functions**
```javascript
// Constants
const MAX_COMPANY_NAME_LENGTH = 100
const COLORS = { primary: '#16A34A' }

// Variables
const userName = 'أحمد'
const isLoading = false
const userData = { id: 1, name: 'أحمد' }

// Functions
const formatDate = (date) => { ... }
const validateEmail = (email) => { ... }
const handleSubmit = () => { ... }
```

### Styling Guidelines

**Use design constants**
```jsx
import { COLORS, SPACING, TYPOGRAPHY, BORDER_RADIUS } from '../constants'

// ✅ Good
<div style={{
  padding: SPACING.xl,
  background: COLORS.bgWhite,
  borderRadius: BORDER_RADIUS.lg,
  color: COLORS.textPrimary
}}>

// ❌ Bad - Hardcoded values
<div style={{
  padding: '28px',
  background: '#fff',
  borderRadius: '14px',
  color: '#1E2A52'
}}>
```

**Reuse button variants**
```jsx
import { Button } from '../components/common'

// ✅ Good
<Button variant="primary">Save</Button>
<Button variant="secondary">Cancel</Button>

// ❌ Bad - Inline styling
<button style={{ background: '#16A34A' }}>Save</button>
```

## 🔧 Development Workflow

### Adding a New Page

1. **Create the component file**
   ```
   src/pages/company/NewPage.jsx
   ```

2. **Import necessary dependencies**
   ```jsx
   import { useState } from 'react'
   import { Button, Card } from '../components/common'
   import { companyService } from '../services'
   ```

3. **Use design constants**
   ```jsx
   import { COLORS, SPACING } from '../constants'
   ```

4. **Structure the component**
   ```jsx
   export default function NewPage() {
     const [data, setData] = useState(null)
     
     return (
       <main style={{ padding: SPACING.sectionPadding }}>
         {/* Page content */}
       </main>
     )
   }
   ```

5. **Add route in App.jsx**
   ```jsx
   {isLoggedIn && isAdmin ? (
     <Route path="/admin/new" element={<NewPage />} />
   ) : null}
   ```

### Adding a New Component

1. **Determine correct directory**
   - Shared UI → `components/common/`
   - Page sections → `components/sections/`
   - Forms → `components/forms/`
   - Cards → `components/cards/`

2. **Create component file** (PascalCase)
   ```
   src/components/common/Badge.jsx
   ```

3. **Build with reusability in mind**
   ```jsx
   export default function Badge({ 
     label, 
     variant = 'default',
     size = 'md'
   }) {
     // Implementation
   }
   ```

4. **Export from index.js**
   ```javascript
   // components/common/index.js
   export { default as Badge } from './Badge'
   ```

5. **Use in other components**
   ```jsx
   import { Badge } from '../components/common'
   ```

### Adding a New Service

1. **Create service file**
   ```
   src/services/reportService.js
   ```

2. **Document each method**
   ```javascript
   /**
    * Generate trust report for company
    * @param {number} companyId - Company ID
    * @returns {Promise<Object>} Report data
    */
   export const reportService = {
     generateReport: async (companyId) => {
       // Implementation
     }
   }
   ```

3. **Export from services/index.js**
   ```javascript
   export { reportService } from './reportService'
   ```

## 🧪 Testing Checklist

Before committing changes:

- [ ] Component renders without errors
- [ ] All props are used correctly
- [ ] Styling matches design exactly (pixel-perfect)
- [ ] No console warnings or errors
- [ ] RTL text displays correctly
- [ ] Responsive design works on mobile
- [ ] All interactive elements respond to clicks
- [ ] Form validation works
- [ ] Error states display correctly
- [ ] Loading states display correctly
- [ ] Accessibility (keyboard navigation, screen reader friendly)

## 📝 Code Review Checklist

When reviewing code:

- [ ] Follows naming conventions
- [ ] Uses constants instead of hardcoded values
- [ ] Components are focused and single-responsibility
- [ ] No duplicate code
- [ ] Proper error handling
- [ ] Comments for complex logic
- [ ] Exports are clean and organized
- [ ] Imports are organized (React → local → components)
- [ ] No console.log statements in production code
- [ ] No commented-out code
- [ ] Functions are pure (no side effects)
- [ ] Props are documented
- [ ] RTL support verified

## 🚫 Anti-Patterns to Avoid

```javascript
// ❌ Hardcoded values
const padding = '28px'
const bgColor = '#fff'

// ✅ Use constants
import { SPACING, COLORS } from '../constants'
const padding = SPACING.xl
const bgColor = COLORS.bgWhite

---

// ❌ Logic in components
export default function UserList() {
  const [users, setUsers] = useState([])
  
  useEffect(() => {
    fetch('/api/users')
      .then(r => r.json())
      .then(setUsers)
  }, [])
}

// ✅ Logic in services
export default function UserList() {
  const [users, setUsers] = useState([])
  
  useEffect(() => {
    userService.fetchUsers().then(setUsers)
  }, [])
}

---

// ❌ Duplicated components
function PrimaryButton() { ... }
function SecondaryButton() { ... }

// ✅ Reusable component with variant
function Button({ variant = 'primary' }) { ... }

---

// ❌ No exports organization
export const A = () => { }
export const B = () => { }
export const C = () => { }

// ✅ Organized exports in index.js
export { A } from './A'
export { B } from './B'
export { C } from './C'
```

## 🔄 Updating Existing Code

**When refactoring:**

1. **Keep the UI identical** - Never change pixels or styling
2. **Maintain backward compatibility** - Don't break existing features
3. **Update only what's necessary** - Minimal changes
4. **Test thoroughly** - Verify all related features still work
5. **Update documentation** - If API changes, update comments

**When fixing bugs:**

1. **Locate the root cause** - Don't patch symptoms
2. **Fix in the right layer** - Component? Service? Utility?
3. **Add a comment explaining the fix** - For future developers
4. **Test edge cases** - Not just the reported case
5. **Verify no regressions** - Check related features

## 📚 Documentation Standards

### JSDoc Comments

```javascript
/**
 * Validates email format
 * @param {string} email - Email address to validate
 * @param {boolean} [strict=false] - Use strict validation rules
 * @returns {boolean} True if email is valid
 * @throws {Error} If email is not a string
 * @example
 * validateEmail('user@example.com') // true
 */
export const validateEmail = (email, strict = false) => {
  // Implementation
}
```

### Component Props Documentation

```jsx
/**
 * Reusable button component with multiple variants
 * @component
 * @example
 * return (
 *   <Button variant="primary" size="lg">
 *     Click me
 *   </Button>
 * )
 * @param {string} [variant='primary'] - Button style variant
 * @param {string} [size='md'] - Button size (sm, md, lg)
 * @param {Function} onClick - Click handler
 * @param {boolean} [disabled=false] - Disable button
 * @param {React.ReactNode} children - Button content
 */
export default function Button({ 
  variant = 'primary', 
  size = 'md',
  onClick,
  disabled = false,
  children 
}) { ... }
```

## 🚀 Performance Best Practices

1. **Memoize expensive computations**
   ```jsx
   import { useMemo } from 'react'
   
   const expensiveValue = useMemo(
     () => complexCalculation(data),
     [data]
   )
   ```

2. **Lazy load components**
   ```jsx
   import { lazy, Suspense } from 'react'
   
   const LargeComponent = lazy(() => import('./LargeComponent'))
   
   <Suspense fallback={<Loading />}>
     <LargeComponent />
   </Suspense>
   ```

3. **Avoid unnecessary re-renders**
   ```jsx
   const handleClick = useCallback(() => {
     // Handler implementation
   }, [dependencies])
   ```

## 📱 RTL & Internationalization

All text must support RTL:

```jsx
// ✅ Good - uses dir="rtl" at document level
<div>نص عربي يعمل بشكل صحيح</div>

// ✅ Good - direction-aware spacing
style={{
  marginRight: '10px'  // Works for RTL
}}

// ❌ Bad - left-aligned only
style={{
  marginLeft: '10px'  // Doesn't work for RTL
}}
```

## 🔐 Security Considerations

1. **Never hardcode sensitive data** - Use environment variables
2. **Sanitize user input** - Prevent XSS attacks
3. **Validate on both client and server** - Never trust client validation
4. **Use HTTPS** - For all API calls
5. **Store tokens securely** - Use httpOnly cookies when possible
6. **Handle errors safely** - Don't expose stack traces to users

## 📋 Commit Message Standards

```
Format: <type>(<scope>): <subject>

Types: feat, fix, docs, style, refactor, perf, test
Scope: component name or area (optional)
Subject: imperative, present tense, not capitalized

Examples:
- feat(Button): add loading state variant
- fix(LoginForm): prevent submit on validation error
- docs(README): update installation instructions
- refactor(authService): simplify token handling
```

## 🔗 Useful Resources

- Project Architecture: `PROJECT_ARCHITECTURE.md`
- Component Constants: `src/constants/`
- Design System: `src/styles/globals.css`
- Mock Data: `src/data/mockData.js`

---

**Remember**: This is a high-value production SaaS. Every line of code should reflect professional, enterprise-grade quality.
