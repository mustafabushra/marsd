export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-green-500 rounded-full mb-4">
            <span className="text-3xl font-900 text-white">✓</span>
          </div>
          <h1 className="text-3xl font-900 text-white mb-1">مرصد</h1>
          <p className="text-slate-400">منصة تقييم موثوقية الأعمال</p>
        </div>

        {children}
      </div>
    </div>
  )
}
