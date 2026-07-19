'use client'

import { useState } from 'react'
import Header from '@/components/Header'
import Sidebar from '@/components/Sidebar'
import Button from '@/components/Button'
import Card from '@/components/Card'
import Input from '@/components/Input'
import Badge from '@/components/Badge'
import { formatDate } from '@/lib/utils'
import { Search, Download, Filter } from 'lucide-react'

interface AuditLog {
  id: string
  action: string
  user: string
  target: string
  timestamp: string
  status: 'success' | 'failed' | 'warning'
  details: string
}

const mockLogs: AuditLog[] = [
  { id: '1', action: 'تعديل التقرير', user: 'مريم خالد', target: 'تقرير #234', timestamp: '2026-07-09T16:45:00', status: 'success', details: 'تم الموافقة على التقرير' },
  { id: '2', action: 'حذف مستخدم', user: 'مريم خالد', target: 'مستخدم #567', timestamp: '2026-07-09T15:30:00', status: 'success', details: 'حذف حساب معطل' },
  { id: '3', action: 'تحديث الشركة', user: 'محمود سعيد', target: 'شركة #123', timestamp: '2026-07-09T14:20:00', status: 'success', details: 'تحديث معلومات الشركة' },
  { id: '4', action: 'رفض التقرير', user: 'مريم خالد', target: 'تقرير #456', timestamp: '2026-07-09T13:15:00', status: 'failed', details: 'انتهاك السياسات' },
  { id: '5', action: 'إضافة مستخدم', user: 'مريم خالد', target: 'مستخدم جديد', timestamp: '2026-07-09T12:00:00', status: 'success', details: 'إضافة موظف جديد' },
  { id: '6', action: 'تصدير تقارير', user: 'محمود سعيد', target: 'تقارير', timestamp: '2026-07-08T18:30:00', status: 'warning', details: '500 تقرير تم تصديره' },
  { id: '7', action: 'تغيير الصلاحيات', user: 'مريم خالد', target: 'مستخدم #789', timestamp: '2026-07-08T17:00:00', status: 'success', details: 'ترقية إلى مسؤول' },
  { id: '8', action: 'تحديث الإعدادات', user: 'مريم خالد', target: 'الإعدادات العامة', timestamp: '2026-07-08T16:45:00', status: 'success', details: 'تحديث حد الموافقة' },
]

export default function AuditLogsPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'success' | 'failed' | 'warning'>('all')

  const filteredLogs = mockLogs.filter((log) => {
    const matchesSearch = log.action.includes(searchQuery) || log.user.includes(searchQuery) || log.target.includes(searchQuery)
    const matchesStatus = statusFilter === 'all' || log.status === statusFilter
    return matchesSearch && matchesStatus
  })

  return (
    <div className="flex min-h-screen bg-gray-50 rtl">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="flex-1 p-6">
          <div className="mb-8">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">سجل التدقيق</h1>
                <p className="text-gray-600 mt-2">جميع الأنشطة والعمليات على النظام</p>
              </div>
              <Button variant="primary" className="flex items-center gap-2">
                <Download size={20} />
                تصدير السجلات
              </Button>
            </div>
          </div>

          <Card className="mb-6 p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <Input placeholder="ابحث عن إجراء أو مستخدم أو هدف..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
              </div>
              <div>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent">
                  <option value="all">جميع الحالات</option>
                  <option value="success">نجح</option>
                  <option value="failed">فشل</option>
                  <option value="warning">تحذير</option>
                </select>
              </div>
            </div>
          </Card>

          <Card>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-right py-4 px-6 text-sm font-semibold text-gray-700">الإجراء</th>
                    <th className="text-right py-4 px-6 text-sm font-semibold text-gray-700">المستخدم</th>
                    <th className="text-right py-4 px-6 text-sm font-semibold text-gray-700">الهدف</th>
                    <th className="text-right py-4 px-6 text-sm font-semibold text-gray-700">الوقت</th>
                    <th className="text-right py-4 px-6 text-sm font-semibold text-gray-700">الحالة</th>
                    <th className="text-right py-4 px-6 text-sm font-semibold text-gray-700">التفاصيل</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.map((log) => (
                    <tr key={log.id} className="border-b hover:bg-gray-50">
                      <td className="py-4 px-6"><p className="font-medium text-gray-900">{log.action}</p></td>
                      <td className="py-4 px-6"><p className="text-sm text-gray-600">{log.user}</p></td>
                      <td className="py-4 px-6"><p className="text-sm text-gray-600">{log.target}</p></td>
                      <td className="py-4 px-6"><p className="text-sm text-gray-600">{formatDate(log.timestamp)}</p></td>
                      <td className="py-4 px-6">
                        <Badge variant={log.status === 'success' ? 'success' : log.status === 'failed' ? 'error' : 'warning'}>
                          {log.status === 'success' ? 'نجح' : log.status === 'failed' ? 'فشل' : 'تحذير'}
                        </Badge>
                      </td>
                      <td className="py-4 px-6"><p className="text-sm text-gray-600">{log.details}</p></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </main>
      </div>
    </div>
  )
}
