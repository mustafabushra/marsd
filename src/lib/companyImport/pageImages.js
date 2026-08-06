/**
 * Turn whatever the person picked into the pages the reader can actually take.
 *
 * The model behind /api/extract-document reads images and only images — it
 * refuses PDFs outright. So the conversion happens here, in the browser, before
 * anything is uploaded. That placement is deliberate twice over: a 6MB scan
 * becomes ~400KB of JPEG before it crosses the network, and the serverless
 * function never has to carry a PDF renderer.
 *
 * pdfjs is imported dynamically. It is several megabytes, and somebody adding a
 * company by typing must not pay for a library they never reach.
 */

/** Certificates are one or two pages. Past this is appendices, not fields. */
export const MAX_PAGES = 3

/**
 * Long edge, in pixels, of what gets uploaded.
 *
 * Dense Arabic text is the constraint, not the layout: at 1400px the diacritics
 * and the digits in a ten-digit registration number start to merge, and a
 * misread digit is worse than a slow upload. 2000 holds them and still lands a
 * typical page around 400KB of JPEG.
 */
const MAX_EDGE = 2000

const QUALITY = 0.85

/** Canvas → base64 without the data: prefix the API adds back itself. */
function encode(canvas) {
  const url = canvas.toDataURL('image/jpeg', QUALITY)
  return { media_type: 'image/jpeg', data: url.split(',')[1] || '' }
}

/** Scale so the long edge is at most MAX_EDGE. Never scales up. */
function fit(w, h) {
  const scale = Math.min(1, MAX_EDGE / Math.max(w, h))
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) }
}

async function fromPdf(file, onProgress) {
  const pdfjs = await import('pdfjs-dist')
  // Bundled by Vite rather than fetched from a CDN — nothing here should need
  // the open internet at the moment somebody is using it.
  const workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc

  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  const pages = Math.min(doc.numPages, MAX_PAGES)
  const out = []

  for (let i = 1; i <= pages; i++) {
    onProgress?.(`يحوّل الصفحة ${i} من ${pages}…`)
    const page = await doc.getPage(i)

    // Render at the scale that lands on MAX_EDGE directly, rather than
    // rendering large and shrinking after: rasterising once at the target size
    // is sharper than resampling, and it is the text that has to stay legible.
    const base = page.getViewport({ scale: 1 })
    const scale = Math.min(4, MAX_EDGE / Math.max(base.width, base.height))
    const viewport = page.getViewport({ scale })

    const canvas = document.createElement('canvas')
    canvas.width = Math.round(viewport.width)
    canvas.height = Math.round(viewport.height)
    const ctx = canvas.getContext('2d')
    // A PDF page has no background of its own; without this, anything
    // transparent renders onto black and the text disappears into it.
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    await page.render({ canvasContext: ctx, viewport, canvas }).promise
    out.push(encode(canvas))
  }

  // Release the worker rather than leaving it running behind the dialog.
  doc.destroy?.()

  if (!out.length) throw new Error('الملف لا يحتوي على صفحات')
  return out
}

function fromImage(file, onProgress) {
  onProgress?.('يجهّز الصورة…')
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()

    img.onload = () => {
      URL.revokeObjectURL(url)
      try {
        const { w, h } = fit(img.naturalWidth, img.naturalHeight)
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        // A phone photo re-encoded to JPEG keeps its own background; the fill is
        // for the transparent PNGs people export from scanner apps.
        ctx.fillStyle = '#FFFFFF'
        ctx.fillRect(0, 0, w, h)
        ctx.drawImage(img, 0, 0, w, h)
        resolve([encode(canvas)])
      } catch (e) {
        reject(e)
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('تعذّر فتح الصورة — قد يكون الملف تالفاً'))
    }
    img.src = url
  })
}

/**
 * @param {File} file
 * @param {(note: string) => void} [onProgress]
 * @returns {Promise<Array<{media_type: string, data: string}>>}
 */
export function toPageImages(file, onProgress) {
  const type = String(file?.type || '')
  if (type === 'application/pdf') return fromPdf(file, onProgress)
  if (type.startsWith('image/')) return fromImage(file, onProgress)
  return Promise.reject(new Error('نوع الملف غير مدعوم — PDF أو صورة فقط'))
}
