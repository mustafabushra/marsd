'use client'

import { Home, Building2, FileText, Eye, TrendingUp, Settings } from 'lucide-react'
import Link from 'next/link'

export default function Sidebar() {
  return (
    <aside className="w-64 bg-slate-900 text-white p-6">
      <h1 className="text-2xl font-bold mb-8">مرصد</h1>
      <nav className="space-y-2">
        <Link href="/dashboard" className="flex items-center gap-3 px-4 py-2 rounded-lg hover:bg-slate-800">
          <Home size={20} />
          <span>لوحة التحكم</span>
        </Link>
        <Link href="/companies" className="flex items-center gap-3 px-4 py-2 rounded-lg hover:bg-slate-800">
          <Building2 size={20} />
          <span>الشركات</span>
        </Link>
        <Link href="/reports" className="flex items-center gap-3 px-4 py-2 rounded-lg hover:bg-slate-800">
          <FileText size={20} />
          <span>التقارير</span>
        </Link>
        <Link href="/watchlist" className="flex items-center gap-3 px-4 py-2 rounded-lg hover:bg-slate-800">
          <Eye size={20} />
          <span>المراقبة</span>
        </Link>
        <Link href="/subscriptions" className="flex items-center gap-3 px-4 py-2 rounded-lg hover:bg-slate-800">
          <TrendingUp size={20} />
          <span>الاشتراكات</span>
        </Link>
      </nav>
    </aside>
  )
}
