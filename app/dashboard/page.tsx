'use client'

import { useEffect, useState } from 'react'
import Header from '@/components/Header'
import Sidebar from '@/components/Sidebar'
import Dashboard from '@/components/Dashboard'

export default function DashboardPage() {
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    setIsClient(true)
  }, [])

  return (
    <div className="flex h-screen bg-slate-50">
      {isClient ? (
        <>
          <Sidebar />
          <div className="flex-1 flex flex-col">
            <Header />
            <main className="flex-1 overflow-auto">
              <Dashboard />
            </main>
          </div>
        </>
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-slate-50">
          <div className="text-center">
            <div className="text-2xl font-bold text-slate-900 mb-2">مرصد</div>
            <p className="text-slate-600">جاري التحميل...</p>
          </div>
        </div>
      )}
    </div>
  )
}
