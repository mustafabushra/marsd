import { describe, it, expect } from 'vitest'
import {
  REGISTRY_COLUMNS, describeHeaders, digits, isoDate, readColumn, toCompany,
} from '../registryDataset'

/**
 * The Ministry's sheet, read the way it is actually written.
 *
 * These headers are the ten this dataset publishes, copied from the API's own
 * column list rather than guessed — including `الكيان القانوني.1`, which is
 * real: the sheet carries that column twice and the parser suffixes the second.
 */
const ROW = {
  'الرقم الموحد': '7001234567',
  'تاريخ انشاء السجل': '2019-03-14',
  'الكيان القانوني': 'مؤسسة فردية',
  'المنطقة': 'منطقة الرياض',
  'رأس المال': '500000',
  'اسم السجل': 'مؤسسة النور للتجارة',
  'رقم السجل': '1010234567',
  'نوع السجل': 'رئيسي',
  'الكيان القانوني.1': 'مؤسسة فردية',
  'المدينة': 'الرياض',
}

describe('قراءة السجل التجاري', () => {
  it('يقرأ الصف كاملاً', () => {
    const c = toCompany(ROW)
    expect(c.crNumber).toBe('1010234567')
    expect(c.name).toBe('مؤسسة النور للتجارة')
    expect(c.unifiedNumber).toBe('7001234567')
    expect(c.city).toBe('الرياض')
    expect(c.capital).toBe(500000)
    expect(c.foundingDate).toBe('2019-03-14')
  })

  it('يقبل تسميات الأعمدة البديلة بين الأرباع', () => {
    const c = toCompany({ 'رقم السجل التجاري': '4030111222', 'اسم المنشأة': 'شركة جدة' })
    expect(c.crNumber).toBe('4030111222')
    expect(c.name).toBe('شركة جدة')
  })

  it('يحوّل الأرقام العربية ويزيل الفواصل', () => {
    expect(digits('١٠١٠٢٣٤٥٦٧')).toBe('1010234567')
    expect(digits('1010-234 567')).toBe('1010234567')
    expect(digits('')).toBeNull()
  })

  it('لا يخزّن رأس مال غير مقروء كصفر', () => {
    // «لا رأس مال» و«غير مذكور» ادّعاءان مختلفان عن الشركة.
    expect(toCompany({ 'رقم السجل': '1', 'رأس المال': 'غير محدد' }).capital).toBeNull()
    expect(toCompany({ 'رقم السجل': '1' }).capital).toBeNull()
  })

  it('يُسقط التاريخ الذي لا يُقرأ بدل تخمينه', () => {
    expect(isoDate('كلام')).toBeNull()
    expect(isoDate(new Date('2020-01-05T00:00:00Z'))).toBe('2020-01-05')
    expect(isoDate('2020/1/5')).toBe('2020-01-05')
  })

  it('يعرف أي الأعمدة موجود وأيها ناقص', () => {
    const { present, missing } = describeHeaders(Object.keys(ROW))
    expect(missing).toHaveLength(0)
    expect(present).toHaveLength(REGISTRY_COLUMNS.length)

    const partial = describeHeaders(['رقم السجل', 'اسم السجل'])
    expect(partial.present.map((c) => c.field)).toEqual(['crNumber', 'name'])
    expect(partial.missing.length).toBe(REGISTRY_COLUMNS.length - 2)
  })

  it('يتجاهل الخلية الفارغة وينتقل للاسم التالي', () => {
    expect(readColumn({ 'رقم السجل': '   ', 'رقم السجل التجاري': '99' },
      ['رقم السجل', 'رقم السجل التجاري'])).toBe('99')
  })
})
