# 📊 Dashboard Pages Implementation Plan

**Objective**: Complete all Company Dashboard and Admin Dashboard pages using established design system and enterprise code standards.

**Timeline**: 2-3 days  
**Quality Level**: Enterprise Grade  
**Pages to Complete**: 16 total (9 Company + 7 Admin)

---

## 🎯 Company Dashboard Pages (9 pages)

### 1. Dashboard.jsx ✅ (Layout ready, needs refactor)
**Purpose**: Main overview with KPIs and activity feed
**Components**: 
- Page header with title and subtitle
- 4 KPI cards (grid layout)
- Activity feed timeline
- "Give to Get" contribution badge

**Using**:
- `Button` and `Card` from components/common/
- `COLORS`, `SPACING` from constants/
- mockData for KPIs and activity

---

### 2. Search.jsx ✅ (Layout ready, needs refactor)
**Purpose**: Search and filter companies by trust score
**Components**:
- Search input with placeholder
- Risk level filter dropdown
- Company results grid (trust gauge + info)
- Pagination or infinite scroll

**Using**:
- `FormField`, `Button`, `Card` from components/common/
- `companyService.searchCompanies()`
- Trust score gauge (conic-gradient)

---

### 3. AddCompany.jsx ✅ (Wizard exists, needs refactor)
**Purpose**: 4-step wizard for adding new companies
**Components**:
- Step indicator (1/4, 2/4, 3/4, 4/4)
- Dynamic form fields per step
- Progress tracking
- Step navigation buttons

**Steps**:
1. Basic Info (name, commercial number)
2. Sector Selection
3. City Selection
4. Confirmation Review

---

### 4. TrustReport.jsx ✅ (Layout ready, needs refactor)
**Purpose**: Display detailed trust report for companies
**Components**:
- Company header with status badge
- Trust score visualization (gauge)
- Report sections:
  - Official data (30%)
  - Community data (50%)
  - Platform analysis (20%)
- Status handling (full data, preliminary, no data, locked)

---

### 5. Watchlist.jsx ✅ (Layout ready, needs refactor)
**Purpose**: List of monitored companies
**Components**:
- Watched companies list/table
- Trust score display per company
- Remove from watchlist action
- Empty state message

---

### 6. Compare.jsx (Needs implementation)
**Purpose**: Compare multiple companies side-by-side
**Components**:
- Company selector (dropdown/search)
- Comparison table with KPIs
- Trust score comparison chart
- Risk level comparison

---

### 7. CompanyUsers.jsx ✅ (Layout ready, needs refactor)
**Purpose**: Team member management
**Components**:
- Team members table (name, role, status)
- Add member button
- Edit/remove member actions
- Role assignment

---

### 8. Subscription.jsx ✅ (Layout ready, needs refactor)
**Purpose**: Billing and subscription management
**Components**:
- Current plan display
- Plan features list
- Upgrade options with pricing
- Billing history

---

### 9. Profile.jsx ✅ (Layout ready, needs refactor)
**Purpose**: User account settings
**Components**:
- Company information form
- User profile form
- Security section (password change)
- Account deletion option

---

## 👨‍💼 Admin Dashboard Pages (7 pages)

### 1. AdminDashboard.jsx ✅ (Layout ready, needs refactor)
**Purpose**: Admin overview and statistics
**Components**:
- 4 KPI stats cards
- Pending tasks list
- Recent activity feed
- Quick action buttons

---

### 2. AdminRequests.jsx ✅ (Layout ready, needs refactor)
**Purpose**: Approve/reject new company requests
**Components**:
- Requests table/list
- Company info display
- Approval buttons (✓ Approve, ✗ Reject)
- Status tracking

---

### 3. AdminReports.jsx ✅ (Layout ready, needs refactor)
**Purpose**: Review community-submitted reports
**Components**:
- Reports queue list
- Report details
- Severity level indicator
- Approve/reject actions
- Comments section

---

### 4. AdminCompanies.jsx ✅ (Layout ready, needs refactor)
**Purpose**: Manage company database
**Components**:
- Companies table with filters
- Search functionality
- Edit/delete actions
- Add company button
- Status indicators

---

### 5. AdminUsers.jsx ✅ (Layout ready, needs refactor)
**Purpose**: User account management
**Components**:
- Users table (email, role, status)
- Search and filter
- Deactivate/delete users
- Subscription status column

---

### 6. AdminBulkImport.jsx ✅ (Layout ready, needs refactor)
**Purpose**: Bulk company import via file
**Components**:
- File upload (drag-drop)
- Upload progress indicator
- Success/error messages
- Imported items summary

---

### 7. AdminLogs.jsx ✅ (Layout ready, needs refactor)
**Purpose**: System activity audit log
**Components**:
- Append-only activity log
- Timestamp, actor, action, result columns
- Filter by action type
- Search functionality

---

## 🎨 Design Standards to Apply

### Styling
```javascript
import { COLORS, SPACING, TYPOGRAPHY } from '../../constants'
```

### Reusable Components
```javascript
import { Button, Card, FormField } from '../../components/common'
```

### Common Patterns

**Page Layout**:
```jsx
<main style={{ padding: SPACING.sectionPadding }}>
  <h1 style={PRESET_STYLES.h1}>Page Title</h1>
  <p style={PRESET_STYLES.bodySmall}>Subtitle</p>
  
  <div style={{ marginTop: SPACING.xl }}>
    {/* Content */}
  </div>
</main>
```

**Card Pattern**:
```jsx
<Card variant="default" padding={SPACING.xxl}>
  <h2 style={PRESET_STYLES.h3}>Title</h2>
  <p style={PRESET_STYLES.body}>Content</p>
</Card>
```

**Button Pattern**:
```jsx
<Button 
  variant="primary"
  onClick={handleAction}
>
  Action Label
</Button>
```

**Form Pattern**:
```jsx
const { values, errors, handleChange, handleSubmit } = useFormState(
  initialValues,
  onSubmit,
  validate
)

<FormField
  label="Field Label"
  name="fieldName"
  value={values.fieldName}
  onChange={handleChange}
  error={errors.fieldName}
/>
```

---

## 📋 Implementation Checklist per Page

For each page:
- [ ] Import all needed components and constants
- [ ] Create component structure matching design
- [ ] Apply styling using constants (no hardcoded values)
- [ ] Use FormField for all form inputs
- [ ] Use Button component for all actions
- [ ] Use Card component for content containers
- [ ] Add JSDoc comments for complex logic
- [ ] Handle loading and error states
- [ ] Test responsive layout
- [ ] Verify RTL display
- [ ] Verify pixel-perfect match with design

---

## 🔄 Refactoring Strategy

### Current Issues to Fix
1. ❌ Hardcoded colors (#1E2A52, #fff, etc.)
2. ❌ Hardcoded spacing (28px, 24px, etc.)
3. ❌ Custom button/card components inline
4. ❌ No consistent styling approach
5. ❌ Missing error states
6. ❌ Missing loading states

### After Refactoring
1. ✅ All colors from `COLORS` constant
2. ✅ All spacing from `SPACING` constant
3. ✅ Reusable `Button` and `Card` components
4. ✅ Consistent design system usage
5. ✅ Proper error handling
6. ✅ Loading state indicators

---

## 📊 Implementation Order

### Phase 1 (Day 1): Company Dashboard Core
1. Dashboard.jsx (KPI cards + activity)
2. Search.jsx (Company search)
3. TrustReport.jsx (Report view)

### Phase 2 (Day 1-2): Company Dashboard Features
4. AddCompany.jsx (4-step wizard)
5. Watchlist.jsx (Watched companies)
6. Compare.jsx (Company comparison)

### Phase 3 (Day 2): Company Dashboard Settings
7. CompanyUsers.jsx (Team management)
8. Subscription.jsx (Billing)
9. Profile.jsx (User settings)

### Phase 4 (Day 2-3): Admin Dashboard
1. AdminDashboard.jsx (Overview)
2. AdminRequests.jsx (Approvals)
3. AdminReports.jsx (Review queue)
4. AdminCompanies.jsx (Management)
5. AdminUsers.jsx (User management)
6. AdminBulkImport.jsx (File upload)
7. AdminLogs.jsx (Activity log)

---

## 🎯 Quality Gates

Before marking a page as complete:

✅ **Code Quality**
- Uses design constants (no hardcoded values)
- Imports organized (React → components → services → constants)
- Functions are pure and side-effect free
- Clear variable and function names
- JSDoc comments for complex logic

✅ **Design Match**
- Pixel-perfect layout match
- All colors correct
- All spacing correct
- Typography matches (sizes, weights, line heights)
- RTL text displays correctly

✅ **Functionality**
- All buttons and links work
- Forms validate correctly
- Loading states display
- Error states display
- Mobile responsive

✅ **Performance**
- No unnecessary re-renders
- Efficient data handling
- Proper memoization if needed
- No memory leaks

---

## 📝 File Naming & Organization

```
src/pages/company/
├── Dashboard.jsx         (Main overview)
├── Search.jsx           (Company search)
├── AddCompany.jsx       (Wizard form)
├── TrustReport.jsx      (Report display)
├── Watchlist.jsx        (Watched list)
├── Compare.jsx          (Comparison)
├── CompanyUsers.jsx     (Team management)
├── Subscription.jsx     (Billing)
└── Profile.jsx          (Settings)

src/pages/admin/
├── Dashboard.jsx        (Admin overview)
├── AdminRequests.jsx    (Request approval)
├── AdminReports.jsx     (Report review)
├── AdminCompanies.jsx   (Company mgmt)
├── AdminUsers.jsx       (User management)
├── AdminBulkImport.jsx  (File upload)
└── AdminLogs.jsx        (Activity logs)
```

---

## ✅ Success Criteria

✅ All 16 pages completed and styled  
✅ Zero hardcoded values (all from constants)  
✅ All using reusable components  
✅ All pixel-perfect match with design  
✅ All enterprise code quality standards  
✅ All properly documented  
✅ All responsive and RTL-ready  

---

## 🚀 Next Phase

After UI completion:
1. Backend integration with NestJS
2. Database setup with Prisma
3. API endpoint implementation
4. Connect services to real backend

---

**Status**: 🚀 **READY TO IMPLEMENT**  
**Timeline**: 2-3 days  
**Quality**: Enterprise Grade  

Let's build! 💪
