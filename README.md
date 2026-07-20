# 🔍 Marsad - Business Reliability Assessment Platform

A comprehensive B2B SaaS platform for assessing and monitoring company reliability and trustworthiness in Saudi Arabia and GCC markets.

**Status**: 🚀 In Active Development  
**Value**: $7,000 - $10,000 USD  
**Quality**: Production-Grade Enterprise SaaS  

---

## ✨ Features

### 🏢 For Companies
- **Trust Score Assessment**: Real-time reliability scoring based on multi-source data
- **Company Search**: Discover and evaluate business partners
- **Trust Reports**: Comprehensive financial and compliance reports
- **Watchlist Management**: Monitor trusted and risky companies
- **Company Comparison**: Side-by-side analysis of multiple businesses
- **Team Management**: Invite and manage team members with role-based access
- **Subscription Plans**: Flexible pricing tiers with increasing capabilities
- **Profile Settings**: Company information and security settings

### 👨‍💼 For Admins
- **Company Management**: Approve/reject new company listings
- **Report Review**: Validate user-submitted reports
- **Bulk Import**: Add multiple companies via CSV/Excel
- **User Management**: Control access and permissions
- **System Logs**: Track all platform activities
- **Analytics Dashboard**: Monitor platform usage and growth

### 👥 Public Features
- **Educational Content**: Learn how the platform works
- **Transparent Pricing**: Clear, comparable plans
- **FAQ & Support**: Comprehensive help documentation
- **Contact Forms**: Direct communication with team

---

## 🏗️ Architecture

### Tech Stack

**Frontend**
- React 18.2.0 (SPA)
- React Router 6.20.0 (Navigation)
- Vite 5.0.0 (Build tool)
- Inline CSS + Constants (Styling)
- Tajawal Font (Typography)

**Backend** (Planned)
- NestJS (API Framework)
- PostgreSQL (Database)
- Prisma (ORM)
- JWT (Authentication)

**Design**
- Pixel-perfect UI matching approved design
- RTL-first for Arabic language
- Mobile-responsive layout
- Enterprise color scheme

### Project Structure

```
marsd/
├── src/
│   ├── components/          # Reusable UI components
│   │   ├── common/          # Shared components
│   │   ├── layout/          # Shells (Visitor, Company, Admin)
│   │   ├── sections/        # Page sections
│   │   ├── forms/           # Form components
│   │   └── cards/           # Card components
│   ├── pages/               # Page components
│   │   ├── visitor/         # Public pages
│   │   ├── company/         # Company dashboard
│   │   └── admin/           # Admin dashboard
│   ├── hooks/               # Custom React hooks
│   ├── context/             # Context API (Auth, UI)
│   ├── services/            # Business logic & API calls
│   ├── utils/               # Utility functions
│   ├── constants/           # Design system constants
│   ├── styles/              # Global CSS
│   ├── data/                # Mock data
│   ├── App.jsx              # Main routing
│   └── main.jsx             # Entry point
├── index.html               # HTML entry
├── vite.config.js           # Vite config
├── package.json             # Dependencies
├── PROJECT_ARCHITECTURE.md  # Architecture guide
└── DEVELOPMENT_GUIDE.md     # Development standards
```

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- npm or yarn
- Git

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd marsd

# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

### Access the Application

- **Public Site**: http://localhost:3002
- **Company Dashboard**: Log in with any email
- **Admin Dashboard**: Click 🔐 Admin button on login

---

## 📋 Pages & Routes

### Visitor/Public Pages (No Login Required)
| Page | Route | Purpose |
|------|-------|---------|
| Landing | `/` | Homepage with platform overview |
| About | `/about` | Company mission and trust model |
| Pricing | `/pricing` | Subscription plans and features |
| FAQ | `/faq` | Frequently asked questions |
| Contact | `/contact` | Support and communication |
| Login | `/login` | User authentication |
| Register | `/register` | New account creation |

### Company Dashboard (Login Required)
| Page | Route | Purpose |
|------|-------|---------|
| Dashboard | `/dashboard` | Main company overview |
| Search | `/search` | Find and evaluate companies |
| Trust Report | `/report/:id` | Detailed company assessment |
| Add Company | `/add-company` | Submit new company for evaluation |
| Watchlist | `/watchlist` | Monitor tracked companies |
| Compare | `/compare` | Side-by-side analysis |
| Team | `/team` | Manage users and permissions |
| Subscription | `/subscription` | Billing and plan upgrade |
| Profile | `/profile` | Account settings |

### Admin Dashboard (Admin Only)
| Page | Route | Purpose |
|------|-------|---------|
| Dashboard | `/admin` | Admin overview and stats |
| Company Requests | `/admin/requests` | Approve/reject company listings |
| Reports | `/admin/reports` | Review user-submitted reports |
| Companies | `/admin/companies` | Manage company database |
| Users | `/admin/users` | Manage user accounts |
| Bulk Import | `/admin/import` | Upload companies via CSV |
| Logs | `/admin/logs` | System activity tracking |

---

## 🎨 Design System

### Colors
```javascript
Navy:        #1E2A52 (Primary)
Green:       #16A34A (Success/CTA)
Sky:         #F8FAFC (Background)
Dark Text:   #0F172A (Headings)
Light Text:  #64748B (Secondary)
Border:      #E2E8F0 (Subtle dividers)
```

### Typography
- **Font**: Tajawal (Google Fonts)
- **Sizes**: 12px - 46px
- **Weights**: 400, 500, 600, 700, 800, 900
- **Direction**: RTL-first for Arabic

### Spacing
- **Base Unit**: 4px
- **Common**: 8px, 12px, 14px, 16px, 20px, 28px, 32px, 40px, 56px, 72px, 80px

---

## 📖 Development

### Code Standards
See `DEVELOPMENT_GUIDE.md` for detailed standards including:
- Component structure and naming
- File organization
- Styling guidelines
- Service architecture
- Testing checklist
- Git workflow

### Architecture Overview
See `PROJECT_ARCHITECTURE.md` for:
- Complete directory structure
- Component hierarchy
- Data flow patterns
- Integration points
- Deployment checklist

### Adding New Features

1. **Create Component** → `components/` directory
2. **Build Service** → `services/` directory (if needed)
3. **Add Constants** → `constants/` directory (if needed)
4. **Create Page** → `pages/` directory (if full page)
5. **Add Route** → `App.jsx`
6. **Export Properly** → Update `index.js` files

### Key Exports

```javascript
// Components
import { Button, Card, FormField } from './components/common'

// Services
import { authService, companyService } from './services'

// Hooks
import { useFormState, useAuth } from './hooks'

// Constants
import { COLORS, SPACING, TYPOGRAPHY } from './constants'

// Utils
import { validateEmail, formatCurrency } from './utils'
```

---

## 🔐 Authentication

### Current Implementation (Mock)
- Login with any email/password
- Session stored in localStorage
- Admin access via "🔐 Admin" button on login page

### Production Implementation (Planned)
- JWT token-based authentication
- NestJS backend integration
- Secure token storage with httpOnly cookies
- Role-based access control (RBAC)
- Session expiration and refresh

---

## 🗄️ Data Management

### Current Data
- **Mock Data**: `src/data/mockData.js`
- **6 Sample Companies**: With trust scores and details
- **4 Pricing Tiers**: Free, Basic, Pro, Enterprise
- **8 FAQ Items**: Common questions and answers
- **4 KPI Cards**: Key metrics for dashboard
- **5 Activity Items**: Timeline for activity feed

### Production Data (Planned)
- PostgreSQL database with Prisma ORM
- User accounts and company profiles
- Trust reports and assessments
- Activity logs and audit trails
- Subscription and billing data

---

## 🧪 Testing

### Manual Testing Checklist
Before committing changes:
- [ ] Component renders without errors
- [ ] Styling matches design pixel-perfectly
- [ ] All interactive elements respond correctly
- [ ] Form validation works as expected
- [ ] Error states display properly
- [ ] RTL text displays correctly
- [ ] Mobile responsive design verified
- [ ] Navigation works between pages
- [ ] No console errors or warnings

### Test Data
Use provided mock data in `src/data/mockData.js` or add your own test scenarios.

---

## 📱 Browser Support

- ✅ Chrome (latest)
- ✅ Firefox (latest)
- ✅ Safari (latest)
- ✅ Edge (latest)
- ✅ Mobile browsers (iOS Safari, Chrome Mobile)

---

## 🌍 Internationalization

### Current Language Support
- **Arabic** (Primary) - Right-to-left (RTL)
- English support planned for future

### RTL Implementation
- HTML `dir="rtl"` attribute
- CSS logical properties for margins/padding
- Flexbox and Grid for responsive layouts
- Tajawal font for Arabic typography

---

## 📦 Dependencies

### Core Dependencies
- **react**: 18.2.0 - UI library
- **react-dom**: 18.2.0 - React rendering
- **react-router-dom**: 6.20.0 - Client-side routing

### Development Dependencies
- **vite**: 5.0.0 - Build tool
- **@vitejs/plugin-react**: 4.2.0 - React support for Vite
- **tailwindcss**: 4.3.2 - (Optional) Utility CSS
- **postcss**: 8.5.16 - CSS processing
- **autoprefixer**: 10.5.2 - Vendor prefixes

---

## 🚀 Deployment

### Build for Production
```bash
npm run build
```

### Build Output
- Location: `dist/` directory
- Optimized and minified bundle
- Ready for deployment

### Deployment Targets (Future)
- Vercel (Recommended for Next.js)
- Netlify
- AWS S3 + CloudFront
- DigitalOcean
- Any static hosting

---

## 📞 Support & Contribution

### Getting Help
1. Check `DEVELOPMENT_GUIDE.md` for development questions
2. Review `PROJECT_ARCHITECTURE.md` for architecture questions
3. Check code comments and JSDoc for specific functions
4. Review mock data in `src/data/mockData.js` for data structure

### Contributing
- Follow coding standards in `DEVELOPMENT_GUIDE.md`
- Write clear commit messages
- Test thoroughly before committing
- Update documentation when needed
- No hardcoded values - use constants

---

## 📄 License

This is a proprietary commercial project. All rights reserved.

---

## 📊 Project Status

| Component | Status | Notes |
|-----------|--------|-------|
| UI Components | ✅ Complete | Button, Card, FormField, etc. |
| Visitor Pages | ✅ Complete | Landing, About, Pricing, FAQ, Contact, Login, Register |
| Company Dashboard | 🚧 In Progress | Basic layout, pages ready for data integration |
| Admin Dashboard | 🚧 In Progress | UI complete, needs backend integration |
| Design System | ✅ Complete | Colors, spacing, typography constants |
| Services Layer | 🚧 In Progress | Auth and company services ready for API integration |
| Backend API | 📋 Planned | NestJS with Prisma and PostgreSQL |
| Database | 📋 Planned | PostgreSQL schema with Prisma ORM |
| Authentication | 🚧 In Progress | Mock auth implemented, JWT planned |
| Testing | 🚧 In Progress | Manual testing, automated tests planned |
| Documentation | ✅ Complete | Architecture, development guides ready |

---

## 🎯 Next Steps

1. **Backend Setup** - Initialize NestJS API server
2. **Database Schema** - Define Prisma models
3. **API Integration** - Connect frontend services to backend
4. **Authentication** - Implement JWT-based auth
5. **Testing** - Add unit and integration tests
6. **Deployment** - Set up CI/CD pipeline
7. **Monitoring** - Add logging and error tracking
8. **Performance** - Optimize bundle size and load time

---

## 📈 Performance Metrics

- **Bundle Size**: < 150KB (gzipped)
- **Page Load Time**: < 2 seconds
- **TTL (Time to Interactive)**: < 3 seconds
- **Lighthouse Score**: > 90

---

## 🔒 Security Considerations

- ✅ No hardcoded sensitive data
- ✅ Input validation on all forms
- ✅ RTL security verified
- 🚧 HTTPS required (production)
- 🚧 CORS properly configured
- 🚧 Rate limiting on API endpoints
- 🚧 SQL injection prevention (Prisma)
- 🚧 XSS protection (React escaping)

---

## 📝 Notes

- This is a **production-grade commercial SaaS** project
- Estimated value: **$7,000 - $10,000 USD**
- Code quality must reflect enterprise standards
- All UIs must match the approved design exactly (pixel-perfect)
- RTL support is mandatory for all features
- The project is designed for long-term maintenance and scaling

---

**Last Updated**: July 11, 2026  
**Version**: 0.1.0 (Beta)  
**Maintainer**: Development Team  

For detailed technical information, see:
- 📐 `PROJECT_ARCHITECTURE.md` - Complete architecture documentation
- 📝 `DEVELOPMENT_GUIDE.md` - Development standards and workflow
