import ComingSoon from '../components/ComingSoon'

/**
 * The screen held six templates with subject lines and bodies, and an editor
 * that changed a useState object. Marsad sends no email of its own — Clerk sends
 * the sign-in and invitation messages, and nothing else leaves the platform — so
 * editing a template here changed what a page displayed and nothing a customer
 * would ever receive.
 */
export default function AdminEmailTemplates() {
  return (
    <ComingSoon
      icon="✉️"
      title="نماذج البريد الإلكتروني"
      why="مرصد لا يرسل بريداً من عنده بعد — رسائل الدخول والدعوات يرسلها Clerk."
      willDo={[
        'تحرير نص كل رسالة يرسلها مرصد: اعتماد تقرير، رفضه، قبول شركة، طلب توضيح، تنبيه انتهاء اشتراك.',
        'معاينة الرسالة بالعربية قبل إرسالها، وإرسال نسخة تجريبية لبريدك.',
        'سجل بما أُرسل ولمن ومتى، وما ارتدّ منه.',
      ]}
      needs="مزوّد بريد (Resend أو Amazon SES) ونطاق مُوثّق بسجلات SPF و DKIM، وإلا وصلت الرسائل في مجلد الرسائل غير المرغوبة أو لم تصل."
      instead="الإشعارات داخل المنصة تعمل وتصل الشركات فوراً — الشركة تراها في صفحة الإشعارات ولوحتها."
    />
  )
}
