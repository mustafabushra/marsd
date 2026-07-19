'use client'
'use client'

import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import Button from '@/components/Button'
import Card from '@/components/Card'
import Input from '@/components/Input'
import Badge from '@/components/Badge'
import ProgressBar from '@/components/ProgressBar'

interface CompanyForCompare {
  id: string
  name: string
  trustScore: number
  industry: string
  reportsCount: number
  employeeCount: number
  yearFounded: number
  certifications: string[]
  compliance: number
}

const SAMPLE_COMPANIES: Record<string, CompanyForCompare> = {
  '1': {
    id: '1',
    name: 'شركة الأمل',
    trustScore: 92,
    industry: 'تكنولوجيا',
    reportsCount: 45,
    employeeCount: 250,
    yearFounded: 2015,
    certifications: ['ISO 9001', 'ISO 27001'],
    compliance: 95,
  },
  '2': {
    id: '2',
    name: 'مؤسسة النجاح',
    trustScore: 78,
    industry: 'التجارة',
    reportsCount: 28,
    employeeCount: 150,
    yearFounded: 2012,
    certifications: ['ISO 9001'],
    compliance: 85,
  },
  '3': {
    id: '3',
    name: 'الشركة العالمية',
    trustScore: 65,
    industry: 'الخدمات',
    reportsCount: 12,
    employeeCount: 320,
    yearFounded: 2018,
    certifications: [],
    compliance: 72,
  },
}

export default function ComparePage() {
  const [selectedCompanies, setSelectedCompanies] = useState<string[]>(['1', '2'])
  const [searchQuery, setSearchQuery] = useState('')

  const handleAddCompany = (id: string) => {
    if (!selectedCompanies.includes(id) && selectedCompanies.length < 4) {
      setSelectedCompanies([...selectedCompanies, id])
    }
  }

  const handleRemoveCompany = (id: string) => {
    setSelectedCompanies(selectedCompanies.filter((c) => c !== id))
  }

  const companies = selectedCompanies.map((id) => SAMPLE_COMPANIES[id]).filter(Boolean)

  const getTrustScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600'
    if (score >= 60) return 'text-yellow-600'
    return 'text-red-600'
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-7 py-6">
        <h1 className="text-3xl font-900 text-slate-900">مقارنة الشركات</h1>
        <p className="text-slate-600">قارن بين عدة شركات لاتخاذ قرار أفضل</p>
      </div>

      {/* Content */}
      <main className="p-7">
        {/* Add Company Section */}
        <Card className="mb-6">
          <div className="space-y-4">
            <div>
              <h3 className="font-700 text-slate-900 mb-3">أضف شركة للمقارنة</h3>
              <Input
                placeholder="ابحث عن شركة..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {selectedCompanies.length < 4 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {Object.entries(SAMPLE_COMPANIES)
                  .filter(([id]) => !selectedCompanies.includes(id))
                  .map(([id, company]) => (
                    <button
                      key={id}
                      onClick={() => handleAddCompany(id)}
                      className="text-left p-3 border border-slate-200 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition"
                    >
                      <p className="font-medium text-slate-900">{company.name}</p>
                      <p className="text-sm text-slate-600">{company.industry}</p>
                    </button>
                  ))}
              </div>
            )}

            {selectedCompanies.length >= 4 && (
              <p className="text-sm text-slate-600">يمكن مقارنة 4 شركات فقط كحد أقصى</p>
            )}
          </div>
        </Card>

        {/* Comparison Table */}
        {companies.length > 0 && (
          <Card className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr className="text-right">
                  <th className="px-4 py-3 font-600 text-slate-700">المعيار</th>
                  {companies.map((company) => (
                    <th key={company.id} className="px-4 py-3 font-600 text-slate-700">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-700">{company.name}</p>
                          <p className="text-xs text-slate-600">{company.industry}</p>
                        </div>
                        <button
                          onClick={() => handleRemoveCompany(company.id)}
                          className="p-1 hover:bg-slate-200 rounded transition"
                        >
                          <X size={16} className="text-slate-600" />
                        </button>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {/* Trust Score */}
                <tr className="hover:bg-slate-50">
                  <td className="px-4 py-4 font-medium text-slate-900">درجة الثقة</td>
                  {companies.map((company) => (
                    <td key={company.id} className="px-4 py-4">
                      <p className={`text-2xl font-900 ${getTrustScoreColor(company.trustScore)}`}>
                        {company.trustScore}
                      </p>
                    </td>
                  ))}
                </tr>

                {/* Compliance */}
                <tr className="hover:bg-slate-50">
                  <td className="px-4 py-4 font-medium text-slate-900">الامتثال</td>
                  {companies.map((company) => (
                    <td key={company.id} className="px-4 py-4">
                      <ProgressBar value={company.compliance} max={100} variant="success" />
                      <p className="text-sm text-slate-600 mt-1">{company.compliance}%</p>
                    </td>
                  ))}
                </tr>

                {/* Reports */}
                <tr className="hover:bg-slate-50">
                  <td className="px-4 py-4 font-medium text-slate-900">عدد التقارير</td>
                  {companies.map((company) => (
                    <td key={company.id} className="px-4 py-4">
                      <p className="font-600 text-slate-900">{company.reportsCount}</p>
                    </td>
                  ))}
                </tr>

                {/* Employees */}
                <tr className="hover:bg-slate-50">
                  <td className="px-4 py-4 font-medium text-slate-900">عدد الموظفين</td>
                  {companies.map((company) => (
                    <td key={company.id} className="px-4 py-4">
                      <p className="font-600 text-slate-900">{company.employeeCount}</p>
                    </td>
                  ))}
                </tr>

                {/* Year Founded */}
                <tr className="hover:bg-slate-50">
                  <td className="px-4 py-4 font-medium text-slate-900">سنة التأسيس</td>
                  {companies.map((company) => (
                    <td key={company.id} className="px-4 py-4">
                      <p className="font-600 text-slate-900">{company.yearFounded}</p>
                    </td>
                  ))}
                </tr>

                {/* Certifications */}
                <tr className="hover:bg-slate-50">
                  <td className="px-4 py-4 font-medium text-slate-900">الشهادات</td>
                  {companies.map((company) => (
                    <td key={company.id} className="px-4 py-4">
                      {company.certifications.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {company.certifications.map((cert) => (
                            <Badge key={cert} variant="success" size="sm">
                              {cert}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <p className="text-slate-500 text-sm">-</p>
                      )}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>

            {/* Actions */}
            <div className="p-4 border-t border-slate-200 flex gap-3">
              <Button variant="outline">تصدير PDF</Button>
              <Button>مشاركة</Button>
            </div>
          </Card>
        )}

        {companies.length === 0 && (
          <Card className="text-center py-12">
            <p className="text-slate-600">لم تختر أي شركات للمقارنة</p>
            <p className="text-sm text-slate-500 mt-1">أضف شركات من القائمة أعلاه لبدء المقارنة</p>
          </Card>
        )}
      </main>
    </div>
  )
}
