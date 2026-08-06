/**
 * The sentences a report is made of.
 *
 * ============================================================================
 * Why a report is chosen rather than written
 * ============================================================================
 * «تأخر في الدفع», «ما دفع في الموعد», «متأخر بالسداد» and «لم يلتزم بالمواعيد
 * المالية» are one complaint written four ways. Stored as typed they are four
 * complaints: they do not group, they cannot be counted, and a company with
 * thirty reports of the same problem looks like a company with thirty different
 * problems. A trust score built on text nobody can aggregate is built on
 * nothing.
 *
 * So the whole report is assembled from lists — category, title, then the facts
 * that apply. There is no free-text box.
 *
 * ============================================================================
 * What that costs, and how the lists pay for it
 * ============================================================================
 * A reviewer approving a report used to read a paragraph. Now they read ticked
 * statements, and attachments are not built yet, so the statements are the only
 * account of what happened that anyone will ever see.
 *
 * That is why these lists are long and specific rather than short and tidy.
 * «تأخر في السداد» on its own is not a report; «التأخير تجاوز 90 يوماً»,
 * «سدّد جزءاً من المبلغ», «وعد بمواعيد ولم يلتزم», «انقطع التواصل», «لديّ
 * مراسلات مكتوبة» together are. Every statement here is one a reviewer would
 * otherwise have had to dig out of a paragraph, and one that can be counted
 * afterwards — which the paragraph never could.
 *
 * The statements are grouped, because a flat list of twenty-five checkboxes is
 * a list nobody reads to the end.
 */

/** A group of statements, so a long list stays scannable. */
const g = (label, items) => ({ label, items })

/** What can be proven. Asked in every category — a claim with a paper trail
 *  behind it is a different claim from one without. */
const EVIDENCE = g('ما لديّ من إثباتات', [
  { v: 'contract_signed', t: 'عقد موقّع بين الطرفين' },
  { v: 'invoices_issued', t: 'فواتير رسمية صادرة' },
  { v: 'written_evidence', t: 'مراسلات مكتوبة (بريد أو رسائل)' },
  { v: 'bank_records', t: 'حوالات أو كشوف بنكية' },
  { v: 'delivery_proof', t: 'إثبات تسليم أو استلام' },
  { v: 'legal_notice_sent', t: 'إنذار رسمي مُرسل' },
  { v: 'no_documents', t: 'لا أملك مستندات — التعامل كان شفهياً' },
])

/** How the other side behaved when the problem came up. */
const CONDUCT = g('كيف تصرّفوا بعد المشكلة', [
  { v: 'attempted_contact', t: 'تواصلت معهم قبل تقديم البلاغ' },
  { v: 'responded_late', t: 'ردّوا بعد إلحاح ومماطلة' },
  { v: 'unreachable', t: 'انقطع التواصل ولم يعودوا يردّون' },
  { v: 'denied_problem', t: 'أنكروا وجود المشكلة' },
  { v: 'blamed_others', t: 'حمّلوا المسؤولية لطرف آخر' },
  { v: 'tried_to_fix', t: 'حاولوا معالجة الأمر' },
  { v: 'resolved_fully', t: 'عالجوا المشكلة بالكامل في النهاية' },
])

/** Where it ended up. */
const OUTCOME = g('إلى ماذا انتهى الأمر', [
  { v: 'still_open', t: 'المشكلة قائمة حتى اليوم' },
  { v: 'settled_amicably', t: 'انتهت بتسوية ودّية' },
  { v: 'escalated_legal', t: 'رُفعت لجهة قضائية أو تحكيم' },
  { v: 'relationship_ended', t: 'أنهيت التعامل معهم' },
  { v: 'would_deal_again', t: 'مستعد للتعامل معهم مجدداً' },
])

/**
 * category → { titles, groups }
 *
 * `titles` are complete sentences: a title assembled from fragments reads like
 * a form, one chosen whole reads like a person.
 */
export const REPORT_STATEMENTS = {
  late_payment: {
    titles: [
      'تأخر في سداد المستحقات عن الموعد المتفق عليه',
      'سدّد المبلغ كاملاً بعد تأخير طويل',
      'تأخر متكرر في السداد عبر أكثر من تعامل',
      'تأخر في السداد ثم سدّد بعد المطالبة',
      'تأخر في السداد رغم اكتمال العمل من جانبي',
    ],
    groups: [
      g('مدة التأخير', [
        { v: 'delay_under_30', t: 'أقل من 30 يوماً' },
        { v: 'delay_30_90', t: 'بين 30 و 90 يوماً' },
        { v: 'delay_over_90', t: 'أكثر من 90 يوماً' },
        { v: 'delay_over_year', t: 'أكثر من سنة' },
      ]),
      g('ماذا حدث بالمبلغ', [
        { v: 'paid_eventually', t: 'سدّد المبلغ كاملاً في النهاية' },
        { v: 'partial_payment', t: 'سدّد جزءاً من المبلغ فقط' },
        { v: 'still_unpaid', t: 'لم يُسدَّد حتى الآن' },
        { v: 'paid_after_notice', t: 'سدّد بعد إنذار رسمي' },
        { v: 'promised_dates', t: 'وعد بمواعيد سداد ولم يلتزم بها' },
        { v: 'no_reason_given', t: 'لم يقدّم سبباً للتأخير' },
        { v: 'disputed_amount', t: 'اعترض على المبلغ لتأجيل السداد' },
      ]),
      CONDUCT, EVIDENCE, OUTCOME,
    ],
  },

  no_payment: {
    titles: [
      'لم يسدد المستحقات إطلاقاً',
      'امتنع عن السداد بعد استلام العمل',
      'توقّف عن السداد بعد دفعة أولى',
      'أنكر وجود مستحقات عليه',
      'اختفى بعد استلام العمل دون سداد',
    ],
    groups: [
      g('ماذا سُلّم مقابل المبلغ', [
        { v: 'work_delivered', t: 'سُلّم العمل أو البضاعة كاملاً' },
        { v: 'partial_delivered', t: 'سُلّم جزء من العمل' },
        { v: 'work_accepted', t: 'استلم العمل وأقرّ بجودته' },
        { v: 'advance_only', t: 'دفع دفعة مقدمة فقط ثم توقّف' },
        { v: 'nothing_paid', t: 'لم يدفع أي مبلغ إطلاقاً' },
      ]),
      g('كيف بُرِّر عدم السداد', [
        { v: 'denies_debt', t: 'ينكر وجود المستحقات أصلاً' },
        { v: 'claims_quality', t: 'تذرّع بالجودة لتبرير الامتناع' },
        { v: 'claims_no_money', t: 'ادّعى تعثّراً مالياً' },
        { v: 'no_justification', t: 'لم يقدّم أي مبرر' },
      ]),
      CONDUCT, EVIDENCE, OUTCOME,
    ],
  },

  contract_breach: {
    titles: [
      'أخلّ ببنود العقد المتفق عليها',
      'غيّر شروط الاتفاق من طرف واحد',
      'ألغى العقد دون إشعار مسبق',
      'نفّذ أقل مما نصّ عليه العقد',
      'خالف شرط الحصرية أو السرية',
    ],
    groups: [
      g('أي بند أُخلّ به', [
        { v: 'scope_changed', t: 'غيّر نطاق العمل دون اتفاق' },
        { v: 'price_changed', t: 'رفع السعر بعد التوقيع' },
        { v: 'terms_changed', t: 'عدّل شروط الدفع من طرف واحد' },
        { v: 'cancelled_early', t: 'أنهى التعاقد قبل موعده' },
        { v: 'breached_exclusivity', t: 'خالف شرط الحصرية' },
        { v: 'breached_confidentiality', t: 'أفشى معلومات سرّية' },
        { v: 'subcontracted_without_consent', t: 'أسند العمل لطرف آخر دون موافقة' },
      ]),
      g('كيف تمّ الإخلال', [
        { v: 'cancelled_no_notice', t: 'دون إشعار مسبق' },
        { v: 'refused_amend', t: 'رفض تصحيح الوضع بعد الاعتراض' },
        { v: 'ignored_objection', t: 'تجاهل اعتراضي المكتوب' },
      ]),
      CONDUCT, EVIDENCE, OUTCOME,
    ],
  },

  quality: {
    titles: [
      'العمل المُسلّم لا يطابق المواصفات المتفق عليها',
      'جودة التنفيذ أقل من المستوى المتعاقد عليه',
      'أنجز العمل بجودة عالية وفق المواصفات',
      'تكرر رفض التسليم بسبب الجودة',
      'استخدم مواد أو مواصفات أدنى من المتفق عليه',
    ],
    groups: [
      g('مستوى الجودة', [
        { v: 'exceeded_spec', t: 'تجاوز المواصفات المتفق عليها' },
        { v: 'matched_spec', t: 'طابق المواصفات تماماً' },
        { v: 'minor_defects', t: 'عيوب بسيطة لا تمنع الاستخدام' },
        { v: 'below_spec', t: 'أقل من المواصفات المتفق عليها' },
        { v: 'unusable', t: 'غير صالح للاستخدام إطلاقاً' },
      ]),
      g('ماذا جرى بعد الملاحظات', [
        { v: 'fixed_promptly', t: 'عالج الملاحظات بسرعة' },
        { v: 'fixed_after_pressure', t: 'عالجها بعد إلحاح' },
        { v: 'needed_rework', t: 'احتاج إعادة تنفيذ كاملة' },
        { v: 'refused_fix', t: 'رفض إصلاح الملاحظات' },
        { v: 'cost_me_extra', t: 'اضطررت لإصلاحه على حسابي' },
        { v: 'wrong_materials', t: 'استخدم مواد أدنى من المتفق عليه' },
      ]),
      CONDUCT, EVIDENCE, OUTCOME,
    ],
  },

  execution_delay: {
    titles: [
      'تأخر في تسليم العمل عن الموعد المتفق عليه',
      'توقّف عن التنفيذ في منتصف المشروع',
      'سلّم العمل في موعده رغم ظروف صعبة',
      'تأخر متكرر في مراحل التسليم',
      'لم يبدأ التنفيذ أصلاً بعد التعاقد',
    ],
    groups: [
      g('مدة التأخير', [
        { v: 'delay_under_30', t: 'أقل من 30 يوماً' },
        { v: 'delay_30_90', t: 'بين 30 و 90 يوماً' },
        { v: 'delay_over_90', t: 'أكثر من 90 يوماً' },
        { v: 'never_started', t: 'لم يبدأ التنفيذ إطلاقاً' },
      ]),
      g('ماذا حدث بالعمل', [
        { v: 'delivered_late', t: 'سلّم متأخراً لكنه أكمل العمل' },
        { v: 'delivered_on_time', t: 'سلّم في الموعد' },
        { v: 'stopped_midway', t: 'توقّف في منتصف العمل ولم يكمل' },
        { v: 'partial_only', t: 'سلّم جزءاً فقط' },
        { v: 'delay_no_notice', t: 'لم يُشعرني بالتأخير' },
        { v: 'repeated_delays', t: 'تأخر في أكثر من مرحلة' },
        { v: 'caused_me_loss', t: 'التأخير سبّب لي خسارة أو تعويضاً' },
      ]),
      CONDUCT, EVIDENCE, OUTCOME,
    ],
  },

  dispute: {
    titles: [
      'نشأ خلاف على تنفيذ التعاقد لم يُحل',
      'خلاف على المستحقات المالية',
      'خلاف انتهى بتسوية ودّية',
      'خلاف مرفوع أمام جهة مختصة',
    ],
    groups: [
      g('موضوع الخلاف', [
        { v: 'dispute_money', t: 'خلاف على مبالغ مستحقة' },
        { v: 'dispute_scope', t: 'خلاف على نطاق العمل' },
        { v: 'dispute_quality', t: 'خلاف على الجودة' },
        { v: 'dispute_timeline', t: 'خلاف على المواعيد' },
      ]),
      g('أين وصل', [
        { v: 'unresolved', t: 'قائم ولم يُحل' },
        { v: 'settled', t: 'تمت تسويته' },
        { v: 'mediation', t: 'جرت محاولة وساطة' },
        { v: 'before_court', t: 'منظور أمام جهة قضائية' },
        { v: 'ruling_issued', t: 'صدر حكم أو قرار' },
        { v: 'refused_talks', t: 'رفض التفاوض' },
      ]),
      CONDUCT, EVIDENCE, OUTCOME,
    ],
  },

  fraud: {
    titles: [
      'ادّعى قدرات أو تراخيص لا يملكها',
      'استلم مبلغاً ولم يقدّم أي خدمة',
      'استخدم بيانات أو مستندات غير صحيحة',
      'انتحل صفة جهة أخرى',
    ],
    groups: [
      g('ما الذي حدث', [
        { v: 'took_money_no_service', t: 'استلم مبلغاً دون تقديم أي خدمة' },
        { v: 'false_credentials', t: 'قدّم تراخيص أو شهادات غير صحيحة' },
        { v: 'false_identity', t: 'انتحل اسم جهة أخرى' },
        { v: 'fake_documents', t: 'استخدم مستندات مزوّرة' },
        { v: 'misrepresented_capacity', t: 'ادّعى قدرات تنفيذية لا يملكها' },
        { v: 'vanished', t: 'اختفى بعد استلام المبلغ' },
      ]),
      g('هل بُلِّغت جهة رسمية', [
        { v: 'reported_to_authority', t: 'بُلِّغت الجهات المختصة' },
        { v: 'police_report', t: 'حُرِّر بلاغ رسمي' },
        { v: 'not_reported_yet', t: 'لم أُبلّغ أي جهة بعد' },
      ]),
      CONDUCT, EVIDENCE, OUTCOME,
    ],
  },

  other: {
    titles: [
      'تعامل احترافي ومنظّم',
      'تعامل جيد مع ملاحظات بسيطة',
      'مشكلة لا تندرج تحت التصنيفات المذكورة',
    ],
    groups: [
      g('كيف كان التعامل', [
        { v: 'professional', t: 'احترافي ومنظّم' },
        { v: 'responsive', t: 'سريع في الرد والتجاوب' },
        { v: 'transparent', t: 'واضح وشفّاف في التعامل' },
        { v: 'minor_issues', t: 'ملاحظات بسيطة لا تمنع التعامل' },
        { v: 'unprofessional', t: 'تعامل غير مهني' },
      ]),
      CONDUCT, EVIDENCE, OUTCOME,
    ],
  },
}

/** Groups for a category, or an empty list for one with none. */
export const groupsFor = (category) => REPORT_STATEMENTS[category]?.groups ?? []

/** Every statement in a category, flattened — for lookup and validation. */
export const pointsFor = (category) =>
  groupsFor(category).flatMap((grp) => grp.items)

/** Titles for a category. */
export const titlesFor = (category) => REPORT_STATEMENTS[category]?.titles ?? []

/**
 * The sentence a code stands for.
 *
 * An unknown code comes back as itself rather than disappearing: a report that
 * shows a raw code is visibly wrong and someone will fix it, where a report
 * that silently drops a statement is quietly wrong forever.
 */
export function pointLabel(category, code) {
  return pointsFor(category).find((p) => p.v === code)?.t ?? code
}

/**
 * Turn the ticked statements into the paragraph the rest of the product stores.
 *
 * `reports.description` is shown on the company page, in the admin queue and in
 * the full report. Writing readable prose into it means none of those had to
 * change — the codes are recorded beside it, not instead of it.
 *
 * Grouped in the output too, so a reviewer reads «مدة التأخير: أكثر من 90
 * يوماً» rather than a flat run of bullets with no idea which question each one
 * answered.
 */
export function buildDescription(category, codes) {
  const picked = new Set(codes ?? [])
  const out = []

  for (const grp of groupsFor(category)) {
    const hits = grp.items.filter((i) => picked.has(i.v))
    if (!hits.length) continue
    out.push(`${grp.label}: ${hits.map((h) => h.t).join('، ')}`)
  }

  // Anything the lists no longer contain — a code from an older version of this
  // file, on a report saved before it changed. Shown rather than dropped.
  const known = new Set(pointsFor(category).map((p) => p.v))
  const strays = [...picked].filter((c) => !known.has(c))
  if (strays.length) out.push(strays.join('، '))

  return out.join('\n')
}
