'use client'

import { useState } from 'react'
import Header from '@/components/Header'
import Sidebar from '@/components/Sidebar'
import Button from '@/components/Button'
import Card from '@/components/Card'
import Badge from '@/components/Badge'
import { dashboardStats, users, reports } from '@/lib/mockData'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  BarChart3,
  TrendingUp,
  Users as UsersIcon,
  FileText,
  CheckCircle,
  AlertCircle,
  Eye,
} from 'lucide-react'

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<'overview' | 'reports' | 'activity'>('overview')

  // Calculate trending data
  const trendingUp = 12
  const trendingDown = 3

  return (
    <div className="flex min-h-screen bg-gray-50 rtl">
      <Sidebar />

      <div className="flex-1 flex flex-col">
        <Header />

        <main className="flex-1 p-6">
          {/* Page Title */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">لوحة تحكم المسؤول</h1>
            <p className="text-gray-600 mt-2">مرحباً بك في لوحة التحكم الرئيسية</p>
          </div>

          {/* Top Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {/* Total Companies */}
            <Card className="hover:shadow-lg transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm font-medium">إجمالي الشركات</p>
                  <p className="text-3xl font-bold text-gray-900 mt-2">
                    {dashboardStats.totalCompanies.toLocaleString('ar-SA')}
                  </p>
                  <p className="text-green-600 text-sm mt-2 flex items-center">
                    <TrendingUp size={16} className="mr-1" />
                    {dashboardStats.activeCompanies} نشطة
                  </p>
                </div>
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <BarChart3 className="text-blue-600" size={24} />
                </div>
              </div>
            </Card>

            {/* Total Reports */}
            <Card className="hover:shadow-lg transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm font-medium">إجمالي التقارير</p>
                  <p className="text-3xl font-bold text-gray-900 mt-2">
                    {dashboardStats.totalReports.toLocaleString('ar-SA')}
                  </p>
                  <p className="text-green-600 text-sm mt-2">
                    {dashboardStats.newReportsThisMonth} هذا الشهر
                  </p>
                </div>
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                  <FileText className="text-green-600" size={24} />
                </div>
              </div>
            </Card>

            {/* Total Users */}
            <Card className="hover:shadow-lg transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm font-medium">إجمالي المستخدمين</p>
                  <p className="text-3xl font-bold text-gray-900 mt-2">
                    {dashboardStats.totalUsers.toLocaleString('ar-SA')}
                  </p>
                  <p className="text-blue-600 text-sm mt-2">
                    {dashboardStats.newUsersThisMonth} جديد هذا الشهر
                  </p>
                </div>
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                  <UsersIcon className="text-purple-600" size={24} />
                </div>
              </div>
            </Card>

            {/* Avg Trust Score */}
            <Card className="hover:shadow-lg transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm font-medium">متوسط درجة الثقة</p>
                  <p className="text-3xl font-bold text-gray-900 mt-2">
                    {dashboardStats.averageTrustScore}%
                  </p>
                  <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-green-600 h-2 rounded-full"
                      style={{ width: `${dashboardStats.averageTrustScore}%` }}
                    ></div>
                  </div>
                </div>
                <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
                  <Eye className="text-yellow-600" size={24} />
                </div>
              </div>
            </Card>
          </div>

          {/* Secondary Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {/* Reports Approved */}
            <Card className="border-l-4 border-l-green-600">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm font-medium">التقارير الموافق عليها</p>
                  <p className="text-2xl font-bold text-green-600 mt-2">
                    {dashboardStats.reportsApprovedThisMonth}
                  </p>
                </div>
                <CheckCircle className="text-green-600" size={32} />
              </div>
            </Card>

            {/* Reports Rejected */}
            <Card className="border-l-4 border-l-red-600">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm font-medium">التقارير المرفوضة</p>
                  <p className="text-2xl font-bold text-red-600 mt-2">
                    {dashboardStats.reportsRejectedThisMonth}
                  </p>
                </div>
                <AlertCircle className="text-red-600" size={32} />
              </div>
            </Card>

            {/* Reports Pending */}
            <Card className="border-l-4 border-l-yellow-600">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm font-medium">التقارير المعلقة</p>
                  <p className="text-2xl font-bold text-yellow-600 mt-2">
                    {dashboardStats.reportsPendingModeration}
                  </p>
                </div>
                <AlertCircle className="text-yellow-600" size={32} />
              </div>
            </Card>
          </div>

          {/* Tabs */}
          <div className="mb-6 flex gap-4">
            <Button
              variant={activeTab === 'overview' ? 'primary' : 'ghost'}
              onClick={() => setActiveTab('overview')}
            >
              نظرة عامة
            </Button>
            <Button
              variant={activeTab === 'reports' ? 'primary' : 'ghost'}
              onClick={() => setActiveTab('reports')}
            >
              التقارير الأخيرة
            </Button>
            <Button
              variant={activeTab === 'activity' ? 'primary' : 'ghost'}
              onClick={() => setActiveTab('activity')}
            >
              النشاط الأخير
            </Button>
          </div>

          {/* Tab Content */}
          {activeTab === 'overview' && (
            <Card>
              <div className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">ملخص الأداء</h3>

                {/* Performance Metrics */}
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between mb-2">
                      <span className="text-sm text-gray-600">معدل الموافقة على التقارير</span>
                      <span className="text-sm font-semibold text-gray-900">88%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div className="bg-green-600 h-2 rounded-full" style={{ width: '88%' }}></div>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between mb-2">
                      <span className="text-sm text-gray-600">رضا المستخدمين</span>
                      <span className="text-sm font-semibold text-gray-900">92%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div className="bg-blue-600 h-2 rounded-full" style={{ width: '92%' }}></div>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between mb-2">
                      <span className="text-sm text-gray-600">جودة البيانات</span>
                      <span className="text-sm font-semibold text-gray-900">95%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div className="bg-purple-600 h-2 rounded-full" style={{ width: '95%' }}></div>
                    </div>
                  </div>
                </div>

                {/* Key Insights */}
                <div className="mt-8 pt-8 border-t">
                  <h4 className="text-sm font-semibold text-gray-900 mb-4">رؤى رئيسية</h4>
                  <div className="space-y-3">
                    <p className="text-sm text-gray-600">
                      ✓ ارتفاع في عدد التقارير الجديدة بنسبة 12% مقارنة بالشهر السابق
                    </p>
                    <p className="text-sm text-gray-600">
                      ✓ معدل الموافقة على التقارير مستقر عند 88%
                    </p>
                    <p className="text-sm text-gray-600">
                      ✓ زيادة ملحوظة في المستخدمين الجدد (456 مستخدم هذا الشهر)
                    </p>
                  </div>
                </div>
              </div>
            </Card>
          )}

          {activeTab === 'reports' && (
            <Card>
              <div className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">أحدث التقارير</h3>

                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">
                          الشركة
                        </th>
                        <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">
                          العنوان
                        </th>
                        <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">
                          التقييم
                        </th>
                        <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">
                          الحالة
                        </th>
                        <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">
                          التاريخ
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {reports.slice(0, 5).map((report) => (
                        <tr key={report.id} className="border-b hover:bg-gray-50">
                          <td className="py-3 px-4 text-sm text-gray-900">
                            {report.companyName}
                          </td>
                          <td className="py-3 px-4 text-sm text-gray-600">{report.title}</td>
                          <td className="py-3 px-4 text-sm">
                            <Badge
                              variant={
                                report.rating >= 4
                                  ? 'success'
                                  : report.rating >= 3
                                    ? 'warning'
                                    : 'error'
                              }
                            >
                              {report.rating} ⭐
                            </Badge>
                          </td>
                          <td className="py-3 px-4 text-sm">
                            <Badge
                              variant={
                                report.status === 'verified'
                                  ? 'success'
                                  : report.status === 'pending'
                                    ? 'warning'
                                    : 'error'
                              }
                            >
                              {report.status}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 text-sm text-gray-600">
                            {formatDate(report.date)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </Card>
          )}

          {activeTab === 'activity' && (
            <Card>
              <div className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">النشاط الأخير</h3>

                <div className="space-y-4">
                  {users.slice(0, 8).map((user, index) => (
                    <div key={user.id} className="flex items-center justify-between py-3 border-b last:border-b-0">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{user.name}</p>
                        <p className="text-xs text-gray-600 mt-1">{user.email}</p>
                      </div>
                      <div className="text-right">
                        <Badge
                          variant={
                            user.role === 'admin'
                              ? 'error'
                              : user.role === 'staff'
                                ? 'warning'
                                : 'success'
                          }
                        >
                          {user.role}
                        </Badge>
                        <p className="text-xs text-gray-500 mt-1">
                          آخر دخول: {formatDate(user.lastLogin)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          )}
        </main>
      </div>
    </div>
  )
}
