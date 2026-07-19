'use client'

import { useState } from 'react'
import Header from '@/components/Header'
import Sidebar from '@/components/Sidebar'
import Button from '@/components/Button'
import Card from '@/components/Card'
import Input from '@/components/Input'
import { Save, RefreshCw } from 'lucide-react'

export default function SettingsPage() {
  const [settings, setSettings] = useState({
    appName: 'Marsad - منصة تقييم الموثوقية',
    companyEmail: 'admin@marsad.sa',
    supportEmail: 'support@marsad.sa',
    maxReportsPerUser: '10',
    maxCompaniesWatchlist: '50',
    approvalThreshold: '2',
    trustScoreMin: '0',
    trustScoreMax: '100',
    maintenanceMode: false,
    enableNotifications: true,
    enableReports: true,
    enableBulkImport: true,
  })

  const handleChange = (field: string, value: any) => {
    setSettings({ ...settings, [field]: value })
  }

  return (
    <div className="flex min-h-screen bg-gray-50 rtl">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="flex-1 p-6">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">إعدادات النظام</h1>
            <p className="text-gray-600 mt-2">إدارة إعدادات التطبيق والنظام</p>
          </div>

          {/* General Settings */}
          <Card className="mb-6">
            <div className="p-6 border-b">
              <h2 className="text-xl font-semibold text-gray-900">الإعدادات العامة</h2>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">اسم التطبيق</label>
                  <Input value={settings.appName} onChange={(e) => handleChange('appName', e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">بريد المسؤول</label>
                  <Input value={settings.companyEmail} onChange={(e) => handleChange('companyEmail', e.target.value)} type="email" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">بريد الدعم</label>
                  <Input value={settings.supportEmail} onChange={(e) => handleChange('supportEmail', e.target.value)} type="email" />
                </div>
              </div>
            </div>
          </Card>

          {/* Feature Limits */}
          <Card className="mb-6">
            <div className="p-6 border-b">
              <h2 className="text-xl font-semibold text-gray-900">حدود الميزات</h2>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">التقارير القصوى لكل مستخدم</label>
                  <Input value={settings.maxReportsPerUser} onChange={(e) => handleChange('maxReportsPerUser', e.target.value)} type="number" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">حد الشركات المراقبة</label>
                  <Input value={settings.maxCompaniesWatchlist} onChange={(e) => handleChange('maxCompaniesWatchlist', e.target.value)} type="number" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">حد الموافقات المطلوبة</label>
                  <Input value={settings.approvalThreshold} onChange={(e) => handleChange('approvalThreshold', e.target.value)} type="number" />
                </div>
              </div>
            </div>
          </Card>

          {/* Trust Score Settings */}
          <Card className="mb-6">
            <div className="p-6 border-b">
              <h2 className="text-xl font-semibold text-gray-900">إعدادات درجة الثقة</h2>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">أقل درجة ثقة</label>
                  <Input value={settings.trustScoreMin} onChange={(e) => handleChange('trustScoreMin', e.target.value)} type="number" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">أعلى درجة ثقة</label>
                  <Input value={settings.trustScoreMax} onChange={(e) => handleChange('trustScoreMax', e.target.value)} type="number" />
                </div>
              </div>
            </div>
          </Card>

          {/* Feature Toggles */}
          <Card className="mb-6">
            <div className="p-6 border-b">
              <h2 className="text-xl font-semibold text-gray-900">تبديل الميزات</h2>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between py-3 border-b">
                <div>
                  <p className="font-medium text-gray-900">وضع الصيانة</p>
                  <p className="text-sm text-gray-600">إيقاف التطبيق عن الخدمة مؤقتاً</p>
                </div>
                <label className="flex items-center">
                  <input type="checkbox" checked={settings.maintenanceMode} onChange={(e) => handleChange('maintenanceMode', e.target.checked)} className="w-4 h-4" />
                </label>
              </div>

              <div className="flex items-center justify-between py-3 border-b">
                <div>
                  <p className="font-medium text-gray-900">تفعيل الإشعارات</p>
                  <p className="text-sm text-gray-600">السماح بإرسال الإشعارات للمستخدمين</p>
                </div>
                <label className="flex items-center">
                  <input type="checkbox" checked={settings.enableNotifications} onChange={(e) => handleChange('enableNotifications', e.target.checked)} className="w-4 h-4" />
                </label>
              </div>

              <div className="flex items-center justify-between py-3 border-b">
                <div>
                  <p className="font-medium text-gray-900">تفعيل التقارير</p>
                  <p className="text-sm text-gray-600">السماح بتقديم التقارير الجديدة</p>
                </div>
                <label className="flex items-center">
                  <input type="checkbox" checked={settings.enableReports} onChange={(e) => handleChange('enableReports', e.target.checked)} className="w-4 h-4" />
                </label>
              </div>

              <div className="flex items-center justify-between py-3">
                <div>
                  <p className="font-medium text-gray-900">تفعيل الاستيراد الجماعي</p>
                  <p className="text-sm text-gray-600">السماح باستيراد شركات متعددة</p>
                </div>
                <label className="flex items-center">
                  <input type="checkbox" checked={settings.enableBulkImport} onChange={(e) => handleChange('enableBulkImport', e.target.checked)} className="w-4 h-4" />
                </label>
              </div>
            </div>
          </Card>

          {/* Action Buttons */}
          <div className="flex gap-4">
            <Button variant="primary" className="flex items-center gap-2">
              <Save size={20} />
              حفظ الإعدادات
            </Button>
            <Button variant="outline" className="flex items-center gap-2">
              <RefreshCw size={20} />
              إعادة تعيين
            </Button>
          </div>

          {/* Info Box */}
          <Card className="mt-8 bg-blue-50 border border-blue-200">
            <div className="p-6">
              <p className="text-sm text-blue-800">
                ℹ️ <strong>ملاحظة:</strong> جميع التغييرات على الإعدادات ستتطبق على جميع المستخدمين. تأكد من مراجعة التغييرات قبل الحفظ.
              </p>
            </div>
          </Card>
        </main>
      </div>
    </div>
  )
}
