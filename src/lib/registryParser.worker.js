/**
 * Reading the commercial register off the main thread.
 *
 * The first version read the file in the click handler. `XLSX.read` on a
 * quarter of the national register — hundreds of thousands of rows — holds the
 * only thread the page has for long enough that Chrome decides the tab is dead
 * and kills it: `RESULT_CODE_HUNG`, reported from a real import.
 *
 * The upload was already batched. The *parse* was not, and it is the larger
 * half: batching what happens after a freeze does not help anyone who never
 * gets past the freeze.
 *
 * So the file is read here, in a worker, and the rows come back in chunks. The
 * page stays responsive, the progress is real from the first second, and the
 * stop button works while it is happening rather than after.
 */

import * as XLSX from 'xlsx'

const CHUNK = 2000

self.onmessage = async (e) => {
  const { file } = e.data

  try {
    const buf = await file.arrayBuffer()
    self.postMessage({ type: 'stage', stage: 'reading' })

    // `dense` keeps the sheet as arrays rather than one object per cell. On a
    // file this size that is the difference between a few hundred megabytes and
    // several gigabytes — the second of which is its own kind of hang.
    const wb = XLSX.read(buf, { type: 'array', cellDates: true, dense: true })
    const sheetName = wb.SheetNames[0]
    if (!sheetName) throw new Error('الملف لا يحتوي على أوراق')

    const ws = wb.Sheets[sheetName]
    self.postMessage({ type: 'stage', stage: 'converting' })

    // Header row first, so the page can show which columns were recognised
    // before the rest of the file has even been converted.
    const headerRows = XLSX.utils.sheet_to_json(ws, { header: 1, range: 0, defval: null })
    const headers = (headerRows[0] || []).map((h) => String(h ?? '').trim()).filter(Boolean)
    if (!headers.length) throw new Error('لا توجد صفوف عناوين في الورقة الأولى')

    self.postMessage({ type: 'headers', headers })

    const rows = XLSX.utils.sheet_to_json(ws, { defval: null })
    self.postMessage({ type: 'total', total: rows.length })

    for (let i = 0; i < rows.length; i += CHUNK) {
      self.postMessage({ type: 'rows', rows: rows.slice(i, i + CHUNK) })
    }

    self.postMessage({ type: 'done' })
  } catch (err) {
    self.postMessage({ type: 'error', message: err?.message || 'تعذّرت قراءة الملف' })
  }
}
