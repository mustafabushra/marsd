import React, { useState } from 'react'
import {
  GenericConfirmDeleteModal,
  GenericConfirmActionModal,
  ConfirmRejectReportModal,
  InsufficientDataModal,
  PreliminaryRatingWarningModal,
  UpgradeRequiredModal,
  VerifyEmailModal,
  SuccessNotificationModal,
  InviteUserModal,
  AddNewCompanyModal,
  SetParametersModal,
  SendRequestModal,
  ResubmitReportModal,
  UnsubscribeConfirmModal,
  SessionExpiredModal,
} from '../components/modals'

export function ModalDemo() {
  const [modals, setModals] = useState({
    deleteCompany: false,
    deleteReport: false,
    approveReport: false,
    rejectReport: false,
    deleteUser: false,
    suspendCompany: false,
    insufficientData: false,
    preliminaryRating: false,
    upgradeRequired: false,
    verifyEmail: false,
    success: false,
    inviteUser: false,
    addCompany: false,
    setParameters: false,
    sendRequest: false,
    resubmitReport: false,
    unsubscribe: false,
    sessionExpired: false,
  })

  const toggleModal = (key) => {
    setModals((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const demoActions = {
    onConfirm: () => {
      setModals((prev) => ({ ...prev, [Object.keys(prev).find((k) => prev[k])] : false }))
      alert('Action confirmed!')
    },
    onReject: (data) => {
      setModals((prev) => ({ ...prev, rejectReport: false }))
      alert(`Rejected with reason: ${JSON.stringify(data)}`)
    },
  }

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-bold text-slate-900 mb-2 text-right">Modal Components Demo</h1>
        <p className="text-slate-600 mb-8 text-right">
          اختبر جميع الـ 18 Modal components بنقر الأزرار أدناه
        </p>

        {/* Confirmation Modals Section */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold text-slate-900 mb-4 text-right">
            التأكيدات (Confirmation Modals)
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <button
              onClick={() => toggleModal('deleteCompany')}
              className="px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium"
            >
              حذف شركة
            </button>
            <button
              onClick={() => toggleModal('deleteReport')}
              className="px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium"
            >
              حذف تقرير
            </button>
            <button
              onClick={() => toggleModal('approveReport')}
              className="px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
            >
              اعتماد تقرير
            </button>
            <button
              onClick={() => toggleModal('rejectReport')}
              className="px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium"
            >
              رفض تقرير
            </button>
            <button
              onClick={() => toggleModal('deleteUser')}
              className="px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium"
            >
              حذف مستخدم
            </button>
            <button
              onClick={() => toggleModal('suspendCompany')}
              className="px-4 py-3 bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-medium"
            >
              تعليق شركة
            </button>
          </div>
        </div>

        {/* Alert/Toast Modals Section */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold text-slate-900 mb-4 text-right">
            التنبيهات (Alert/Toast Modals)
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <button
              onClick={() => toggleModal('insufficientData')}
              className="px-4 py-3 bg-slate-600 text-white rounded-lg hover:bg-slate-700 font-medium"
            >
              بيانات غير كافية
            </button>
            <button
              onClick={() => toggleModal('preliminaryRating')}
              className="px-4 py-3 bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-medium"
            >
              تقييم أولي
            </button>
            <button
              onClick={() => toggleModal('upgradeRequired')}
              className="px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
            >
              ترقية
            </button>
            <button
              onClick={() => toggleModal('verifyEmail')}
              className="px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
            >
              تحقق من البريد
            </button>
            <button
              onClick={() => toggleModal('success')}
              className="px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
            >
              نجاح (Toast)
            </button>
          </div>
        </div>

        {/* Form Modals Section */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold text-slate-900 mb-4 text-right">
            النماذج (Form Modals)
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <button
              onClick={() => toggleModal('inviteUser')}
              className="px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
            >
              دعوة مستخدم
            </button>
            <button
              onClick={() => toggleModal('addCompany')}
              className="px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
            >
              إضافة شركة
            </button>
            <button
              onClick={() => toggleModal('setParameters')}
              className="px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
            >
              الإعدادات
            </button>
            <button
              onClick={() => toggleModal('sendRequest')}
              className="px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
            >
              إرسال طلب
            </button>
          </div>
        </div>

        {/* Special Modals Section */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold text-slate-900 mb-4 text-right">
            خاصة (Special Modals)
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <button
              onClick={() => toggleModal('resubmitReport')}
              className="px-4 py-3 bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-medium"
            >
              إعادة إرسال
            </button>
            <button
              onClick={() => toggleModal('unsubscribe')}
              className="px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium"
            >
              إلغاء اشتراك
            </button>
            <button
              onClick={() => toggleModal('sessionExpired')}
              className="px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium"
            >
              جلسة منتهية
            </button>
          </div>
        </div>

        {/* Modals */}
        <GenericConfirmDeleteModal
          isOpen={modals.deleteCompany}
          onClose={() => toggleModal('deleteCompany')}
          onConfirm={demoActions.onConfirm}
          itemType="الشركة"
          itemName="شركة التقنية المتقدمة"
        />

        <GenericConfirmDeleteModal
          isOpen={modals.deleteReport}
          onClose={() => toggleModal('deleteReport')}
          onConfirm={demoActions.onConfirm}
          itemType="التقرير"
          itemName="REP-001"
        />

        <GenericConfirmActionModal
          isOpen={modals.approveReport}
          onClose={() => toggleModal('approveReport')}
          onConfirm={demoActions.onConfirm}
          action="approve"
          itemType="التقرير"
          itemName="شركة الحل المتكامل"
          variant="success"
        />

        <ConfirmRejectReportModal
          isOpen={modals.rejectReport}
          onClose={() => toggleModal('rejectReport')}
          onConfirm={demoActions.onReject}
          companyName="شركة التطوير السريع"
        />

        <GenericConfirmDeleteModal
          isOpen={modals.deleteUser}
          onClose={() => toggleModal('deleteUser')}
          onConfirm={demoActions.onConfirm}
          itemType="المستخدم"
          itemName="أحمد محمد"
        />

        <GenericConfirmActionModal
          isOpen={modals.suspendCompany}
          onClose={() => toggleModal('suspendCompany')}
          onConfirm={demoActions.onConfirm}
          action="suspend"
          itemType="الشركة"
          itemName="شركة البنية الأساسية"
          variant="danger"
        />

        <InsufficientDataModal
          isOpen={modals.insufficientData}
          onClose={() => toggleModal('insufficientData')}
          reportCount={2}
          minRequired={5}
        />

        <PreliminaryRatingWarningModal
          isOpen={modals.preliminaryRating}
          onClose={() => toggleModal('preliminaryRating')}
          reportCount={3}
          trustScore={65}
        />

        <UpgradeRequiredModal
          isOpen={modals.upgradeRequired}
          onClose={() => toggleModal('upgradeRequired')}
          onUpgrade={() => alert('Upgrade clicked')}
          featureName="المقارنة المتقدمة"
        />

        <VerifyEmailModal
          isOpen={modals.verifyEmail}
          onClose={() => toggleModal('verifyEmail')}
          onResend={async () => alert('Resend clicked')}
          email="user@example.com"
        />

        <SuccessNotificationModal
          isOpen={modals.success}
          onClose={() => toggleModal('success')}
          message="تم حفظ البيانات بنجاح!"
          duration={4000}
        />

        <InviteUserModal
          isOpen={modals.inviteUser}
          onClose={() => toggleModal('inviteUser')}
          onInvite={async (data) => {
            alert(`Invited: ${JSON.stringify(data)}`)
            toggleModal('inviteUser')
          }}
        />

        <AddNewCompanyModal
          isOpen={modals.addCompany}
          onClose={() => toggleModal('addCompany')}
          onAdd={async (data) => {
            alert(`Added company: ${JSON.stringify(data)}`)
            toggleModal('addCompany')
          }}
        />

        <SetParametersModal
          isOpen={modals.setParameters}
          onClose={() => toggleModal('setParameters')}
          onSave={async (params) => {
            alert(`Parameters saved: ${JSON.stringify(params)}`)
            toggleModal('setParameters')
          }}
        />

        <SendRequestModal
          isOpen={modals.sendRequest}
          onClose={() => toggleModal('sendRequest')}
          onSend={async (data) => {
            alert(`Request sent: ${JSON.stringify(data)}`)
            toggleModal('sendRequest')
          }}
          recipientCompanyName="شركة البحث والتطوير"
        />

        <ResubmitReportModal
          isOpen={modals.resubmitReport}
          onClose={() => toggleModal('resubmitReport')}
          onResubmit={async () => {
            alert('Report resubmitted')
            toggleModal('resubmitReport')
          }}
          rejectionReason="بيانات غير كافية"
          rejectionMessage="يرجى إضافة المزيد من التفاصيل حول المستندات."
          canResubmit={true}
        />

        <UnsubscribeConfirmModal
          isOpen={modals.unsubscribe}
          onClose={() => toggleModal('unsubscribe')}
          onConfirm={async () => {
            alert('Unsubscribed')
            toggleModal('unsubscribe')
          }}
          planName="الباقة الاحترافية"
          nextBillingDate="15 أغسطس 2026"
        />

        <SessionExpiredModal
          isOpen={modals.sessionExpired}
          onClose={() => toggleModal('sessionExpired')}
          onLogin={() => alert('Redirecting to login...')}
          countdown={10}
        />
      </div>
    </div>
  )
}

export default ModalDemo
