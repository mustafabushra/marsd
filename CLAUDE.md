# Marsad Project Documentation

## Project Overview

**Marsad** (مرصد) is a comprehensive **Business Reliability Assessment Platform** built with Next.js and React. It helps users evaluate the trustworthiness of companies through:
- Official government data
- Community-verified reports
- Platform analytics

## Technology Stack

- **Frontend**: React 18, Next.js 14 (App Router)
- **Styling**: Tailwind CSS 3.3
- **UI Components**: Custom component library with Lucide React icons
- **Language**: TypeScript
- **Build**: Next.js with PostCSS
- **Internationalization**: RTL (Right-to-Left) for Arabic support

## Project Structure

```
marsad/
├── app/                           # Next.js App Router
│   ├── (public)/                 # Public pages (group route)
│   │   ├── layout.tsx
│   │   ├── page.tsx             # Landing page
│   │   ├── about/               # About page
│   │   └── pricing/             # Pricing page
│   ├── auth/                     # Authentication
│   │   ├── layout.tsx
│   │   ├── login/               # Login
│   │   └── register/            # Registration
│   ├── companies/               # Company management
│   │   ├── page.tsx            # List
│   │   ├── new/                # Add company
│   │   └── bulk-import/        # 4-step wizard
│   ├── reports/               # Report management
│   │   ├── page.tsx          # List
│   │   └── new/              # Submit report
│   ├── watchlist/            # Watchlist
│   ├── subscriptions/        # Subscription plans
│   ├── admin/               # Admin dashboard
│   │   ├── dashboard/      # KPI dashboard
│   │   ├── users/         # User management
│   │   └── audit-logs/    # Audit logs
│   ├── layout.tsx         # Root layout
│   ├── page.tsx          # Dashboard/home (requires auth)
│   └── globals.css       # Global styles
├── components/           # React components
│   ├── Header.tsx       # App header
│   ├── Sidebar.tsx      # Navigation sidebar
│   ├── Dashboard.tsx    # Dashboard component
│   └── ui/             # Reusable UI components
│       ├── Button.tsx
│       ├── Input.tsx
│       ├── Card.tsx
│       ├── Modal.tsx
│       ├── Table.tsx
│       ├── Alert.tsx
│       ├── Badge.tsx
│       ├── Select.tsx
│       └── Textarea.tsx
├── lib/                # Utility functions
│   ├── utils.ts       # General utilities
│   ├── hooks.ts       # Custom React hooks
│   ├── constants.ts   # App constants
│   └── api.ts        # API client (ready to implement)
├── types/            # TypeScript type definitions
│   └── index.ts     # All types
├── public/          # Static assets
├── styles/         # CSS files
├── package.json    # Dependencies
├── tsconfig.json   # TypeScript configuration
├── tailwind.config.js  # Tailwind configuration
├── next.config.js     # Next.js configuration
├── postcss.config.js  # PostCSS configuration
├── .env.example       # Environment variables template
├── .gitignore        # Git ignore rules
└── README.md         # Project readme
```

## Key Features Implemented

### User Roles & Authentication
- **Visitor**: Public access to landing page
- **User**: Registered user with company dashboard
- **Staff**: Company employee with limited access
- **Admin**: Full system administration

### Core Modules

#### 1. Company Management
- List all companies with search/filter
- Add new company with detailed form
- Bulk import wizard (4-step process)
- View company details and trust score
- Track company changes and updates

#### 2. Reporting System
- Submit anonymous reports about companies
- Filter reports by status, type, rating
- Moderation system for report approval
- Anonymous author protection

#### 3. Watchlist & Monitoring
- Add companies to personal watchlist
- Track trust score changes
- Monitor alert notifications
- Comparison between watched companies

#### 4. Subscription Management
- Free tier with limited searches
- Professional tier with advanced features
- Enterprise tier with unlimited access
- Plan comparison and upgrade flows

#### 5. Admin Dashboard
- KPI statistics and charts
- User management and controls
- Audit logs for system activities
- Bulk operations management

### Design System

#### Colors
- **Primary Green**: #16A34A (trust, success)
- **Secondary Navy**: #1E2A52 (brand, authority)
- **Accent Colors**: Blue, Purple, Teal, Orange, Red
- **Neutral**: 11-level gray scale (50-950)

#### Typography
- **Font Family**: Tajawal (Arabic-optimized)
- **Weights**: 400 (Regular), 500 (Medium), 700 (Bold), 800 (ExtraBold), 900 (Black)
- **Sizes**: 11px to 54px scale
- **Direction**: RTL (Right-to-Left) for Arabic

#### Components
- Custom Button variants: default, primary, secondary, ghost, danger, outline
- Input fields with validation and error states
- Modals with configurable size and actions
- Data tables with responsive design
- Alert notifications with 4 variants
- Badge/Tag components
- Card containers with hover effects

#### Responsive Breakpoints
- **Mobile**: < 640px (base styles)
- **Small**: sm: 640px (md:)
- **Medium**: md: 768px
- **Large**: lg: 1024px (xl, 2xl)

## Development Guidelines

### Adding New Pages
1. Create file in `app/` directory following the structure
2. Use "use client" directive for interactive components
3. Import components from `@/components`
4. Follow naming conventions: PascalCase for components, kebab-case for folders

### Adding New Components
1. Create in `components/` directory
2. Keep components small and focused
3. Export as default
4. Use TypeScript interfaces for props
5. Reuse UI components from `components/ui/`

### State Management
- **Component State**: React `useState` for local state
- **Server State**: Ready for React Query or SWR
- **Global State**: Zustand configured in dependencies
- **Persistent State**: `useLocalStorage` hook available

### Styling Guidelines
- Use Tailwind CSS utility classes
- Custom CSS only when necessary in `components/ui/`
- Maintain responsive design with mobile-first approach
- Follow the established color and spacing system

### TypeScript Usage
- All components must be typed
- Use interfaces for props
- Define types in `types/index.ts` for shared types
- Use `React.FC<Props>` for functional components (optional, can use `function Component(props: Props)`)

## Pages & Routes

### Public Routes
- `/` - Landing page with features
- `/about` - About Marsad
- `/pricing` - Subscription plans
- `/auth/login` - User login
- `/auth/register` - User registration

### Authenticated Routes
- `/dashboard` - Main user dashboard
- `/companies` - Company list
- `/companies/new` - Add company
- `/companies/bulk-import` - Bulk import wizard
- `/reports` - Report list
- `/reports/new` - Submit report
- `/watchlist` - Watchlist
- `/subscriptions` - Subscription management
- `/profile` - User profile (to implement)

### Admin Routes
- `/admin/dashboard` - Admin KPI dashboard
- `/admin/users` - User management
- `/admin/audit-logs` - Audit logs
- `/admin/settings` - System settings (to implement)

## API Integration Points

The application is structured to integrate with a REST API. Ready for implementation:
- Authentication endpoints
- Company CRUD operations
- Report management
- Search and filtering
- Subscription management
- User management
- Audit logging

See `lib/api.ts` for API client structure (to implement).

## Utility Functions & Hooks

### Available Utilities (`lib/utils.ts`)
- `cn()` - Combine class names
- `formatCurrency()` - Format money
- `formatDate()` - Format dates
- `formatTimeAgo()` - Relative time
- `validateEmail()` - Email validation
- `validatePhoneNumber()` - Phone validation
- `validateURL()` - URL validation
- `getTrustScoreColor()` - Color coding
- `debounce()` - Debounce function
- `throttle()` - Throttle function
- And more...

### Custom Hooks (`lib/hooks.ts`)
- `useAuth()` - Authentication context
- `useFetch()` - Generic fetch hook
- `useDebounce()` - Debounce values
- `useAsync()` - Async operations
- `useLocalStorage()` - LocalStorage sync
- `useModal()` - Modal state management
- `useClickOutside()` - Outside click detection
- And more...

## Constants & Configuration

All app constants defined in `lib/constants.ts`:
- API configuration
- Pagination settings
- Trust score levels
- Subscription plans
- Error/success messages
- Validation rules
- Feature flags
- And more...

## Building & Deployment

### Build
```bash
npm run build
```

### Production Start
```bash
npm run start
```

### Development Server
```bash
npm run dev
```

### Linting
```bash
npm run lint
```

## Environment Variables

Copy `.env.example` to `.env.local` and configure:
- Database credentials
- API endpoints
- Authentication secrets
- Email service
- File storage
- Analytics
- Payment processing

## Future Development

This implementation serves as the foundation for the complete Marsad application. Future development should:

1. **Backend Integration**
   - Connect API endpoints in `lib/api.ts`
   - Implement real authentication
   - Set up database integration

2. **Additional Pages**
   - User profile and settings
   - Advanced search interface
   - Detailed company profiles
   - Report detail view
   - Admin settings

3. **Features**
   - Real-time notifications
   - Export reports
   - Advanced analytics
   - Email notifications
   - Integration with external APIs

4. **Testing**
   - Unit tests with Jest
   - Integration tests
   - E2E tests with Playwright/Cypress
   - Component testing with React Testing Library

5. **Performance**
   - Code splitting optimization
   - Image optimization
   - Caching strategies
   - SEO optimization

6. **Security**
   - CSRF protection
   - Rate limiting
   - Input sanitization
   - Output encoding
   - Security headers

## Code Standards

### Naming Conventions
- Files: kebab-case (button.tsx, dashboard.tsx)
- Components: PascalCase (Button, Dashboard)
- Functions: camelCase (handleSubmit, getTrustScore)
- Constants: UPPER_SNAKE_CASE (MAX_FILE_SIZE, API_TIMEOUT)

### Component Structure
```typescript
'use client' // If interactive

import { useState } from 'react'
import Button from '@/components/ui/Button'

interface ComponentProps {
  // props
}

export default function Component({ }: ComponentProps) {
  const [state, setState] = useState()
  
  // logic
  
  return (
    // JSX
  )
}
```

### Commit Messages
- Use present tense ("add feature" not "added feature")
- Reference issues when applicable
- Keep messages concise but descriptive

## Support & Documentation

For questions about specific features, refer to:
- `types/index.ts` for data structure definitions
- `lib/constants.ts` for configuration
- Component files for implementation examples
- README.md for general project info

---

**Last Updated**: 2024
**Status**: Foundation Implementation Complete - Ready for Backend Integration
