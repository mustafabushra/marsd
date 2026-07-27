import ComingSoon from '../components/ComingSoon'

/**
 * The screen listed alerts about collusion and suspicious reporting patterns,
 * written into the file. Nothing computed them, and a page that says "٣ حالات
 * احتيال مشتبه بها" when nothing is watching is worse than a page that says
 * nothing: it tells an operator the platform is being monitored.
 */
export default function AdminFraudDetection() {
  return (
    <ComingSoon
      icon="🛡️"
      title="كشف الاحتيال"
      why="لا توجد قواعد رصد آلية تعمل على المنصة الآن."
      willDo={[
        'رصد التقارير الكيدية: شركة تُبلّغ عن منافس مباشر، أو تقارير متكرّرة عن نفس الشركة في وقت قصير.',
        'رصد التواطؤ: شركتان تتبادلان تقارير إيجابية لرفع درجتَيهما.',
        'رصد الحسابات المكرّرة: عدة حسابات بسجل تجاري واحد أو بأنماط بريد متشابهة.',
        'ترتيب الحالات بالخطورة، وإحالتها لمراجعة بشرية — لا حجب تلقائي.',
      ]}
      needs="تعريف قواعد الرصد وعتباتها، وبيانات كافية لتمييز النمط المشبوه من الصدفة. القواعد على بيانات قليلة تُنتج إنذارات كاذبة أكثر مما تكشف."
      instead="صفحة مراجعة التقارير تعرض الآن سجل كل شركة مُبلِّغة — كم تقريراً قدّمت وكم رُفض — وتُحذّر إذا تجاوزت نسبة الرفض ٤٠٪. وصفحة حالة النظام تفحص اتساق البيانات."
    />
  )
}
