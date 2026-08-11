// Vercel serverless function: GET /api/registry-source?dataset=<uuid>
//
// The provenance of a registry generation — who published it, which quarter,
// when it was last refreshed — read from open.data.gov.sa.
//
// ============================================================================
// Why it is not fetched from the page
// ============================================================================
// AdminRegistryImport called the portal directly from the browser. The portal
// sends no Access-Control-Allow-Origin, so the request was refused by CORS on
// every load, in every environment, since the day it was written. The page
// treats the failure as non-fatal and imports anyway, which is why nobody
// noticed: the import works, and the label simply never appeared. The effect is
// that `source: 'official'` has been a claim with nothing behind it.
//
// A server has no origin to be checked against. The same request from here
// returns the real record.
//
// ============================================================================
// Why this takes a dataset id and not a URL
// ============================================================================
// A proxy that forwards whatever URL it is handed is an open relay: it will
// fetch a cloud metadata endpoint or an internal address on behalf of anyone
// who asks. The host and path are fixed here, and the only thing the caller
// controls is a dataset id that must look like a UUID.

const API = 'https://open.data.gov.sa/data/api'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// The register is republished quarterly. Asking the portal once a day is more
// than enough, and it keeps a burst of page loads from becoming a burst of
// outbound requests.
const TTL_MS = 24 * 60 * 60 * 1000
const cache = new Map()

export default async function handler (req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'GET only' })
  }

  const dataset = String(req.query?.dataset || '')
  if (!UUID.test(dataset)) {
    return res.status(400).json({ error: 'dataset must be a uuid' })
  }

  const hit = cache.get(dataset)
  if (hit && Date.now() - hit.at < TTL_MS) {
    res.setHeader('Cache-Control', 'public, max-age=3600')
    return res.status(200).json(hit.body)
  }

  try {
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), 8000)
    const r = await fetch(`${API}/datasets?version=-1&dataset=${dataset}`, {
      headers: { Accept: 'application/json' },
      signal: ac.signal,
    }).finally(() => clearTimeout(timer))

    if (!r.ok) {
      return res.status(502).json({ error: 'تعذّر الوصول إلى بوابة البيانات المفتوحة' })
    }

    // The portal answers an unknown path with its own HTML page and a 200, so a
    // successful status proves nothing on its own. Six invented endpoints
    // returned exactly that while looking like success.
    const type = r.headers.get('content-type') || ''
    if (!type.includes('json')) {
      return res.status(502).json({ error: 'البوابة ردّت بصفحة بدل بيانات' })
    }

    const d = await r.json()

    // Provenance is only claimed when the portal actually named the thing. An
    // empty record is reported as unverified rather than dressed up as
    // official — the whole point of the label is that it is evidence.
    const verified = Boolean(d?.titleAr || d?.titleEn)
    const body = {
      verified,
      datasetId: dataset,
      titleAr: d.titleAr || null,
      providerAr: d.providerNameAr || null,
      updatedAt: d.updatedAt || null,
      frequency: d.updateFrequency || null,
      fetchedAt: new Date().toISOString(),
    }

    if (verified) cache.set(dataset, { at: Date.now(), body })
    res.setHeader('Cache-Control', 'public, max-age=3600')
    return res.status(200).json(body)
  } catch (e) {
    const aborted = e?.name === 'AbortError'
    return res.status(504).json({
      error: aborted ? 'انتهت مهلة الاتصال ببوابة البيانات المفتوحة' : 'تعذّر الوصول إلى البوابة',
    })
  }
}
