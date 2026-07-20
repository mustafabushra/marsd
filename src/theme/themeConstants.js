/**
 * MARSAD THEME CONSTANTS
 * Single Source of Truth extracted from design-approved.html
 * Last Updated: July 14, 2026
 */

export const COLORS = {
  // Primary & Core
  primary: '#1E2A52',
  primaryDark: '#0E7C3A',

  // Success / Green
  success: '#16A34A',
  successLight: '#ECFDF5',
  successBorder: '#BBF7D0',
  successDark: '#15803D',
  greenAlt: '#1F6E43',
  greenLight: '#86EFAC',
  greenVeryLight: '#4ADE80',

  // Backgrounds
  bgLight: '#F8FAFC',
  bgVeryLight: '#F1F5F9',
  bgWhite: '#fff',
  bgOverlay: 'rgba(255,255,255,.05)',
  bgOverlayDark: 'rgba(255,255,255,.06)',
  bgDarkOverlay: 'rgba(22,163,74,.2)',

  // Borders
  border: '#E2E8F0',
  borderLight: '#EEF2F7',
  borderInverse: 'rgba(255,255,255,.1)',
  borderInverseAlt: 'rgba(255,255,255,.12)',

  // Text
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textTertiary: '#64748B',
  textQuaternary: '#94A3B8',
  textInverse: '#fff',
  textInverseAlt: '#CBD5E1',
  textInverseLight: '#DCFCE7',

  // Status
  errorBg: '#FEF2F2',

  // UI Specific
  navInactive: '#334155',
  checkmarkBg: '#ECFDF5',
  checkmarkText: '#15803D',
  profileBg: '#1E2A52',
  lightBlueBg: '#EEF2FF',
  lightPurpleBg: '#F5F3FF',
  notificationRed: '#DC2626',
  grayText: '#64748B',
  darkGrayBar: '#64748B',
};

export const SPACING = {
  // Padding
  p4: '4px',
  p5: '5px',
  p6: '6px',
  p7: '7px',
  p8: '8px',
  p9: '9px',
  p10: '10px',
  p12: '12px',
  p13: '13px',
  p14: '14px',
  p15: '15px',
  p16: '16px',
  p18: '18px',
  p20: '20px',
  p22: '22px',
  p24: '24px',
  p26: '26px',
  p28: '28px',
  p30: '30px',
  p32: '32px',
  p34: '34px',
  p38: '38px',
  p40: '40px',
  p42: '42px',
  p50: '50px',
  p54: '54px',
  p60: '60px',
  p68: '68px',
  p72: '72px',
  p74: '74px',
  p80: '80px',

  // Gap/Margin
  gap2: '2px',
  gap4: '4px',
  gap5: '5px',
  gap6: '6px',
  gap7: '7px',
  gap8: '8px',
  gap9: '9px',
  gap10: '10px',
  gap11: '11px',
  gap12: '12px',
  gap13: '13px',
  gap14: '14px',
  gap16: '16px',
  gap18: '18px',
  gap20: '20px',
  gap24: '24px',
  gap26: '26px',
  gap28: '28px',
  gap30: '30px',
  gap38: '38px',
  gap56: '56px',
  gap60: '60px',
};

export const TYPOGRAPHY = {
  fontFamily: 'Tajawal, system-ui, sans-serif',
  fontFamilyArabic: 'Tajawal, sans-serif',

  // Font Sizes
  size11: '11px',
  size12: '12.5px',
  size13: '13px',
  size13_5: '13.5px',
  size14: '14px',
  size14_5: '14.5px',
  size15: '15px',
  size15_5: '15.5px',
  size16: '16px',
  size17: '17px',
  size17_5: '17.5px',
  size18: '18px',
  size18_5: '18.5px',
  size19: '19px',
  size20: '20px',
  size21: '21px',
  size22: '22px',
  size23: '23px',
  size24: '24px',
  size25: '25px',
  size26: '26px',
  size28: '28px',
  size32: '32px',
  size34: '34px',
  size36: '36px',
  size40: '40px',
  size42: '42px',
  size46: '46px',
  size52: '52px',
  size54: '54px',

  // Font Weights
  w400: 400,
  w500: 500,
  w600: 600,
  w700: 700,
  w800: 800,
  w900: 900,
};

export const BORDER_RADIUS = {
  r4: '4px',
  r5: '5px',
  r8: '8px',
  r9: '9px',
  r10: '10px',
  r11: '11px',
  r12: '12px',
  r13: '13px',
  r14: '14px',
  r16: '16px',
  r18: '18px',
  r20: '20px',
  r24: '24px',
  rFull: '999px',
  rCircle: '50%',
};

export const BORDERS = {
  solid1px: '1px solid #E2E8F0',
  solid1_5px: '1.5px solid #E2E8F0',
  solidInverse: '1px solid rgba(255,255,255,.1)',
  solidInverseAlt: '1px solid rgba(255,255,255,.12)',
};

export const SHADOWS = {
  sm: '0 2px 8px rgba(15,23,42,.05)',
  md: '0 6px 16px rgba(22,163,74,.25)',
  lg: '0 16px 44px rgba(15,23,42,.07)',
  xl: '0 20px 50px rgba(22,163,74,.25)',
  card: '0 24px 60px rgba(15,23,42,.10)',
};

export const GRADIENTS = {
  landingHero: 'linear-gradient(180deg,#fff 0%,#F8FAFC 100%)',
  cta: 'linear-gradient(120deg,#16A34A,#0E7C3A)',
  progressBar: 'linear-gradient(90deg,#16A34A,#4ADE80)',
  logo: 'linear-gradient(to bottom right, #1E2A52, #1F6E43, #16A34A)',
};

export const Z_INDEX = {
  header: 40,
  sidebar: 'auto',
  modal: 30,
  notification: 'auto',
};

export const DIMENSIONS = {
  headerHeight: '70px',
  companyHeaderHeight: '68px',
  sidebarWidth: '268px',
  maxWidth: '1200px',
  maxWidth1000: '1000px',
  maxWidth1100: '1100px',
  maxWidth1080: '1080px',
  maxWidth1240: '1240px',
};

export const ANIMATIONS = {
  fadeUp: 'fadeUp .5s ease both',
  fadeUpSlow: 'fadeUp .6s ease both',
};

export const KEYFRAMES = {
  fadeUp: `
    @keyframes fadeUp {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: none; }
    }
  `,
};

/**
 * Helper function to create consistent inline styles
 */
export const createStyle = (styleObject) => {
  return Object.entries(styleObject)
    .map(([key, value]) => `${camelToKebab(key)}:${value}`)
    .join(';');
};

const camelToKebab = (str) => {
  return str.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
};

export default {
  COLORS,
  SPACING,
  TYPOGRAPHY,
  BORDER_RADIUS,
  BORDERS,
  SHADOWS,
  GRADIENTS,
  Z_INDEX,
  DIMENSIONS,
  ANIMATIONS,
  KEYFRAMES,
};
