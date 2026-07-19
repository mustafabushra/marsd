import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Marsad - منصة تقييم موثوقية الأعمال',
  description: 'Platform for business reliability assessment and management',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body className="font-tajawal">
        {children}
      </body>
    </html>
  )
}
