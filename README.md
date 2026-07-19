# Marsad - منصة تقييم موثوقية الأعمال

**Business Reliability Assessment Platform**

## Overview

Marsad is a comprehensive web-based platform for assessing and evaluating the reliability and trustworthiness of businesses. It combines official government data, community-verified reports, and platform analytics to provide a trust score for companies.

## Features

- 🔍 **Advanced Search** - Search for companies with detailed filters
- 📊 **Trust Scoring** - Multi-layered trust score combining official and community data
- 📝 **Anonymous Reporting** - Submit reports while protecting your identity
- 📈 **Comparative Analysis** - Compare companies side-by-side
- 👥 **Watchlist** - Monitor companies important to you
- 💳 **Flexible Subscriptions** - Free, Professional, and Enterprise plans
- 🛡️ **Admin Dashboard** - Full system management and audit logs
- 📱 **Fully Responsive** - Works seamlessly on desktop, tablet, and mobile

## Tech Stack

- **Frontend**: React 18, Next.js 14
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **Language**: TypeScript
- **UI Components**: Custom component library
- **Internationalization**: RTL support for Arabic

## Project Structure

```
marsad/
├── app/                          # Next.js app directory
│   ├── (public)/                # Public pages (marketing site)
│   │   ├── page.tsx            # Landing page
│   │   ├── about/              # About page
│   │   └── pricing/            # Pricing page
│   ├── auth/                    # Authentication pages
│   │   ├── login/              # Login page
│   │   └── register/           # Registration page
│   ├── companies/              # Company management
│   │   ├── page.tsx           # Companies list
│   │   ├── new/               # Add company
│   │   └── bulk-import/       # Bulk import wizard
│   ├── reports/               # Report management
│   │   ├── page.tsx          # Reports list
│   │   └── new/              # Add report
│   ├── watchlist/            # Watchlist page
│   ├── subscriptions/        # Subscription management
│   ├── admin/                # Admin dashboard
│   │   ├── dashboard/       # Admin KPI dashboard
│   │   ├── users/          # User management
│   │   └── audit-logs/     # Audit logs
│   ├── layout.tsx          # Root layout
│   ├── page.tsx            # Home/dashboard
│   └── globals.css         # Global styles
├── components/             # React components
│   ├── Header.tsx         # App header
│   ├── Sidebar.tsx        # Navigation sidebar
│   ├── Dashboard.tsx      # Dashboard component
│   └── ui/               # Reusable UI components
│       ├── Button.tsx
│       ├── Input.tsx
│       ├── Card.tsx
│       ├── Modal.tsx
│       ├── Table.tsx
│       ├── Alert.tsx
│       └── ...
├── lib/                   # Utility functions
├── types/                 # TypeScript types
├── public/               # Static assets
├── package.json          # Dependencies
├── tsconfig.json         # TypeScript config
├── tailwind.config.js    # Tailwind configuration
└── next.config.js        # Next.js configuration
```

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

1. Clone the repository:
```bash
cd C:\Users\DTG\Desktop\Marsad
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env.local
```

4. Run the development server:
```bash
npm run dev
```

5. Open your browser and navigate to `http://localhost:3000`

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

## Pages Overview

### Public Pages
- **Landing** (`/`) - Homepage with features and call-to-action
- **About** (`/about`) - Information about Marsad
- **Pricing** (`/pricing`) - Subscription plans

### Authentication
- **Login** (`/auth/login`) - User login
- **Register** (`/auth/register`) - User registration

### User Dashboard
- **Dashboard** (`/`) - Main dashboard with statistics
- **Companies** (`/companies`) - List and manage companies
- **Add Company** (`/companies/new`) - Add new company
- **Bulk Import** (`/companies/bulk-import`) - 4-step bulk import wizard
- **Reports** (`/reports`) - View and filter reports
- **Add Report** (`/reports/new`) - Submit new report
- **Watchlist** (`/watchlist`) - Monitor companies
- **Subscriptions** (`/subscriptions`) - Manage subscription plans

### Admin Pages
- **Admin Dashboard** (`/admin/dashboard`) - KPI and analytics
- **Users** (`/admin/users`) - User management
- **Audit Logs** (`/admin/audit-logs`) - System activity logs

## Design System

### Colors
- **Primary**: Green (#16A34A)
- **Secondary**: Navy (#1E2A52)
- **Accent**: Blue, Purple, Teal
- **Neutral**: 11-level gray scale

### Typography
- **Font**: Tajawal (Arabic-optimized)
- **Weights**: 400, 500, 700, 800, 900
- **Sizes**: 11px to 54px

### Components
- Custom Button with variants (default, primary, secondary, ghost, danger, outline)
- Input fields with error states
- Modals with customizable size
- Data tables with pagination
- Alert notifications with variants
- Badge components
- Card containers

### Responsive Design
- Mobile-first approach
- Breakpoints: sm (640px), md (768px), lg (1024px)
- RTL (Right-to-Left) support for Arabic

## State Management

The application uses:
- React hooks (useState, useContext) for component state
- Zustand for global state management (ready to integrate)
- LocalStorage for session management

## Authentication

Currently uses mock authentication with localStorage. Ready to integrate with:
- JWT tokens
- OAuth providers
- Custom authentication API

## Database / API

Application structure ready for integration with:
- RESTful API endpoints
- GraphQL
- Database: PostgreSQL, MongoDB, or similar

## Performance

- Code splitting with dynamic imports
- Image optimization
- CSS minification via Tailwind
- TypeScript for type safety

## Security

- Input validation on forms
- HTTPS-ready
- CORS configuration ready
- Environment variables for sensitive data

## Deployment

Ready to deploy to:
- Vercel (recommended for Next.js)
- Netlify
- AWS
- Google Cloud
- Docker containers

## Contributing

This project is built to support incremental development. All future features should:
1. Follow the existing component structure
2. Use the established design system
3. Maintain RTL compatibility
4. Include TypeScript types
5. Use Tailwind CSS for styling

## License

Copyright 2024 Marsad. All rights reserved.

## Support

For questions or issues, please contact: support@marsad.local
