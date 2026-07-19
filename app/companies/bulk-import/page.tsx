'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Button from '@/components/Button'
import Card from '@/components/Card'
import Alert from '@/components/Alert'
import { Upload, CheckCircle, ArrowRight } from 'lucide-react'

type Step = 1 | 2 | 3 | 4

interface ImportData {
  file: File | null
  preview: any[]
  status: 'idle' | 'uploading' | 'processing' | 'success' | 'error'
  errorMessage: string
}

export default function BulkImportPage() {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState<Step>(1)
  const [importData, setImportData] = useState<ImportData>({
    file: null,
    preview: [],
    status: 'idle',
    errorMessage: '',
  })

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setImportData((prev) => ({ ...prev, status: 'uploading' }))

    // Simulate file processing
    await new Promise((resolve) => setTimeout(resolve, 1000))

    const preview = [
      { name: 'شركة الأمل', industry: 'تكنولوجيا', email: 'info@hope.sa', phone: '+966501234567' },
      { name: 'مؤسسة النجاح', industry: 'التجارة', email: 'info@success.sa', phone: '+966502345678' },
      { name: 'الشركة العالمية', industry: 'الخدمات', email: 'info@global.sa', phone: '+966503456789' },
    ]

    setImportData((prev) => ({
      ...prev,
      file,
      preview,
      status: 'idle',
    }))
  }

  const handleNextStep = () => {
    if (currentStep < 4) {
      setCurrentStep((prev) => (prev + 1) as Step)
    }
  }

  const handlePreviousStep = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => (prev - 1) as Step)
    }
  }

  const handleConfirm = async () => {
    setImportData((prev) => ({ ...prev, status: 'processing' }))
    await new Promise((resolve) => setTimeout(resolve, 2000))
    setImportData((prev) => ({ ...prev, status: 'success' }))
  }

  const steps = [
    { number: 1, label: 'تحميل الملف' },
    { number: 2, label: 'معاينة البيانات' },
    { number: 3, label: 'تعيين الحقول' },
    { number: 4, label: 'التأكيد والاستيراد' },
  ]

  return (
    <div className="min-h-screen bg-slate-50 p-7">
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-4"
        >
          <ArrowRight size={20} />
          رجوع
        </button>
        <h1 className="text-3xl font-900 text-slate-900">استيراج جماعي للشركات</h1>
        <p className="text-slate-600">استيرد عدة شركات من ملف CSV أو Excel</p>
      </div>

      {/* Progress Steps */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {steps.map((step, idx) => (
            <div key={step.number} className="flex items-center flex-1">
              <div
                className={`flex items-center justify-center w-10 h-10 rounded-full font-bold ${
                  currentStep >= step.number
                    ? 'bg-green-600 text-white'
                    : 'bg-slate-200 text-slate-600'
                }`}
              >
                {currentStep > step.number ? '✓' : step.number}
              </div>
              <p className="text-sm font-medium text-slate-700 mr-2">{step.label}</p>

              {idx < steps.length - 1 && (
                <div
                  className={`flex-1 h-1 mx-2 rounded-full ${
                    currentStep > step.number ? 'bg-green-600' : 'bg-slate-200'
                  }`}
                ></div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Step Content */}
      <Card className="max-w-3xl">
        {currentStep === 1 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-700 text-slate-900 mb-2">تحميل الملف</h2>
              <p className="text-slate-600">اختر ملف CSV أو Excel يحتوي على بيانات الشركات</p>
            </div>

            <div className="border-2 border-dashed border-slate-300 rounded-lg p-12 text-center">
              <Upload size={48} className="text-slate-400 mx-auto mb-4" />
              <h3 className="text-lg font-600 text-slate-900 mb-1">اختر ملفك</h3>
              <p className="text-slate-500 mb-4">أو اسحب وأسقط الملف هنا</p>

              <label htmlFor="file-upload" className="cursor-pointer">
                <Button variant="primary" type="button" onClick={() => document.getElementById('file-upload')?.click()}>
                  اختر الملف
                </Button>
              </label>
              <input
                type="file"
                id="file-upload"
                className="hidden"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileUpload}
              />

              {importData.file && (
                <p className="mt-4 text-sm text-green-600 font-medium">
                  ✓ تم تحميل: {importData.file.name}
                </p>
              )}
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-800">
                <strong>تنسيق مدعوم:</strong> يجب أن يحتوي الملف على الأعمدة: الاسم، القطاع، البريد الإلكتروني، الهاتف
              </p>
            </div>
          </div>
        )}

        {currentStep === 2 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-700 text-slate-900 mb-2">معاينة البيانات</h2>
              <p className="text-slate-600">تحقق من البيانات المستخلصة من الملف</p>
            </div>

            {importData.preview.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50">
                    <tr className="text-right">
                      <th className="px-4 py-3 font-600 text-slate-700">اسم الشركة</th>
                      <th className="px-4 py-3 font-600 text-slate-700">القطاع</th>
                      <th className="px-4 py-3 font-600 text-slate-700">البريد الإلكتروني</th>
                      <th className="px-4 py-3 font-600 text-slate-700">الهاتف</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importData.preview.map((item, idx) => (
                      <tr key={idx} className="border-b border-slate-200 hover:bg-slate-50">
                        <td className="px-4 py-3">{item.name}</td>
                        <td className="px-4 py-3">{item.industry}</td>
                        <td className="px-4 py-3">{item.email}</td>
                        <td className="px-4 py-3">{item.phone}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <Alert variant="info">
              عدد الشركات المكتشفة: <strong>{importData.preview.length}</strong>
            </Alert>
          </div>
        )}

        {currentStep === 3 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-700 text-slate-900 mb-2">تعيين الحقول</h2>
              <p className="text-slate-600">تأكد من تعيين الأعمدة الصحيحة</p>
            </div>

            <div className="space-y-4">
              {[
                { label: 'اسم الشركة', mapped: 'الاسم' },
                { label: 'القطاع', mapped: 'المجال' },
                { label: 'البريد الإلكتروني', mapped: 'البريد' },
                { label: 'رقم الهاتف', mapped: 'الهاتف' },
              ].map((field) => (
                <div key={field.label} className="flex items-center gap-4 p-3 bg-slate-50 rounded-lg">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-900">{field.label}</p>
                    <p className="text-xs text-slate-600">معيّن إلى: <strong>{field.mapped}</strong></p>
                  </div>
                  <Button variant="ghost" size="sm">
                    تغيير
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {currentStep === 4 && (
          <div className="space-y-6">
            {importData.status === 'success' ? (
              <div className="text-center py-8">
                <CheckCircle size={64} className="text-green-600 mx-auto mb-4" />
                <h2 className="text-2xl font-700 text-slate-900 mb-2">تم الاستيراج بنجاح!</h2>
                <p className="text-slate-600">تم إضافة {importData.preview.length} شركات جديدة إلى النظام</p>
              </div>
            ) : (
              <>
                <div>
                  <h2 className="text-2xl font-700 text-slate-900 mb-2">التأكيد والاستيراج</h2>
                  <p className="text-slate-600">تأكد من البيانات قبل الاستيراج النهائي</p>
                </div>

                <Alert variant="warning">
                  هذا الإجراء سيضيف {importData.preview.length} شركات جديدة. تأكد من صحة البيانات قبل المتابعة.
                </Alert>

                <div className="bg-slate-50 rounded-lg p-4">
                  <p className="text-sm font-medium text-slate-900 mb-2">ملخص الاستيراج:</p>
                  <ul className="text-sm text-slate-600 space-y-1">
                    <li>• عدد الشركات: {importData.preview.length}</li>
                    <li>• حالة الاستيراج: جاهز</li>
                    <li>• إجمالي الحقول: 4</li>
                  </ul>
                </div>
              </>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-6 border-t border-slate-200 mt-8">
          <Button
            type="button"
            variant="ghost"
            onClick={handlePreviousStep}
            disabled={currentStep === 1}
          >
            السابق
          </Button>

          {currentStep === 4 && importData.status !== 'success' ? (
            <Button
              type="button"
              fullWidth
              isLoading={importData.status === 'processing'}
              onClick={handleConfirm}
            >
              تأكيد الاستيراج
            </Button>
          ) : importData.status === 'success' ? (
            <Button
              type="button"
              fullWidth
              onClick={() => router.push('/companies')}
            >
              العودة إلى الشركات
            </Button>
          ) : (
            <Button
              type="button"
              fullWidth
              onClick={handleNextStep}
              disabled={importData.preview.length === 0 && currentStep === 2}
            >
              التالي
            </Button>
          )}
        </div>
      </Card>
    </div>
  )
}
