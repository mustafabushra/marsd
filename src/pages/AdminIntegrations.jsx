import ComingSoon from '../components/ComingSoon'

/**
 * The screen showed eight integrations with connection toggles and "متصل"
 * badges. None of them existed; the toggles changed a useState array. A badge
 * saying a system is connected, when nothing is connected, is the most direct
 * kind of false statement an interface can make.
 */
export default function AdminIntegrations() {
  return (
    <ComingSoon
      icon="🔌"
      title="التكاملات"
      why="لا يوجد نظام خارجي متصل بمرصد اليوم."
      willDo={[
        'التحقق من السجل التجاري مباشرة من مصدره الرسمي بدل إدخاله يدوياً.',
        'مفاتيح API للشركات التي تريد الاستعلام عن درجة الثقة من أنظمتها.',
        'Webhooks تُبلّغ نظام الشركة عند تغيّر درجة شركة تراقبها.',
      ]}
      needs="قرار بما نتكامل معه، واتفاقية وصول مع كل جهة. التكامل الرسمي تحديداً يتطلّب موافقة الجهة صاحبة البيانات."
      instead="تصدير البيانات يعمل ويُخرج السجلات بصيغة CSV أو JSON، وكل تصدير مُسجَّل باسم من نفّذه."
    />
  )
}
