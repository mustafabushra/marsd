# Marsad - Quick Start Guide

Get up and running with Marsad in 5 minutes!

## Prerequisites

- **Node.js** 18 or higher
- **npm** or **yarn**
- A code editor (VS Code recommended)

## Installation

### 1. Navigate to Project Directory
```bash
cd C:\Users\DTG\Desktop\Marsad
```

### 2. Install Dependencies
```bash
npm install
```

This will install all required packages:
- `react` 18.3.1
- `next` 14.0.0
- `tailwindcss` 3.3.6
- `lucide-react` (icons)
- `class-variance-authority` (component variants)
- `zustand` (state management)
- And more...

### 3. Start Development Server
```bash
npm run dev
```

The server will start on `http://localhost:3000`

### 4. Open in Browser
Navigate to: **http://localhost:3000**

## What You'll See

### Landing Page (/)
- Feature showcase
- Call-to-action buttons
- Navigation menu

### Test Authentication
**Mock Login (Pre-configured)**
- Email: `user@example.com`
- Password: Any password (mock auth)

Click "إنشاء حساب" (Create Account) or "تسجيل الدخول" (Login)

### Demo Pages

After logging in, explore:

1. **Dashboard** (`/dashboard`)
   - Company statistics
   - Recent companies table

2. **Companies** (`/companies`)
   - Search and filter companies
   - Add new companies
   - Bulk import wizard
   - Compare companies

3. **Reports** (`/reports`)
   - Submit anonymous reports
   - View all reports
   - Filter by status, type, rating

4. **Search** (`/search`)
   - Advanced search with filters
   - Multiple sorting options

5. **Watchlist** (`/watchlist`)
   - Monitor companies
   - Track trust score changes

6. **Subscriptions** (`/subscriptions`)
   - View pricing plans
   - Plan comparison

7. **Admin Panel** (`/admin/dashboard`)
   - KPI statistics
   - User management
   - Audit logs
   - System settings

## Project Structure

```
marsad/
├── app/              # Pages and routes
├── components/       # Reusable components
├── lib/             # Utilities and hooks
├── types/           # TypeScript definitions
├── public/          # Static files
└── package.json     # Dependencies
```

## Common Commands

### Development
```bash
npm run dev          # Start dev server on http://localhost:3000
npm run lint         # Check code quality
```

### Production
```bash
npm run build        # Build for production
npm run start        # Start production server
```

## Key Features to Try

### 1. Navigation
- Use the **Sidebar** to navigate between pages
- Try all menu items in the collapsed sections
- Use the **Header** user menu to access profile

### 2. Search & Filters
- Try the search functionality on Companies page
- Apply filters by industry, status
- Sort results by different criteria

### 3. Forms
- Add a new company
- Submit a report (anonymous)
- Update your profile

### 4. Modals & Dialogs
- Try deleting items to see confirmation modals
- Edit company details
- Change password in profile

### 5. Responsive Design
- Resize browser window
- Test on mobile view (DevTools)
- Notice the responsive grid layouts

## Environment Setup

### .env.local File

Already created with defaults:
```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_NAME=Marsad
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000/api
```

Modify if needed for your setup.

## Customization

### Change App Name
Edit `lib/constants.ts`:
```tsx
export const APP_NAME = 'Your App Name'
```

### Change Colors
Edit `tailwind.config.js`:
```js
colors: {
  primary: { ... }
}
```

### Change Font
Edit `app/globals.css`:
```css
font-family: 'Your Font';
```

## Troubleshooting

### Port 3000 Already in Use
```bash
# Kill process on port 3000, or use different port
npm run dev -- -p 3001
```

### Module Not Found Errors
```bash
# Clear node_modules and reinstall
rm -rf node_modules
npm install
```

### TypeScript Errors
```bash
# Check TypeScript compilation
npx tsc --noEmit
```

## Next Steps

### 1. Explore the Code
- Open `app/page.tsx` to see the home page
- Check `components/ui/` for UI components
- Review `lib/api.ts` for API integration points

### 2. Customize Components
- Modify colors in `tailwind.config.js`
- Update button styles in `components/ui/Button.tsx`
- Add new icons from `lucide-react`

### 3. Add Backend
- Update `lib/api.ts` with real endpoints
- Configure authentication
- Connect to database

### 4. Deploy
See `IMPLEMENTATION_GUIDE.md` for deployment options:
- Vercel (one-click)
- Netlify
- Docker
- Custom server

## Documentation

| Document | Purpose |
|----------|---------|
| `README.md` | Project overview |
| `CLAUDE.md` | Development guidelines |
| `IMPLEMENTATION_GUIDE.md` | Complete technical guide |
| `QUICKSTART.md` | This file |

## Development Tips

### Hot Reload
Changes are automatically reflected in the browser during development - no need to restart!

### Browser DevTools
- Open DevTools (F12 or Cmd+Option+I)
- Use React DevTools extension for debugging
- Check Console for errors
- Use Network tab to inspect API calls

### File Organization
- Keep pages in `app/`
- Put components in `components/`
- Add utilities to `lib/`
- Define types in `types/`

### Performance
- Use `next/Image` for images
- Lazy load components with `dynamic()`
- Check bundle size with `npm run build`

## API Mock Data

All pages use mock data. To integrate with real API:

1. Edit `lib/api.ts`
2. Replace mock endpoints with real ones
3. Update environment variables
4. Test with backend

## Getting Help

### Built-in Documentation
- Hover over components in IDE for JSDoc comments
- Check TypeScript for inline type hints
- Read comments in complex functions

### External Resources
- [Next.js Documentation](https://nextjs.org/docs)
- [React Documentation](https://react.dev)
- [Tailwind CSS](https://tailwindcss.com/docs)
- [TypeScript](https://www.typescriptlang.org/docs)

## Useful Links

- **Design System**: See `lib/constants.ts` for colors, spacing, etc.
- **Components**: Browse `components/ui/` folder
- **Utilities**: Check `lib/utils.ts` and `lib/hooks.ts`
- **Types**: View `types/index.ts` for all interfaces

## Example: Adding a New Button

```tsx
import Button from '@/components/ui/Button'

<Button 
  variant="primary"
  size="lg"
  isLoading={false}
  onClick={() => console.log('Clicked')}
>
  Click Me
</Button>
```

## Example: Using a Hook

```tsx
import { useDebounce } from '@/lib/hooks'

const searchQuery = 'test'
const debouncedQuery = useDebounce(searchQuery, 300)
```

## Performance Metrics

The project is optimized for:
- ✅ Fast initial load
- ✅ Smooth interactions
- ✅ Responsive design
- ✅ Mobile-first approach
- ✅ Accessibility

## Security Notes

- ✅ Input validation ready
- ✅ XSS protection with React
- ✅ CSRF protection ready
- ✅ Secure API client pattern
- ⚠️ Authentication not yet implemented (mock)

## Production Checklist

Before deploying:
- [ ] Update environment variables
- [ ] Set up database
- [ ] Configure authentication
- [ ] Add email service
- [ ] Enable error logging
- [ ] Set up monitoring
- [ ] Test on all browsers
- [ ] Optimize images
- [ ] Enable HTTPS
- [ ] Set up CDN

---

**Happy coding!** 🚀

Questions? Check `IMPLEMENTATION_GUIDE.md` or review the code comments.
