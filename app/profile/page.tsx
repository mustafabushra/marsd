'use client'
'use client'

import { useState } from 'react'
import { User, Mail, Phone, MapPin, Building2, Edit2, Save } from 'lucide-react'
import Button from '@/components/Button'
import Input from '@/components/Input'
import Card from '@/components/Card'
import Alert from '@/components/Alert'
import Textarea from '@/components/Textarea'

export default function ProfilePage() {
  const [isEditing, setIsEditing] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  const [profileData, setProfileData] = useState({
    fullName: 'أحمد محمد',
    email: 'ahmed@example.com',
    phone: '+966501234567',
    company: 'شركة الأمل',
    address: 'الرياض، السعودية',
    bio: 'محترف في مجال التكنولوجيا',
    joinDate: '2023-06-15',
  })

  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })

  const handleProfileChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setProfileData({
      ...profileData,
      [e.target.name]: e.target.value,
    })
  }

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPasswordData({
      ...passwordData,
      [e.target.name]: e.target.value,
    })
  }

  const handleSaveProfile = async () => {
    setIsLoading(true)
    try {
      await new Promise((resolve) => setTimeout(resolve, 1000))
      setSuccess(true)
      setIsEditing(false)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      setError('فشل حفظ البيانات')
    } finally {
      setIsLoading(false)
    }
  }

  const handleChangePassword = async () => {
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setError('كلمات المرور غير متطابقة')
      return
    }

    setIsLoading(true)
    try {
      await new Promise((resolve) => setTimeout(resolve, 1000))
      setSuccess(true)
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' })
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      setError('فشل تغيير كلمة المرور')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-7 py-6">
        <h1 className="text-3xl font-900 text-slate-900">الملف الشخصي</h1>
        <p className="text-slate-600">إدارة معلومات حسابك</p>
      </div>

      {/* Content */}
      <main className="max-w-4xl mx-auto p-7">
        {success && (
          <Alert variant="success" className="mb-6">
            تم الحفظ بنجاح!
          </Alert>
        )}

        {error && (
          <Alert variant="error" className="mb-6" onClose={() => setError('')}>
            {error}
          </Alert>
        )}

        {/* Profile Section */}
        <Card className="mb-6">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h2 className="text-2xl font-700 text-slate-900">معلومات الحساب</h2>
              <p className="text-slate-600 text-sm">بيانات حسابك الشخصية</p>
            </div>
            <button
              onClick={() => setIsEditing(!isEditing)}
              className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition font-medium"
            >
              <Edit2 size={18} />
              {isEditing ? 'إلغاء' : 'تعديل'}
            </button>
          </div>

          {/* Profile Avatar */}
          <div className="mb-6">
            <div className="w-24 h-24 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full flex items-center justify-center mb-4">
              <User size={48} className="text-white" />
            </div>
            {isEditing && (
              <button className="text-blue-600 hover:text-blue-700 font-medium text-sm">
                تغيير الصورة
              </button>
            )}
          </div>

          {/* Profile Form */}
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="الاسم الكامل"
                name="fullName"
                value={profileData.fullName}
                onChange={handleProfileChange}
                disabled={!isEditing}
              />
              <Input
                label="البريد الإلكتروني"
                type="email"
                name="email"
                value={profileData.email}
                onChange={handleProfileChange}
                disabled={!isEditing}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="رقم الهاتف"
                type="tel"
                name="phone"
                value={profileData.phone}
                onChange={handleProfileChange}
                disabled={!isEditing}
              />
              <Input
                label="اسم الشركة"
                name="company"
                value={profileData.company}
                onChange={handleProfileChange}
                disabled={!isEditing}
              />
            </div>

            <Input
              label="العنوان"
              name="address"
              value={profileData.address}
              onChange={handleProfileChange}
              disabled={!isEditing}
            />

            <Textarea
              label="السيرة الذاتية"
              name="bio"
              value={profileData.bio}
              onChange={handleProfileChange}
              disabled={!isEditing}
              rows={4}
            />

            <div className="pt-3 border-t border-slate-200 text-sm text-slate-600">
              <p>تاريخ الانضمام: {profileData.joinDate}</p>
            </div>

            {isEditing && (
              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsEditing(false)}
                >
                  إلغاء
                </Button>
                <Button
                  type="button"
                  isLoading={isLoading}
                  onClick={handleSaveProfile}
                >
                  <Save size={18} />
                  حفظ التغييرات
                </Button>
              </div>
            )}
          </div>
        </Card>

        {/* Change Password Section */}
        <Card>
          <h2 className="text-2xl font-700 text-slate-900 mb-6">تغيير كلمة المرور</h2>

          <div className="space-y-4 max-w-md">
            <Input
              label="كلمة المرور الحالية"
              type="password"
              name="currentPassword"
              placeholder="••••••••"
              value={passwordData.currentPassword}
              onChange={handlePasswordChange}
            />

            <Input
              label="كلمة المرور الجديدة"
              type="password"
              name="newPassword"
              placeholder="••••••••"
              value={passwordData.newPassword}
              onChange={handlePasswordChange}
            />

            <Input
              label="تأكيد كلمة المرور الجديدة"
              type="password"
              name="confirmPassword"
              placeholder="••••••••"
              value={passwordData.confirmPassword}
              onChange={handlePasswordChange}
            />

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
              <p>
                تأكد من أن كلمة مرورك تحتوي على 8 أحرف على الأقل وتتضمن أحرف وأرقام ورموز خاصة.
              </p>
            </div>

            <Button
              isLoading={isLoading}
              onClick={handleChangePassword}
            >
              تحديث كلمة المرور
            </Button>
          </div>
        </Card>

        {/* Danger Zone */}
        <Card className="border-red-200 bg-red-50 mt-6">
          <h3 className="text-lg font-700 text-red-900 mb-4">منطقة الخطر</h3>
          <p className="text-sm text-red-800 mb-4">
            حذف حسابك سيؤدي إلى حذف جميع بيانات حسابك بشكل دائم. لا يمكن التراجع عن هذا الإجراء.
          </p>
          <Button variant="danger">حذف الحساب</Button>
        </Card>
      </main>
    </div>
  )
}
