import { parseDocumentText, parseQrPayload, emptyExtraction } from './normalize'

/**
 * The sources a company's data can be imported from.
 *
 * Each entry is self-contained: an id, what it accepts, and a run() that returns
 * the shape defined in normalize.js. The import sheet renders whatever is in
 * this list, so an official registry lookup later is one more entry here and a
 * form for its input — no screen rewritten, no second review path.
 *
 * Every library is imported dynamically. tesseract.js and pdfjs together are
 * several megabytes; a person adding a company by typing must not pay for them,
 * and the main bundle is already large enough.
 */

// ---------------------------------------------------------------------------
// QR
// ---------------------------------------------------------------------------

/**
 * Read a QR from a still frame.
 *
 * BarcodeDetector is native in Chrome, Edge and Android and needs no download.
 * jsQR is the fallback for Safari and Firefox, and is small enough to fetch on
 * demand without the person noticing.
 */
export async function readQrFromImageData(imageData) {
  if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
    try {
      const supported = await window.BarcodeDetector.getSupportedFormats()
      if (supported.includes('qr_code')) {
        const detector = new window.BarcodeDetector({ formats: ['qr_code'] })
        const bitmap = await createImageBitmap(
          new ImageData(imageData.data, imageData.width, imageData.height))
        const found = await detector.detect(bitmap)
        bitmap.close?.()
        if (found?.length) return found[0].rawValue
        return null
      }
    } catch {
      // Falls through to jsQR: a detector that throws is not a detector.
    }
  }

  const { default: jsQR } = await import('jsqr')
  const found = jsQR(imageData.data, imageData.width, imageData.height,
    { inversionAttempts: 'attemptBoth' })
  return found?.data || null
}

// ---------------------------------------------------------------------------
// OCR
// ---------------------------------------------------------------------------

/**
 * Arabic and English together, because these documents carry both and the
 * English half is where the Latin-script name and the website live.
 *
 * onProgress is passed through so a scan that takes twenty seconds says so.
 */
/**
 * What tesseract needs a photograph to look like before it can read Arabic.
 *
 * A phone picture of a certificate is large, low-contrast and unevenly lit, and
 * tesseract does badly on all three. Three cheap corrections carry most of the
 * accuracy:
 *
 *   1. Scale so the text is around the 30px cap height the engine is trained on.
 *      A 4000px photo is scaled DOWN, a small screenshot UP — both were wrong
 *      before, in opposite directions.
 *   2. Greyscale by luminance, not by averaging channels: the seals and stamps on
 *      these documents are coloured, and averaging turns them into mid-grey mud
 *      that sits right at the threshold.
 *   3. Threshold against the local mean rather than a fixed 128, so a page that
 *      is bright on one side and shadowed on the other does not lose half its
 *      text.
 *
 * Arabic is a connected script, so a threshold that eats thin strokes does not
 * lose a letter — it merges two words. That is why this matters more here than
 * it would for Latin text.
 */
function preprocess(source) {
  const w = source.width
  const h = source.height
  // ~2200px on the long edge puts body text near the size tesseract expects.
  const scale = Math.min(3, Math.max(0.35, 2200 / Math.max(w, h)))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w * scale)
  canvas.height = Math.round(h * scale)

  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)

  const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const px = img.data
  const grey = new Uint8ClampedArray(px.length / 4)
  for (let i = 0, g = 0; i < px.length; i += 4, g++) {
    grey[g] = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]
  }

  // Mean over a coarse grid, then bilinear-ish lookup: a full box blur over a
  // multi-megapixel image is slow enough to feel, and the illumination gradient
  // it is correcting is smooth by nature.
  const cell = 48
  const cols = Math.ceil(canvas.width / cell)
  const rows = Math.ceil(canvas.height / cell)
  const means = new Float32Array(cols * rows)
  for (let ry = 0; ry < rows; ry++) {
    for (let rx = 0; rx < cols; rx++) {
      let sum = 0
      let n = 0
      const x1 = Math.min(canvas.width, (rx + 1) * cell)
      const y1 = Math.min(canvas.height, (ry + 1) * cell)
      for (let y = ry * cell; y < y1; y += 2) {
        for (let x = rx * cell; x < x1; x += 2) {
          sum += grey[y * canvas.width + x]
          n++
        }
      }
      means[ry * cols + rx] = n ? sum / n : 128
    }
  }

  for (let y = 0, i = 0; y < canvas.height; y++) {
    const ry = Math.min(rows - 1, (y / cell) | 0)
    for (let x = 0; x < canvas.width; x++, i += 4) {
      const rx = Math.min(cols - 1, (x / cell) | 0)
      // 8 below the local mean: ink is darker than its surroundings, and the
      // margin keeps paper texture from being read as strokes.
      const v = grey[y * canvas.width + x] < means[ry * cols + rx] - 8 ? 0 : 255
      px[i] = px[i + 1] = px[i + 2] = v
      px[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  return canvas
}

async function ocr(imageLike, onProgress) {
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker(['ara', 'eng'], 1, {
    logger: (m) => {
      if (m.status === 'recognizing text' && typeof m.progress === 'number') {
        onProgress?.(Math.round(m.progress * 100))
      }
    },
  })
  try {
    // A registration extract is a page of text blocks, not a single line and not
    // a photograph of a scene. Saying so stops the layout analyser from treating
    // the seal or the QR as a column of writing.
    await worker.setParameters({
      tessedit_pageseg_mode: '1',              // automatic, with orientation detection
      preserve_interword_spaces: '1',          // the parser splits fields on runs of spaces
    })
    const { data } = await worker.recognize(imageLike)
    return data?.text || ''
  } finally {
    await worker.terminate()
  }
}

// ---------------------------------------------------------------------------
// The sources
// ---------------------------------------------------------------------------

/** A frame from the camera, or an uploaded image, scanned for a QR code. */
export const qrSource = {
  id: 'qr',
  label: 'مسح رمز QR',
  icon: '📷',
  hint: 'وجّه الكاميرا نحو الرمز في السجل التجاري أو شهادة مركز الأعمال',
  accepts: null, // camera, not a file picker
  async runOnImageData(imageData) {
    const raw = await readQrFromImageData(imageData)
    return raw ? parseQrPayload(raw) : null
  },
}

/** An uploaded photo or scan. Read for a QR first, then OCR'd. */
export const imageSource = {
  id: 'image',
  label: 'رفع صورة',
  icon: '🖼️',
  hint: 'صورة واضحة للسجل التجاري أو الشهادة',
  accepts: 'image/*',
  async run(file, onProgress) {
    const bitmap = await createImageBitmap(file)
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(bitmap, 0, 0)

    // A photograph of a certificate usually has the QR in it, and a QR read is
    // exact where OCR is a guess — so it is tried first and its values outrank
    // anything the text pass produces.
    onProgress?.(0, 'يبحث عن رمز QR في الصورة…')
    let fromQr = null
    try {
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const raw = await readQrFromImageData(data)
      if (raw) fromQr = parseQrPayload(raw)
    } catch { /* no QR in the picture is the normal case */ }

    // Read the QR from the original pixels above; threshold only for the text
    // pass, because thresholding can destroy a QR that a photo captured faintly.
    onProgress?.(0, 'يحسّن الصورة قبل القراءة…')
    const prepared = preprocess(canvas)

    onProgress?.(0, 'يقرأ نص المستند…')
    const text = await ocr(prepared, (p) => onProgress?.(p, 'يقرأ نص المستند…'))
    const fromText = parseDocumentText(text, 'image')

    bitmap.close?.()
    if (!fromQr) return fromText

    const { mergeExtractions } = await import('./normalize')
    const merged = mergeExtractions(fromQr, fromText)
    return { ...merged, source: 'image', note: fromQr.note || fromText.note }
  },
}

/** An uploaded PDF. Its first pages are rendered and treated as images. */
export const pdfSource = {
  id: 'pdf',
  label: 'رفع ملف PDF',
  icon: '📄',
  hint: 'نسخة السجل التجاري أو الشهادة بصيغة PDF',
  accepts: 'application/pdf',
  async run(file, onProgress) {
    onProgress?.(0, 'يفتح الملف…')
    const pdfjs = await import('pdfjs-dist')
    // Bundled by Vite rather than fetched from a CDN — nothing here should need
    // the open internet at the moment somebody is using it.
    const workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
    pdfjs.GlobalWorkerOptions.workerSrc = workerSrc

    const buf = await file.arrayBuffer()
    const doc = await pdfjs.getDocument({ data: buf }).promise

    // These documents are one or two pages. Reading more would multiply a slow
    // operation for pages that carry appendices, not fields.
    const pages = Math.min(doc.numPages, 2)
    const texts = []
    let fromQr = null
    // A PDF that carried its own text layer was never guessed at, so its fields
    // are exact and are marked as such.
    let allEmbedded = true

    for (let i = 1; i <= pages; i++) {
      const page = await doc.getPage(i)
      const viewport = page.getViewport({ scale: 2 }) // OCR needs the resolution
      const canvas = document.createElement('canvas')
      canvas.width = viewport.width
      canvas.height = viewport.height
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      await page.render({ canvasContext: ctx, viewport, canvas }).promise

      // A digital PDF carries its text already; OCR is only for scans.
      const layer = await page.getTextContent()
      const embedded = (layer.items || []).map((it) => it.str).join(' ').trim()

      if (!fromQr) {
        try {
          const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
          const raw = await readQrFromImageData(data)
          if (raw) fromQr = parseQrPayload(raw)
        } catch { /* no QR on this page */ }
      }

      if (embedded.length > 40) {
        onProgress?.(100, `صفحة ${i}: نص مضمّن`)
        texts.push(embedded)
      } else {
        allEmbedded = false
        onProgress?.(0, `صفحة ${i}: يحسّن الصفحة…`)
        const prepared = preprocess(canvas)
        onProgress?.(0, `صفحة ${i}: يقرأ بالتعرّف الضوئي…`)
        texts.push(await ocr(prepared, (p) => onProgress?.(p, `صفحة ${i} من ${pages}`)))
      }
    }

    const fromText = parseDocumentText(texts.join('\n'), 'pdf', allEmbedded)
    if (!fromQr) return fromText

    const { mergeExtractions } = await import('./normalize')
    const merged = mergeExtractions(fromQr, fromText)
    return { ...merged, source: 'pdf', note: fromQr.note || fromText.note }
  },
}

/**
 * Text copied from the verification page the QR points at.
 *
 * The Saudi Business Centre page is rendered by JavaScript, so fetching its HTML
 * returns an empty shell — and the portal sits behind an Altcha proof-of-work
 * challenge, so pulling the records server-side would mean defeating an
 * anti-automation control somebody put there on purpose. That is not something
 * to build around.
 *
 * A browser extension like Instant Data Scraper does not defeat it either: it
 * reads the page the person already opened. This does the same thing with the
 * clipboard — you open the link, select the page, paste it here. The characters
 * are exact, so the fields come out exact, which is the part OCR could never
 * promise.
 *
 * If an official lookup ever becomes available, it slots in beside this as one
 * more source returning the same shape.
 */
export const pasteSource = {
  id: 'paste',
  label: 'لصق نص الصفحة',
  icon: '📋',
  hint: 'افتح رابط التحقّق، حدّد الصفحة كاملة وانسخها، ثم الصقها هنا',
  accepts: null,
  run(text) {
    return parseDocumentText(String(text || ''), 'paste', true)
  },
}

export const FILE_SOURCES = [pdfSource, imageSource]
export const ALL_SOURCES = [qrSource, pasteSource, pdfSource, imageSource]

export { emptyExtraction }
