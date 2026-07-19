'use client'

import { Search, Bell, User } from 'lucide-react'

export default function Header() {
  return (
    <header className="bg-white border-b border-slate-200 px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 flex-1">
          <Search size={20} className="text-slate-400" />
          <input
            type="text"
            placeholder="بحث عن شركة..."
            className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex items-center gap-4">
          <Bell size={20} className="text-slate-600 cursor-pointer" />
          <User size={20} className="text-slate-600 cursor-pointer" />
        </div>
      </div>
    </header>
  )
}
