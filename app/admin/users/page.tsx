'use client'

import { useState } from 'react'
import Header from '@/components/Header'
import Sidebar from '@/components/Sidebar'
import Button from '@/components/Button'
import Card from '@/components/Card'
import Input from '@/components/Input'
import Badge from '@/components/Badge'
import Modal from '@/components/Modal'
import { users } from '@/lib/mockData'
import { formatDate } from '@/lib/utils'
import { Search, Edit, Trash2, Plus, Filter } from 'lucide-react'

export default function UsersPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<'all' | 'user' | 'staff' | 'admin'>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive' | 'suspended'>('all')
  const [selectedUser, setSelectedUser] = useState<(typeof users)[0] | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  // Filter users
  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase())

    const matchesRole = roleFilter === 'all' || user.role === roleFilter
    const matchesStatus = statusFilter === 'all' || user.status === statusFilter

    return matchesSearch && matchesRole && matchesStatus
  })

  const handleEditUser = (user: (typeof users)[0]) => {
    setSelectedUser(user)
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setSelectedUser(null)
  }

  return (
    <div className="flex min-h-screen bg-gray-50 rtl">
      <Sidebar />

      <div className="flex-1 flex flex-col">
        <Header />

        <main className="flex-1 p-6">
          {/* Page Header */}
          <div className="mb-8">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">إدارة المستخدمين</h1>
                <p className="text-gray-600 mt-2">
                  إجمالي المستخدمين: <span className="font-semibold">{users.length}</span>
                </p>
              </div>
              <Button variant="primary" className="flex items-center gap-2">
                <Plus size={20} />
                إضافة مستخدم جديد
              </Button>
            </div>
          </div>

          {/* Search and Filters */}
          <Card className="mb-6 p-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Search Box */}
              <div className="md:col-span-2">
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                  <Input
                    placeholder="ابحث باسم أو بريد إلكتروني..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pr-10"
                  />
                </div>
              </div>

              {/* Role Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">الدور</label>
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value as typeof roleFilter)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                >
                  <option value="all">الكل</option>
                  <option value="user">مستخدم</option>
                  <option value="staff">موظف</option>
                  <option value="admin">مسؤول</option>
                </select>
              </div>

              {/* Status Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">الحالة</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                >
                  <option value="all">الكل</option>
                  <option value="active">نشط</option>
                  <option value="inactive">غير نشط</option>
                  <option value="suspended">معطل</option>
                </select>
              </div>
            </div>
          </Card>

          {/* Users Table */}
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-right py-4 px-6 text-sm font-semibold text-gray-700">
                      الاسم
                    </th>
                    <th className="text-right py-4 px-6 text-sm font-semibold text-gray-700">
                      البريد الإلكتروني
                    </th>
                    <th className="text-right py-4 px-6 text-sm font-semibold text-gray-700">
                      الدور
                    </th>
                    <th className="text-right py-4 px-6 text-sm font-semibold text-gray-700">
                      الحالة
                    </th>
                    <th className="text-right py-4 px-6 text-sm font-semibold text-gray-700">
                      تاريخ الانضمام
                    </th>
                    <th className="text-right py-4 px-6 text-sm font-semibold text-gray-700">
                      آخر دخول
                    </th>
                    <th className="text-center py-4 px-6 text-sm font-semibold text-gray-700">
                      الإجراءات
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.length > 0 ? (
                    filteredUsers.map((user) => (
                      <tr key={user.id} className="border-b hover:bg-gray-50 transition-colors">
                        <td className="py-4 px-6">
                          <p className="font-medium text-gray-900">{user.name}</p>
                        </td>
                        <td className="py-4 px-6">
                          <p className="text-sm text-gray-600">{user.email}</p>
                        </td>
                        <td className="py-4 px-6">
                          <Badge
                            variant={
                              user.role === 'admin'
                                ? 'error'
                                : user.role === 'staff'
                                  ? 'warning'
                                  : 'info'
                            }
                          >
                            {user.role === 'user'
                              ? 'مستخدم'
                              : user.role === 'staff'
                                ? 'موظف'
                                : 'مسؤول'}
                          </Badge>
                        </td>
                        <td className="py-4 px-6">
                          <Badge
                            variant={
                              user.status === 'active'
                                ? 'success'
                                : user.status === 'suspended'
                                  ? 'error'
                                  : 'warning'
                            }
                          >
                            {user.status === 'active'
                              ? 'نشط'
                              : user.status === 'inactive'
                                ? 'غير نشط'
                                : 'معطل'}
                          </Badge>
                        </td>
                        <td className="py-4 px-6">
                          <p className="text-sm text-gray-600">{formatDate(user.joinDate)}</p>
                        </td>
                        <td className="py-4 px-6">
                          <p className="text-sm text-gray-600">{formatDate(user.lastLogin)}</p>
                        </td>
                        <td className="py-4 px-6">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => handleEditUser(user)}
                              className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="تعديل"
                            >
                              <Edit size={18} />
                            </button>
                            <button
                              className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="حذف"
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="py-8 px-6 text-center">
                        <p className="text-gray-600">لم يتم العثور على مستخدمين</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Pagination */}
          <div className="mt-6 flex items-center justify-between">
            <p className="text-sm text-gray-600">
              عرض <span className="font-semibold">{filteredUsers.length}</span> من{' '}
              <span className="font-semibold">{users.length}</span> مستخدم
            </p>
            <div className="flex gap-2">
              <Button variant="outline">السابق</Button>
              <Button variant="outline" className="px-3">
                1
              </Button>
              <Button variant="outline" className="px-3">
                2
              </Button>
              <Button variant="outline">التالي</Button>
            </div>
          </div>
        </main>
      </div>

      {/* User Details Modal */}
      {isModalOpen && selectedUser && (
        <Modal isOpen={isModalOpen} onClose={handleCloseModal} title={`تعديل المستخدم: ${selectedUser.name}`}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">الاسم</label>
              <Input value={selectedUser.name} readOnly />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">البريد الإلكتروني</label>
              <Input value={selectedUser.email} readOnly />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">الدور</label>
              <select className="w-full px-4 py-2 border border-gray-300 rounded-lg">
                <option selected={selectedUser.role === 'user'}>مستخدم</option>
                <option selected={selectedUser.role === 'staff'}>موظف</option>
                <option selected={selectedUser.role === 'admin'}>مسؤول</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">الحالة</label>
              <select className="w-full px-4 py-2 border border-gray-300 rounded-lg">
                <option selected={selectedUser.status === 'active'}>نشط</option>
                <option selected={selectedUser.status === 'inactive'}>غير نشط</option>
                <option selected={selectedUser.status === 'suspended'}>معطل</option>
              </select>
            </div>

            <div className="flex gap-3 mt-6">
              <Button variant="primary" className="flex-1">
                حفظ التغييرات
              </Button>
              <Button variant="outline" onClick={handleCloseModal} className="flex-1">
                إلغاء
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
