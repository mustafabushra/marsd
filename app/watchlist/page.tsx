'use client'
'use client'

import { useState } from 'react'
import { Bell, Trash2, Eye, TrendingUp } from 'lucide-react'
import Card from '@/components/Card'
import Button from '@/components/Button'
import Badge from '@/components/Badge'

interface WatchlistItem {
  id: string
  company: string
  trustScore: number
  change: number
  lastUpdate: string
  alerts: number
  status: 'stable' | 'rising' | 'falling'
}

const SAMPLE_WATCHLIST: WatchlistItem[] = [
  {
    id: '1',
    company: 'شركة الأمل',
    trustScore: 92,
    change: 5,
    lastUpdate: '2024-01-15',
    alerts: 0,
    status: 'rising',
  },
  {
    id: '2',
    company: 'مؤسسة النجاح',
    trustScore: 78,
    change: -2,
    lastUpdate: '2024-01-10',
    alerts: 1,
    status: 'falling',
  },
  {
    id: '3',
    company: 'الشركة العالمية',
    trustScore: 65,
    change: 0,
    lastUpdate: '2024-01-05',
    alerts: 3,
    status: 'stable',
  },
]

export default function WatchlistPage() {
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>(SAMPLE_WATCHLIST)

  const handleRemove = (id: string) => {
    setWatchlist(watchlist.filter((item) => item.id !== id))
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'rising':
        return 'text-green-600'
      case 'falling':
        return 'text-red-600'
      default:
        return 'text-slate-600'
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'rising':
        return '↑ صاعد'
      case 'falling':
        return '↓ هابط'
      default:
        return '→ مستقر'
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-7 py-6">
        <div>
          <h1 className="text-3xl font-900 text-slate-900">قائمة المراقبة</h1>
          <p className="text-slate-600">تابع تقييمات الشركات المهمة بالنسبة لك</p>
        </div>
      </div>

      {/* Content */}
      <main className="p-7">
        {watchlist.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {watchlist.map((item) => (
              <Card key={item.id} className="flex flex-col">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-700 text-slate-900">{item.company}</h3>
                    <p className="text-sm text-slate-500">{item.lastUpdate}</p>
                  </div>
                  <button
                    onClick={() => handleRemove(item.id)}
                    className="p-2 hover:bg-red-50 rounded-lg transition"
                  >
                    <Trash2 size={18} className="text-red-600" />
                  </button>
                </div>

                {/* Trust Score */}
                <div className="mb-4">
                  <div className="flex items-end gap-2 mb-2">
                    <span className="text-3xl font-900 text-slate-900">{item.trustScore}</span>
                    <span className="text-sm text-slate-600">/100</span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-2">
                    <div
                      className="bg-green-600 h-2 rounded-full"
                      style={{ width: `${item.trustScore}%` }}
                    ></div>
                  </div>
                </div>

                {/* Status and Change */}
                <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-200">
                  <Badge variant="default">
                    <span className={getStatusColor(item.status)}>
                      {getStatusLabel(item.status)}
                    </span>
                  </Badge>
                  <span className={`font-medium ${item.change > 0 ? 'text-green-600' : item.change < 0 ? 'text-red-600' : 'text-slate-600'}`}>
                    {item.change > 0 ? '+' : ''}{item.change}%
                  </span>
                </div>

                {/* Alerts */}
                {item.alerts > 0 && (
                  <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start gap-2">
                    <Bell size={16} className="text-yellow-600 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-yellow-800">
                      <strong>{item.alerts}</strong> تنبيهات جديدة
                    </p>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 mt-auto">
                  <Button variant="outline" fullWidth size="sm">
                    <Eye size={16} />
                    عرض
                  </Button>
                  <Button variant="ghost" fullWidth size="sm">
                    <Bell size={16} />
                    إعدادات
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="text-center py-12">
            <Eye size={48} className="text-slate-300 mx-auto mb-4" />
            <p className="text-slate-600 mb-4">لم تضف أي شركات إلى قائمة المراقبة بعد</p>
            <Button>أضف شركة الآن</Button>
          </Card>
        )}
      </main>
    </div>
  )
}
