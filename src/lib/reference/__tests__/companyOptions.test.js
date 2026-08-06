// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  CR_STATUS, COMPANY_TYPE, OPTION_SETS,
  matchOption, splitEntityType, crStatusToDb, crStatusFromDb,
} from '../companyOptions.js'

describe('مطابقة القيم المستوردة على القوائم', () => {
  // The whole promise of the dropdowns is that an imported value lands ON an
  // option rather than beside it. If these fail, the same company added twice —
  // once by import, once by hand — produces two different strings.

  it('يطابق الصيغة الرسمية حرفياً', () => {
    expect(matchOption('crStatus', 'نشط')).toBe('نشط')
    expect(matchOption('companyType', 'ذات مسؤولية محدودة')).toBe('ذات مسؤولية محدودة')
  })

  it('يتجاوز اختلاف الهمزة والتاء المربوطة', () => {
    expect(matchOption('companyType', 'ذات مسئوليه محدوده')).toBe('ذات مسؤولية محدودة')
    expect(matchOption('crStatus', 'نشط')).toBe('نشط')
    expect(matchOption('companyTraits', 'شخص واحد')).toBe('شخص واحد')
  })

  it('يفهم الاختصارات', () => {
    expect(matchOption('companyType', 'ش ذ م م')).toBe('ذات مسؤولية محدودة')
    expect(matchOption('companyType', 'ذ م م')).toBe('ذات مسؤولية محدودة')
    expect(matchOption('companyType', 'LLC')).toBe('ذات مسؤولية محدودة')
  })

  it('يفهم المرادفات العربية', () => {
    expect(matchOption('crStatus', 'ساري')).toBe('نشط')
    expect(matchOption('crStatus', 'قيد التصفية')).toBe('تحت التصفية')
    expect(matchOption('crStatus', 'شطب')).toBe('مشطوب')
  })

  it('يستخرج القيمة من جملة أطول', () => {
    expect(matchOption('companyType', 'شركة ذات مسؤولية محدودة (شخص واحد)')).toBe('ذات مسؤولية محدودة')
  })

  it('الأطول يفوز — «مساهمة مبسطة» لا تُلتقط بـ«مساهمة»', () => {
    expect(matchOption('companyType', 'شركة مساهمة مبسطة')).toBe('مساهمة مبسطة')
    expect(matchOption('companyType', 'شركة مساهمة')).toBe('مساهمة')
  })

  it('غير المعروف يرجع null — لا تخمين بالتشابه', () => {
    // A legal form assigned by resemblance is a wrong fact stated confidently.
    // The form keeps the original text instead and marks it.
    expect(matchOption('companyType', 'كيان غريب لا وجود له')).toBeNull()
    expect(matchOption('crStatus', '')).toBeNull()
    expect(matchOption('crStatus', null)).toBeNull()
    expect(matchOption('لا يوجد', 'نشط')).toBeNull()
  })
})

describe('فصل نوع المنشأة عن نوع الشركة', () => {
  // The registration prints one line answering two questions.
  it('شركة ذات مسؤولية محدودة → شركة + ذات مسؤولية محدودة', () => {
    expect(splitEntityType('شركة ذات مسؤولية محدودة'))
      .toEqual({ entityType: 'شركة', companyType: 'ذات مسؤولية محدودة' })
  })

  it('مؤسسة فردية → مؤسسة، بلا نوع شركة', () => {
    expect(splitEntityType('مؤسسة فردية'))
      .toEqual({ entityType: 'مؤسسة', companyType: null })
  })

  it('«شركة» وحدها تعطي النوع دون الشكل', () => {
    expect(splitEntityType('شركة').entityType).toBe('شركة')
  })

  it('الفارغ لا ينتج شيئاً', () => {
    expect(splitEntityType('')).toEqual({ entityType: null, companyType: null })
  })
})

describe('حالة السجل ← عمودين', () => {
  // cr_status has four coded values and a CHECK constraint; official_status
  // carries the specific adverse state and the trust score weighs each one
  // separately. Both must be written, and both must survive a round trip.

  it('كل حالة تنتج قيمتين ضمن المسموح', () => {
    const CR_OK = ['active', 'suspended', 'terminated', 'pending']
    const OFFICIAL_OK = ['none', 'insolvency', 'bankruptcy', 'liquidation', 'suspended', 'struck_off']
    for (const o of CR_STATUS) {
      const db = crStatusToDb(o.value)
      expect(CR_OK, `${o.value} → ${db.cr}`).toContain(db.cr)
      expect(OFFICIAL_OK, `${o.value} → ${db.official}`).toContain(db.official)
    }
  })

  it('الذهاب والعودة يحفظ الحالة', () => {
    for (const o of CR_STATUS) {
      const db = crStatusToDb(o.value)
      expect(crStatusFromDb(db.cr, db.official), o.value).toBe(o.value)
    }
  })

  it('«مشطوب» و«منتهي» لا يختلطان رغم أن كليهما terminated', () => {
    expect(crStatusToDb('مشطوب').cr).toBe('terminated')
    expect(crStatusToDb('منتهي').cr).toBe('terminated')
    expect(crStatusToDb('مشطوب').official).toBe('struck_off')
    expect(crStatusToDb('منتهي').official).toBe('none')
    expect(crStatusFromDb('terminated', 'struck_off')).toBe('مشطوب')
    expect(crStatusFromDb('terminated', 'none')).toBe('منتهي')
  })

  it('«نشط» هو الافتراضي لأي قيمة مجهولة', () => {
    expect(crStatusToDb('لا شيء')).toEqual({ cr: 'active', official: 'none' })
  })
})

describe('سلامة القوائم', () => {
  it('لا قيمة مكررة داخل قائمة', () => {
    for (const [field, list] of Object.entries(OPTION_SETS)) {
      const values = list.map((o) => o.value)
      expect(new Set(values).size, field).toBe(values.length)
    }
  })

  it('كل قيمة تطابق نفسها', () => {
    // A canonical value that the matcher does not recognise would mean a saved
    // record cannot be re-imported onto its own option.
    for (const [field, list] of Object.entries(OPTION_SETS)) {
      for (const o of list) {
        expect(matchOption(field, o.value), `${field}:${o.value}`).toBe(o.value)
      }
    }
  })

  it('لا مرادف يقود إلى قيمتين مختلفتين داخل القائمة نفسها', () => {
    for (const [field, list] of Object.entries(OPTION_SETS)) {
      const seen = new Map()
      for (const o of list) {
        for (const a of o.aliases) {
          const prev = seen.get(a)
          expect(prev === undefined || prev === o.value,
            `«${a}» في ${field} يشير إلى ${prev} و ${o.value}`).toBe(true)
          seen.set(a, o.value)
        }
      }
    }
  })

  it('نوع الشركة يغطي ما تطبعه السجلات فعلاً', () => {
    const seen = ['شركة ذات مسؤولية محدودة', 'شركة مساهمة مقفلة', 'شركة تضامنية',
      'شركة توصية بسيطة', 'شركة مهنية', 'فرع شركة أجنبية', 'شركة قابضة']
    for (const t of seen) {
      expect(matchOption('companyType', t), t).not.toBeNull()
    }
    expect(COMPANY_TYPE.length).toBeGreaterThanOrEqual(9)
  })
})
