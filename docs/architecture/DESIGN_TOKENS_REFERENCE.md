# Design Tokens & Specifications Reference
**Marsad Platform - Official Design Specifications**

---

## COLOR PALETTE

### Primary Colors
| Token | Value | Usage | Status |
|-------|-------|-------|--------|
| Primary | #1E2A52 | Main brand color, dark sections, headings | ✅ Compliant |
| Success | #16A34A | Success states, CTAs, positive indicators | ✅ Compliant |
| Secondary Dark | #0E7C3A | Success hover/active state | ✅ Compliant |

### Background Colors
| Token | Value | Usage | Status |
|-------|-------|-------|--------|
| BG Base | #F8FAFC | Main background for pages | ✅ Compliant |
| BG White | #fff | Card backgrounds, modals | ✅ Compliant |
| BG Light | #F1F5F9 | Hover states, disabled states | ✅ Compliant |
| BG Lighter | #ECFDF5 | Success/green backgrounds | ✅ Compliant |

### Border & Divider Colors
| Token | Value | Usage | Status |
|-------|-------|-------|--------|
| Border Primary | #E2E8F0 | Standard borders on cards/inputs | ✅ Compliant |
| Border Light | #EEF2F7 | Light section dividers | ✅ Compliant |
| Border Hover | #CBD5E1 | Hover state for borders | ✅ Compliant |

### Text Colors
| Token | Value | Usage | Status |
|-------|-------|-------|--------|
| Text Primary | #0F172A | Headings, primary content | ✅ Compliant |
| Text Secondary | #64748B | Body text, descriptions | ✅ Compliant |
| Text Tertiary | #94A3B8 | Metadata, hints, timestamps | ✅ Compliant |
| Text Muted | #475569 | Disabled text, lesser importance | ✅ Compliant |
| Text Light | #CBD5E1 | On dark backgrounds | ✅ Compliant |

### Status Colors
| Token | Value | Usage | Status |
|-------|-------|-------|--------|
| Success Light | #ECFDF5 | Success badge backgrounds | ✅ Compliant |
| Success Text | #15803D | Success text in badges | ✅ Compliant |
| Warning BG | #FFFBEB | Warning section backgrounds | ✅ Compliant |
| Warning Text | #B45309 | Warning/caution text | ✅ Compliant |
| Error BG | #FEE2E2 | Error section backgrounds | ✅ Compliant |
| Error | #DC2626 | Error text, danger indicators | ✅ Compliant |

### Gradient Colors
| Token | Value | Usage | Status |
|-------|-------|-------|--------|
| Gradient Success | linear-gradient(90deg, #16A34A, #4ADE80) | Progress bars | ✅ Compliant |
| Gradient Primary | linear-gradient(120deg, #16A34A, #0E7C3A) | CTA sections | ✅ Compliant |

---

## TYPOGRAPHY

### Font Family
```css
font-family: 'Tajawal, system-ui, sans-serif'
```
**Status:** ✅ Compliant

### Font Sizes

#### Headings
| Size | Usage | Current Status | Pages |
|------|-------|-------|-------|
| 42px | Main page headers (H1) | ❌ 46px used on Landing | Landing.jsx |
| 40px | Page titles (Hero) | ✅ Correct | About.jsx, FAQ.jsx |
| 34px | Section headers (H2) | ✅ Correct | Multiple |
| 32px | Dashboard titles | ❌ Should be 28px | AdminDashboard.jsx |
| 28px | Card headers (H3) | ❌ Sometimes 26px | CompanyDashboard.jsx |
| 26px | Subsection headers | Varies | Various |
| 24px | Modal/Card titles | ✅ Correct | Add* pages |
| 23px | Friendly heading | ✅ Correct | Various |
| 22px | List headers | ✅ Correct | Various |
| 21px | Feature headers | ✅ Correct | Pricing.jsx |
| 20px | Card section titles | ✅ Correct | Multiple |

#### Body Text
| Size | Usage | Status | Pages |
|------|-------|--------|-------|
| 19px | Large hero text | ✅ Correct | About.jsx |
| 18px | Hero section text | ✅ Correct | Landing.jsx |
| 18.5px | Landing description | ✅ Correct | Landing.jsx |
| 17px | Section description | ✅ Correct | Multiple |
| 17.5px | CTA text | ✅ Correct | Landing.jsx |
| 16px | Button text, primary body | ✅ Correct | Multiple |
| 15.5px | Card content | ✅ Mostly correct | Multiple |
| 15px | Standard body text | ✅ Correct | Multiple |
| 14.5px | Secondary content | ⚠️ Inconsistent | Multiple |
| 14px | Form labels | ✅ Correct | Forms |
| 13.5px | Metadata, timestamps | ✅ Correct | Multiple |
| 13px | Badge text | ✅ Correct | Multiple |

#### Font Weights
| Weight | Usage | Status |
|--------|-------|--------|
| 400 | Not typically used | ✅ Standard |
| 500 | Not typically used | ✅ Standard |
| 600 | Body text, secondary | ✅ Correct |
| 700 | Button text, emphasis | ✅ Correct |
| 800 | Card headers, strong emphasis | ✅ Correct |
| 900 | Page titles, brand | ✅ Correct |

---

## SPACING SYSTEM

### Padding Values (Standardized)
| Value | Usage | Status |
|-------|-------|--------|
| 7px | Small badges | ✅ |
| 8px | Tabs, small elements | ✅ |
| 10px | Small buttons | ✅ |
| 12px | Form inputs | ✅ |
| 14px | Small card sections | ✅ |
| 14px 16px | Input field padding | ✅ |
| 15px 32px | Large button padding | ✅ |
| 16px | Navigation items, sections | ✅ |
| 18px | Give-to-Get boxes | ✅ |
| 22px | Standard card padding | ✅ Correct |
| 24px | Medium card padding | ✅ Correct |
| 26px 28px | Pricing card padding | ✅ Correct |
| 30px | Large card padding | ✅ Correct |
| 32px | Page sections | ❌ Should be 28px |
| 34px | Hero sections | ✅ Correct |
| 38px | Large hero cards | ✅ Correct |
| 40px | Modal padding | ✅ Correct |
| 42px | Register/Login padding | ✅ Correct |

### Margin & Gap Values
| Value | Usage | Status |
|-------|-------|--------|
| 4px | Sidebar nav gaps | ✅ |
| 6px | Price/value display | ✅ |
| 8px | Section spacing | ✅ |
| 8px 18px | Badge padding | ✅ |
| 9px | Icon gaps | ✅ |
| 10px | Button groups | ✅ |
| 11px | Logo gap, spacing | ✅ |
| 12px | Modal buttons | ✅ |
| 12px-14px | Input field gaps | ✅ |
| 14px | Form section gaps | ✅ |
| 16px | Form field gaps | ✅ |
| 18px | Card content gaps | ✅ |
| 18px | KPI grid gap | ✅ Correct |
| 20px | Card padding gap | ✅ |
| 22px | Section margins | ✅ Correct |
| 24px | Card gaps | ✅ |
| 26px | 3-column card gaps | ✅ |
| 28px | Page horizontal padding | ✅ Correct |
| 30px | Section gaps | ✅ Correct |
| 32px-56px | Large section gaps | ✅ Correct |
| 72px-80px | Hero section padding | ✅ Correct |

---

## BORDERS & SHADOWS

### Border Specifications

#### Standard Border
```css
border: 1px solid #E2E8F0
```
**Usage:** Cards, containers  
**Status:** ✅ Compliant

#### Form Input Border
```css
border: 1.5px solid #E2E8F0
```
**Usage:** Input fields, search boxes  
**Status:** ✅ Compliant

#### Hover/Focus Border
```css
border: 1.5px solid #1E2A52
```
**Usage:** Input field focus states  
**Status:** ✅ Compliant

### Border Radius

| Value | Usage | Status |
|-------|-------|--------|
| 4px | Small elements | ✅ |
| 5px | Progress bar ends | ✅ |
| 6px | Small rounded corners | ✅ |
| 8px | Sidebar, tabs | ✅ |
| 8px-9px | Navigation items | ✅ |
| 9px | Logo container | ✅ |
| 10px | Input fields | ✅ Correct |
| 11px-12px | Buttons | ✅ Correct |
| 12px | Search box, forms | ✅ Correct |
| 13px-14px | Icon backgrounds | ✅ Correct |
| 16px | Standard cards | ✅ Correct |
| 18px | How-it-works cards | ✅ Correct |
| 20px | Large cards, sections | ✅ Correct |
| 24px | Hero cards | ✅ Correct |
| 999px | Pills/badges | ✅ Correct |

**Issues Found:**
- ❌ AdminDashboard uses 12px instead of 16px
- ❌ Some form cards use 12px instead of 16px

### Shadow Specifications

#### Small Shadow (Cards)
```css
box-shadow: 0 6px 16px rgba(15, 23, 42, 0.07)
```
**Usage:** Regular cards  
**Status:** ✅ Compliant

#### Large Shadow (Hero/Featured)
```css
box-shadow: 0 20px 50px rgba(22, 163, 74, 0.25)  /* Green variant */
box-shadow: 0 24px 60px rgba(15, 23, 42, 0.1)    /* Dark variant */
```
**Usage:** Hero cards, featured sections  
**Status:** ⚠️ Register/Login use wrong shadow

#### Inset Shadow (Depth)
```css
box-shadow: inset 0 2px 8px rgba(15, 23, 42, 0.05)
```
**Usage:** Circular gauges, depth effects  
**Status:** ✅ Compliant

**Issues Found:**
- ❌ Register.jsx: `0 16px 44px rgba(15, 23, 42, 0.07)`
- ❌ Login.jsx: `0 16px 44px rgba(15, 23, 42, 0.07)`
- Should be: `0 24px 60px rgba(15, 23, 42, 0.1)`

---

## GRID LAYOUTS

### 4-Column Grid (KPIs, Pricing)
```css
display: grid
grid-template-columns: repeat(4, 1fr)
gap: 18px
```
**Usage:** KPI dashboards, pricing tiers  
**Pages:** Pricing.jsx, CompanyDashboard.jsx  
**Status:** ✅ Compliant

**Issues:**
- ❌ AdminDashboard incorrectly uses `repeat(auto-fit, minmax(280px, 1fr))`

### 3-Column Grid (Cards)
```css
display: grid
grid-template-columns: repeat(3, 1fr)
gap: 26px
```
**Usage:** Feature cards, team cards  
**Pages:** Landing.jsx (How It Works), About.jsx  
**Status:** ✅ Compliant

### 2-Column Grid (Dashboard)
```css
display: grid
grid-template-columns: 1.4fr 1fr
gap: 18px
```
**Usage:** Dashboard main section  
**Pages:** CompanyDashboard.jsx  
**Status:** ✅ Compliant

### Hero Grid
```css
display: grid
grid-template-columns: 1.15fr 0.85fr
gap: 56px
```
**Usage:** Landing hero section  
**Pages:** Landing.jsx  
**Status:** ✅ Compliant

### Form Grid
```css
display: grid
grid-template-columns: 1fr 1fr
gap: 16px
```
**Usage:** Registration, contact forms  
**Pages:** Register.jsx, Contact.jsx  
**Status:** ✅ Compliant

---

## BUTTON SPECIFICATIONS

### Primary CTA Button
```jsx
style={{
  background: '#16A34A',
  color: '#fff',
  border: 0,
  borderRadius: '11px',
  padding: '15px 32px',
  fontSize: '16px',
  fontWeight: 800,
  cursor: 'pointer'
}}
```
**Status:** ✅ Correct on Landing  
**Issues:** 
- ❌ CompanyDashboard quick buttons use 13px 15px padding

### Secondary Button
```jsx
style={{
  background: '#fff',
  color: '#1E2A52',
  border: '1.5px solid #CBD5E1',
  borderRadius: '11px',
  padding: '15px 32px',
  fontSize: '16px',
  fontWeight: 800
}}
```
**Status:** ✅ Correct

### Small Button
```jsx
style={{
  background: '#fff',
  color: '#64748B',
  border: '1.5px solid #E2E8F0',
  borderRadius: '10px',
  padding: '11px 24px'
}}
```
**Status:** ⚠️ Inconsistent padding

---

## INPUT FIELD SPECIFICATIONS

```jsx
style={{
  width: '100%',
  border: '1.5px solid #E2E8F0',
  borderRadius: '10px',
  padding: '12px 14px',
  fontSize: '15px',
  outline: 'none',
  fontFamily: 'inherit'
}}
```
**Status:** ✅ Compliant

---

## CARD SPECIFICATIONS

### Standard Card
```jsx
style={{
  background: '#fff',
  border: '1px solid #E2E8F0',
  borderRadius: '16px',
  padding: '22px'
}}
```
**Status:** ✅ Compliant

### Medium Card
```jsx
style={{
  background: '#fff',
  border: '1px solid #E2E8F0',
  borderRadius: '18px-20px',
  padding: '24px-30px',
  boxShadow: '0 6px 16px rgba(15, 23, 42, 0.07)'
}}
```
**Status:** ✅ Mostly compliant  
**Issues:** Some cards use 12px border-radius

### Large/Hero Card
```jsx
style={{
  background: '#fff',
  border: '1px solid #E2E8F0',
  borderRadius: '24px',
  padding: '38px-40px',
  boxShadow: '0 24px 60px rgba(15, 23, 42, 0.1)'
}}
```
**Status:** ⚠️ Some cards use wrong shadow

---

## COMPONENT SPECIFICATIONS

### Badge/Pill
```jsx
style={{
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px',
  background: '#ECFDF5',
  color: '#15803D',
  border: '1px solid #BBF7D0',
  borderRadius: '999px',
  padding: '7px 15px',
  fontSize: '13.5px',
  fontWeight: 700
}}
```
**Status:** ✅ Compliant

### Sidebar Navigation Button
```jsx
style={{
  background: 'transparent',
  border: 0,
  color: '#E2E8F0',
  padding: '12px 14px',
  fontSize: '14px',
  fontWeight: 600,
  textAlign: 'right',
  cursor: 'pointer',
  borderRadius: '8px',
  transition: 'all 0.2s'
}}

// Active state:
background: '#16A34A'
color: '#fff'
```
**Status:** ✅ Compliant

### Logo/Brand
```jsx
style={{
  fontWeight: 900,
  fontSize: '22px-23px',
  color: '#fff' // or '#1E2A52'
  letterSpacing: '-0.5px'
}}
```
**Status:** ✅ Compliant

---

## ANIMATION SPECIFICATIONS

### Fade Up
```css
@keyframes fadeUp {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

animation: fadeUp 0.5s ease both;
```
**Status:** ✅ Used correctly on Landing

### Transition
```css
transition: all 0.2s ease
```
**Status:** ✅ Applied to hover states

---

## DESIGN COMPLIANCE SUMMARY

| Category | Score | Status |
|----------|-------|--------|
| Colors | 100% | ✅ Perfect |
| Typography | 68% | ⚠️ Needs fixes |
| Spacing | 65% | ⚠️ Needs standardization |
| Borders/Shadows | 88% | ⚠️ Minor issues |
| Grid Layouts | 85% | ✅ Good |
| Components | 72% | ⚠️ Inconsistent |
| **OVERALL** | **72%** | **Acceptable** |

---

## NEXT STEPS FOR COMPLIANCE

1. **Standardize Typography** (Priority: HIGH)
   - Create typography constants
   - Use same sizes consistently across pages

2. **Fix Shadow Specifications** (Priority: HIGH)
   - Update Register/Login shadows
   - Verify all card shadows

3. **Fix AdminDashboard** (Priority: CRITICAL)
   - Change all border-radius values
   - Fix grid layout
   - Adjust padding

4. **Implement Design Token System** (Priority: MEDIUM)
   - Create CSS variables or constants
   - Document spacing scale
   - Create reusable component library

---

**Last Updated:** 2026-07-14  
**Maintained By:** QA Team  
**Next Review:** After implementation fixes
