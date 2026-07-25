/**
 * Arabic messages for Clerk failures.
 *
 * Building our own auth forms means Clerk's own copy never reaches the screen,
 * so every failure has to be worded here or the user is left with an English
 * string — or nothing at all. Keyed by Clerk's stable error `code`; anything
 * unmapped falls back to Clerk's own text rather than a generic apology, since
 * a specific English message still beats "حدث خطأ".
 */

const MESSAGES = {
  // Identifier / password
  form_identifier_not_found: 'لا يوجد حساب بهذا البريد الإلكتروني',
  form_password_incorrect: 'كلمة المرور غير صحيحة',
  form_identifier_exists: 'هذا البريد مسجّل بالفعل — سجّل الدخول بدلاً من إنشاء حساب',
  form_param_format_invalid: 'صيغة البريد الإلكتروني غير صحيحة',
  form_param_nil: 'الرجاء تعبئة جميع الحقول المطلوبة',

  // Password rules
  form_password_length_too_short: 'كلمة المرور قصيرة — 8 أحرف على الأقل',
  form_password_size_in_bytes_exceeded: 'كلمة المرور طويلة جداً',
  form_password_pwned: 'هذه الكلمة ظهرت في تسريبات بيانات معروفة — اختر واحدة أخرى',
  form_password_not_strong_enough: 'كلمة المرور ضعيفة — اخلط أحرفاً وأرقاماً ورموزاً',
  form_password_validation_failed: 'كلمة المرور لا تستوفي الشروط',

  // Verification codes
  form_code_incorrect: 'الرمز غير صحيح',
  verification_failed: 'فشل التحقق — اطلب رمزاً جديداً',
  verification_expired: 'انتهت صلاحية الرمز — اطلب رمزاً جديداً',
  verification_already_verified: 'تم التحقق من هذا البريد بالفعل',

  // Invitations
  ticket_invalid: 'رابط الدعوة غير صالح',
  ticket_expired: 'انتهت صلاحية الدعوة — اطلب من مدير شركتك إعادة إرسالها',
  invitation_account_not_exists: 'تعذّر إتمام الدعوة — تواصل مع مدير شركتك',

  // Session / rate limiting
  session_exists: 'أنت مسجّل الدخول بالفعل',
  too_many_requests: 'محاولات كثيرة خلال وقت قصير — انتظر دقيقة ثم أعد المحاولة',
  captcha_invalid: 'فشل التحقق من أنك لست روبوتاً — حدّث الصفحة وأعد المحاولة',
  captcha_unavailable: 'تعذّر تحميل أداة التحقق — تأكد من اتصالك وحدّث الصفحة',
}

/** Pull a displayable Arabic message out of whatever Clerk (or the network) threw. */
export function clerkErrorMessage(err, fallback = 'تعذّر إتمام العملية — حاول مرة أخرى') {
  const first = err?.errors?.[0]
  if (first) {
    return MESSAGES[first.code] || first.longMessage || first.message || fallback
  }
  // Not a Clerk error object: a network failure, or a thrown Error.
  return err?.message || fallback
}
