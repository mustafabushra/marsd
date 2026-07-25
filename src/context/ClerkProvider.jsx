import { ClerkProvider as ClerkAuthProvider } from '@clerk/react'
import { arSA } from '@clerk/localizations'
import { clerkAppearance } from '../lib/clerkAppearance'

/**
 * A publishable key carries its own instance host, base64-encoded after the
 * pk_test_ / pk_live_ prefix and terminated with "$". Clerk derives the URL of
 * clerk.browser.js from it — so a key with one stray character produces
 * "https:///npm/..." with an empty host, the script never loads, isLoaded never
 * flips, and every screen sits on "جاري التحميل..." with nothing in the UI to
 * say why. That exact failure cost an afternoon, caused by a BOM that a shell
 * prepended while setting the variable.
 *
 * So: normalise what we are given, and if it still cannot be parsed, say so on
 * screen instead of hanging forever.
 */
function normalizeKey(raw) {
  if (typeof raw !== 'string') return ''
  return raw.replace(/^﻿/, '').trim().replace(/^["']|["']$/g, '')
}

function decodeInstanceHost(key) {
  const body = key.replace(/^pk_(test|live)_/, '')
  if (body === key) return null // prefix missing — not a publishable key
  try {
    const decoded = atob(body)
    return decoded.endsWith('$') ? decoded.slice(0, -1) : null
  } catch {
    return null
  }
}

const publishableKey = normalizeKey(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY)
const instanceHost = publishableKey ? decodeInstanceHost(publishableKey) : null

function ConfigError({ title, detail }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', padding: '24px', background: '#F8FAFC' }}>
      <div style={{ maxWidth: '560px', background: '#fff', border: '1px solid #FECACA', borderRadius: '16px', padding: '28px', textAlign: 'center' }}>
        <h1 style={{ fontSize: '19px', fontWeight: 900, color: '#B91C1C', margin: '0 0 12px' }}>⚠️ {title}</h1>
        <p style={{ fontSize: '14.5px', color: '#334155', lineHeight: 1.9, margin: '0 0 16px' }}>{detail}</p>
        <p style={{ fontSize: '13px', color: '#64748B', margin: 0 }}>
          تحقّق من <code style={{ background: '#F1F5F9', padding: '2px 6px', borderRadius: '5px', direction: 'ltr', display: 'inline-block' }}>VITE_CLERK_PUBLISHABLE_KEY</code> في إعدادات البيئة، ثم أعد النشر.
        </p>
      </div>
    </div>
  )
}

export function ClerkProvider({ children }) {
  if (!publishableKey) {
    return <ConfigError title="إعداد المصادقة ناقص" detail="مفتاح Clerk العلني غير موجود، فلا يمكن تشغيل تسجيل الدخول." />
  }

  if (!instanceHost) {
    return (
      <ConfigError
        title="مفتاح المصادقة غير صالح"
        detail={`المفتاح موجود لكن تعذّر قراءته (طوله ${publishableKey.length} حرفاً). غالباً فيه حرف زائد أو ناقص — سيفشل تحميل Clerk ويبقى التطبيق على شاشة التحميل.`}
      />
    )
  }

  // Localization and appearance sit here rather than on each component: the
  // nav's modal sign-in is rendered by Clerk, not by us, so anything passed
  // per-page would leave that one in English and unstyled.
  return (
    <ClerkAuthProvider
      publishableKey={publishableKey}
      localization={arSA}
      appearance={clerkAppearance}
    >
      {children}
    </ClerkAuthProvider>
  )
}
