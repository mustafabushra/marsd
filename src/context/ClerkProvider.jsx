import { ClerkProvider as ClerkAuthProvider } from '@clerk/react'

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

if (!publishableKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY')
}

export function ClerkProvider({ children }) {
  return (
    <ClerkAuthProvider publishableKey={publishableKey}>
      {children}
    </ClerkAuthProvider>
  )
}
