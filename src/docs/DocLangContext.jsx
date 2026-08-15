import { createContext, useContext } from 'react'

/**
 * لغة صفحة التوثيق الحالية.
 *
 * تُشتقّ من المسار (`/docs/en/...` إنجليزية، وما عداه عربية) وتُمرَّر بالسياق
 * بدل أن يقرأ كل مكوّن المسار بنفسه — فمكوّنٌ يقرأ `location` يصير مرتبطاً
 * بالتوجيه ولا يُختبَر وحده.
 */
export const DocLangContext = createContext('ar')

export const useDocLang = () => useContext(DocLangContext)

/** اتجاه الكتابة للّغة. */
export const dirOf = (lang) => (lang === 'en' ? 'ltr' : 'rtl')
