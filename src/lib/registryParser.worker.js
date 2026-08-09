/**
 * Reading the commercial register off the main thread, and keeping it there.
 *
 * Two failures shaped this file, both from real files rather than from theory.
 *
 * The first was `RESULT_CODE_HUNG`: `XLSX.read` on a quarter of the national
 * register held the page's only thread long enough that Chrome decided the tab
 * was dead. The upload had been batched; the parse had not, and the parse is
 * the larger half.
 *
 * The second is why the rows stay here. A real file turned out to carry
 * 1,048,576 rows — Excel's own ceiling — and the first version of this worker
 * posted every one of them to the page, which appended them and copied the
 * whole growing array into React state on each chunk. Half a billion element
 * copies, two full sets of a million objects in memory, and a tab that dies for
 * a different reason than before.
 *
 * So the page never holds the data. It learns the headers and the total, and
 * then asks for one batch at a time while it uploads. Peak memory is one batch,
 * whatever the file's size, and the O(n²) is gone because nothing is copied
 * twice.
 */

import * as XLSX from 'xlsx'
import { toCompany } from './registryDataset'

let rows = []

self.onmessage = async (e) => {
  const msg = e.data

  // --- Hand me a batch -------------------------------------------------------
  // Mapped here, not on the page: `toCompany` over a million rows is work, and
  // work on the main thread is the thing this file exists to avoid.
  if (msg.type === 'batch') {
    const slice = rows.slice(msg.from, msg.from + msg.size)
    self.postMessage({
      type: 'batch',
      from: msg.from,
      companies: slice.map(toCompany).filter((c) => c.crNumber && c.name),
      read: slice.length,
    })
    return
  }

  if (msg.type === 'release') {
    rows = []
    return
  }

  // --- Read the file ---------------------------------------------------------
  try {
    rows = []
    const buf = await msg.file.arrayBuffer()
    self.postMessage({ type: 'stage', stage: 'reading' })

    // `dense` keeps the sheet as arrays rather than one object per cell. On a
    // file of this size that is the difference between a few hundred megabytes
    // and several gigabytes — the second of which is its own kind of hang.
    const wb = XLSX.read(buf, { type: 'array', cellDates: true, dense: true })
    const sheetName = wb.SheetNames[0]
    if (!sheetName) throw new Error('الملف لا يحتوي على أوراق')

    const ws = wb.Sheets[sheetName]
    self.postMessage({ type: 'stage', stage: 'converting' })

    const headerRows = XLSX.utils.sheet_to_json(ws, { header: 1, range: 0, defval: null })
    const headers = (headerRows[0] || []).map((h) => String(h ?? '').trim()).filter(Boolean)
    if (!headers.length) throw new Error('لا توجد صفوف عناوين في الورقة الأولى')

    rows = XLSX.utils.sheet_to_json(ws, { defval: null })

    // 1,048,576 is Excel's maximum row count, not a number any register happens
    // to land on. A file that hits it exactly was almost certainly cut off when
    // it was saved, and importing it would quietly leave out whatever came
    // after — so it is said rather than discovered later as missing companies.
    self.postMessage({
      type: 'ready',
      headers,
      total: rows.length,
      atExcelLimit: rows.length >= 1048575,
    })
  } catch (err) {
    rows = []
    self.postMessage({
      type: 'error',
      message: /allocation|out of memory/i.test(err?.message || '')
        ? 'الملف أكبر من ذاكرة المتصفّح — قسّمه إلى ملفات أصغر'
        : err?.message || 'تعذّرت قراءة الملف',
    })
  }
}
