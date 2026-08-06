// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  REPORT_STATEMENTS, titlesFor, pointsFor, groupsFor, pointLabel, buildDescription,
} from '../reportStatements.js'

// The categories the report form offers. Kept here as a literal rather than
// imported, so that adding a category to the form without adding statements for
// it fails this file instead of showing an empty dropdown to a person mid-report.
const CATEGORIES = [
  'late_payment', 'no_payment', 'contract_breach', 'quality',
  'execution_delay', 'dispute', 'fraud', 'other',
]

describe('تغطية التصنيفات', () => {
  it('كل تصنيف في النموذج له عبارات', () => {
    for (const c of CATEGORIES) {
      expect(titlesFor(c).length, `${c} بلا عناوين`).toBeGreaterThan(0)
      expect(pointsFor(c).length, `${c} بلا عبارات`).toBeGreaterThan(0)
    }
  })

  it('لا تصنيف زائد لا يظهر في النموذج', () => {
    for (const c of Object.keys(REPORT_STATEMENTS)) {
      expect(CATEGORIES, `${c} غير موجود في قائمة النموذج`).toContain(c)
    }
  })

  it('التصنيف المجهول لا ينهار — يرجع فارغاً', () => {
    expect(titlesFor('لا يوجد')).toEqual([])
    expect(pointsFor(undefined)).toEqual([])
  })
})

describe('سلامة العبارات', () => {
  it('لا رمز مكرر داخل التصنيف الواحد', () => {
    for (const c of Object.keys(REPORT_STATEMENTS)) {
      const codes = pointsFor(c).map((p) => p.v)
      expect(new Set(codes).size, `${c}: ${codes.join(', ')}`).toBe(codes.length)
    }
  })

  it('لا عنوان مكرر داخل التصنيف الواحد', () => {
    for (const [c, { titles }] of Object.entries(REPORT_STATEMENTS)) {
      expect(new Set(titles).size, c).toBe(titles.length)
    }
  })

  it('الرمز الواحد يعني الشيء نفسه في كل تصنيف', () => {
    // «delay_over_90» appears under late_payment and execution_delay. If the two
    // carried different wording, a query counting that code would be adding up
    // two different claims.
    const seen = new Map()
    for (const c of Object.keys(REPORT_STATEMENTS)) {
      for (const p of pointsFor(c)) {
        const prev = seen.get(p.v)
        expect(prev === undefined || prev === p.t,
          `«${p.v}» يعني «${prev}» و «${p.t}»`).toBe(true)
        seen.set(p.v, p.t)
      }
    }
  })

  it('كل عبارة لها نص عربي حقيقي', () => {
    for (const [c, { titles }] of Object.entries(REPORT_STATEMENTS)) {
      for (const t of titles) {
        expect(t.length, `${c}: «${t}» قصير`).toBeGreaterThan(12)
        expect(/[؀-ۿ]/.test(t), `${c}: «${t}» بلا عربية`).toBe(true)
      }
      for (const p of pointsFor(c)) {
        expect(p.t.length, `${c}: «${p.t}» قصير`).toBeGreaterThan(8)
        expect(/^[a-z0-9_]+$/.test(p.v), `${c}: الرمز «${p.v}» غير صالح`).toBe(true)
      }
    }
  })
})

describe('التجميع', () => {
  it('كل تصنيف مقسّم لمجموعات معنونة', () => {
    for (const c of CATEGORIES) {
      const groups = groupsFor(c)
      expect(groups.length, `${c} بلا مجموعات`).toBeGreaterThan(1)
      for (const grp of groups) {
        expect(grp.label.length, `${c}: عنوان مجموعة قصير`).toBeGreaterThan(4)
        expect(grp.items.length, `${c}/${grp.label} فارغة`).toBeGreaterThan(0)
      }
    }
  })

  it('كل تصنيف يسأل عن الإثبات', () => {
    // The free-text box is gone, so the only way a reviewer learns whether
    // anything can be proven is by having been asked.
    for (const c of CATEGORIES) {
      const codes = pointsFor(c).map((p) => p.v)
      expect(codes, `${c} لا يسأل عن الإثباتات`).toContain('contract_signed')
      expect(codes, `${c} لا يسأل عن المراسلات`).toContain('written_evidence')
    }
  })

  it('كل تصنيف فيه عبارات كافية لتغني عن النص الحر', () => {
    // A report is now nothing but these. Ten was the point below which the
    // categories stopped being able to describe an actual dealing.
    for (const c of CATEGORIES) {
      expect(pointsFor(c).length, `${c} فيه ${pointsFor(c).length} عبارة فقط`)
        .toBeGreaterThanOrEqual(10)
    }
  })
})

describe('بناء الوصف', () => {
  it('يجمع العبارات تحت عناوين مجموعاتها', () => {
    // Grouped rather than a flat run of bullets: a reviewer needs to know which
    // question each statement answered.
    const out = buildDescription('late_payment', ['delay_over_90', 'paid_eventually'])
    expect(out).toContain('مدة التأخير: أكثر من 90 يوماً')
    expect(out).toContain('سدّد المبلغ كاملاً في النهاية')
    expect(out.split('\n')).toHaveLength(2)
  })

  it('العبارات من مجموعة واحدة تُدمج في سطر', () => {
    const out = buildDescription('late_payment', ['delay_over_90', 'delay_over_year'])
    expect(out.split('\n')).toHaveLength(1)
    expect(out).toContain('، ')
  })

  it('بلا اختيارات ينتج نصاً فارغاً — لا سطراً وهمياً', () => {
    expect(buildDescription('late_payment', [])).toBe('')
    expect(buildDescription('late_payment', undefined)).toBe('')
    expect(buildDescription('لا يوجد', ['x'])).toContain('x')
  })

  it('الرمز المجهول يظهر كما هو بدل أن يختفي', () => {
    // Better a visible code than a silently dropped statement: a report saved
    // before this file changed still says something, and somebody can see that
    // it needs attention.
    expect(pointLabel('late_payment', 'رمز_غير_معروف')).toBe('رمز_غير_معروف')
    expect(buildDescription('late_payment', ['غريب'])).toContain('غريب')
  })

  it('الترتيب ثابت — لا يتبع ترتيب اختيار المستخدم', () => {
    const a = buildDescription('late_payment', ['paid_eventually', 'delay_over_90'])
    const b = buildDescription('late_payment', ['delay_over_90', 'paid_eventually'])
    expect(a).toBe(b)
  })
})
