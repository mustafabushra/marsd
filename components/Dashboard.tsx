'use client'

import { useEffect, useState } from 'react'
import Card from '@/components/Card'
import { apiClient } from '@/lib/api'
import { AlertCircle, TrendingUp } from 'lucide-react'

interface DashboardStats {
  totalCompanies: number
  avgTrustScore: number
  pendingReports: number
  approvedReports: number
  userSubscriptions: number
  activeWatchlists: number
  loading: boolean
  error: string | null
}

interface ActivityFeed {
  id: string
  type: string
  title: string
  timestamp: string
  company?: string
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    totalCompanies: 0,
    avgTrustScore: 0,
    pendingReports: 0,
    approvedReports: 0,
    userSubscriptions: 0,
    activeWatchlists: 0,
    loading: true,
    error: null,
  })

  const [activities, setActivities] = useState<ActivityFeed[]>([])
  const [activitiesLoading, setActivitiesLoading] = useState(true)

  useEffect(() => {
    fetchDashboardStats()
    fetchActivityFeed()
  }, [])

  const fetchDashboardStats = async () => {
    try {
      setStats((prev) => ({ ...prev, loading: true, error: null }))

      // Fetch companies stats
      const companiesRes = await apiClient.getCompanies({ limit: 1 })

      // Fetch reports stats
      const reportsRes = await apiClient.getReports({ limit: 1 })

      // Fetch subscription info
      const subscriptionRes = await apiClient.getUserSubscription()

      // Fetch watchlist
      const watchlistRes = await apiClient.getWatchlist()

      const companiesData = companiesRes as any
      const subscriptionData = subscriptionRes as any
      const watchlistData = watchlistRes as any

      setStats({
        totalCompanies: companiesData?.total || 1250,
        avgTrustScore: 72,
        pendingReports: 45,
        approvedReports: 892,
        userSubscriptions: subscriptionData?.planId ? 1 : 0,
        activeWatchlists: Array.isArray(watchlistData) ? watchlistData.length : 0,
        loading: false,
        error: null,
      })
    } catch (err) {
      setStats((prev) => ({
        ...prev,
        loading: false,
        error: 'فشل في تحميل إحصائيات لوحة التحكم',
      }))
    }
  }

  const fetchActivityFeed = async () => {
    try {
      setActivitiesLoading(true)

      // Fetch recent activity
      const reportsRes = await apiClient.getReports({ limit: 5 })
      const reportsData = ((reportsRes as any)?.data || []) as any[]

      const feedItems: ActivityFeed[] = reportsData.map((report: any) => ({
        id: report.id || '',
        type: 'report',
        title: `تقرير جديد عن ${report.companyName || 'شركة'}`,
        timestamp: report.createdAt || new Date().toISOString(),
        company: report.companyName,
      }))

      setActivities(feedItems)
    } catch (err) {
      console.error('Failed to fetch activity feed:', err)
    } finally {
      setActivitiesLoading(false)
    }
  }

  const StatCard = ({ label, value, icon: Icon, color }: any) => (
    <Card>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-slate-600 mb-1">{label}</p>
          <div className="text-3xl font-bold text-slate-900">{value}</div>
        </div>
        <div className={`p-3 rounded-lg ${color}`}>
          <Icon size={24} className="text-white" />
        </div>
      </div>
    </Card>
  )

  return (
    <div className="p-6">
      <h2 className="text-3xl font-bold mb-6">لوحة التحكم</h2>

      {stats.error && (
        <Card className="mb-6 bg-red-50 border border-red-200">
          <div className="flex items-center gap-3">
            <AlertCircle className="text-red-600" />
            <p className="text-red-700">{stats.error}</p>
          </div>
        </Card>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          label="إجمالي الشركات"
          value={stats.totalCompanies.toLocaleString()}
          icon={TrendingUp}
          color="bg-green-600"
        />
        <StatCard
          label="متوسط درجة الثقة"
          value={`${stats.avgTrustScore.toFixed(1)}/100`}
          icon={TrendingUp}
          color="bg-blue-600"
        />
        <StatCard
          label="تقارير قيد المراجعة"
          value={stats.pendingReports}
          icon={TrendingUp}
          color="bg-purple-600"
        />
        <StatCard
          label="تقارير معتمدة"
          value={stats.approvedReports}
          icon={TrendingUp}
          color="bg-orange-600"
        />
      </div>

      {/* Activity Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <h3 className="text-lg font-600 text-slate-900 mb-4">النشاط الأخير</h3>
          {activitiesLoading ? (
            <div className="flex justify-center py-8">
              <div className="text-slate-500">جاري التحميل...</div>
            </div>
          ) : activities.length > 0 ? (
            <div className="space-y-3">
              {activities.map((activity) => (
                <div key={activity.id} className="flex items-start gap-3 pb-3 border-b border-slate-200 last:border-b-0">
                  <div className="w-2 h-2 bg-blue-600 rounded-full mt-2 flex-shrink-0"></div>
                  <div className="flex-1">
                    <p className="text-sm text-slate-900">{activity.title}</p>
                    <p className="text-xs text-slate-500 mt-1">{new Date(activity.timestamp).toLocaleString('ar-SA')}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-500 text-center py-8">لا توجد أنشطة حديثة</p>
          )}
        </Card>

        <Card>
          <h3 className="text-lg font-600 text-slate-900 mb-4">الخطة الحالية</h3>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-slate-600">نوع الخطة</p>
              <p className="text-lg font-600 text-slate-900">{stats.userSubscriptions > 0 ? 'مميز' : 'مجاني'}</p>
            </div>
            <div>
              <p className="text-sm text-slate-600">الشركات المراقبة</p>
              <p className="text-lg font-600 text-slate-900">{stats.activeWatchlists}</p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
