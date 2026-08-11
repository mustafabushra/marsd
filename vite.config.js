import { defineConfig, loadEnv } from 'vite'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'

/**
 * Serve api/*.js during `vite dev`, the way Vercel serves them in production.
 *
 * Without this, /api exists only once deployed: in development every call to it
 * 404s, so the endpoints could not be exercised or tested locally, and the
 * honest options were to ship them unrun or not ship them at all.
 *
 * `apply: 'serve'` — this touches the dev server only and has no part in a
 * build. The handler is imported per request so editing it does not need a
 * restart.
 */
function devApiRoutes () {
  return {
    name: 'dev-api-routes',
    apply: 'serve',
    configureServer (server) {
      // Vercel puts every configured variable in process.env; vite exposes only
      // VITE_-prefixed ones, and to import.meta.env rather than process.env. So
      // a handler reading process.env.CLERK_SECRET_KEY works in production and
      // sees undefined in development — which fails as an invalid session
      // rather than as a missing key, and sends you looking at the token.
      const env = loadEnv('development', process.cwd(), '')
      for (const [k, v] of Object.entries(env)) {
        if (process.env[k] === undefined) process.env[k] = v
      }

      // loadEnv reads .env, .env.local and the mode variants — and this project
      // keeps the Clerk keys in .env.clerk, which is none of those. On Vercel
      // they are set in the dashboard so nothing notices; locally the handler
      // got no secret and rejected a perfectly valid token as an invalid
      // session, which sends you looking at the token.
      for (const extra of ['.env.clerk', '.env.migrations']) {
        try {
          for (const line of readFileSync(resolve(process.cwd(), extra), 'utf8').split(/\r?\n/)) {
            const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
            if (!m) continue
            const val = m[2].replace(/^["']|["']$/g, '')
            if (process.env[m[1]] === undefined) process.env[m[1]] = val
          }
        } catch { /* not every checkout has every file */ }
      }

      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next()

        const url = new URL(req.url, 'http://localhost')
        const name = url.pathname.replace('/api/', '').replace(/[^a-zA-Z0-9_-]/g, '')
        if (!name) return next()

        try {
          const mod = await server.ssrLoadModule(`/api/${name}.js`)
          const query = Object.fromEntries(url.searchParams)

          // The shape Vercel's node runtime hands a handler, as much of it as
          // these endpoints use.
          res.status = (c) => { res.statusCode = c; return res }
          res.json = (b) => {
            res.setHeader('Content-Type', 'application/json; charset=utf-8')
            res.end(JSON.stringify(b))
            return res
          }
          // Buffers and strings both — the PDF endpoint returns bytes, and
          // JSON.stringify on a Buffer produces a base64 object rather than a
          // file.
          res.send = (b) => { res.end(Buffer.isBuffer(b) ? b : String(b)); return res }
          // The request itself, with `query` attached — not `{...req}`.
          // Spreading an IncomingMessage copies its own enumerable properties
          // and loses everything reached through the prototype, so a handler
          // reading req.headers.authorization got undefined and answered 401 to
          // a request that was carrying a perfectly good token.
          req.query = query
          await mod.default(req, res)
        } catch (e) {
          if (e?.code === 'ERR_MODULE_NOT_FOUND' || /Failed to load url/.test(String(e))) return next()
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(JSON.stringify({ error: String(e?.message || e) }))
        }
      })
    },
  }
}

export default defineConfig({
  build: { sourcemap: 'hidden' },
  plugins: [react(), devApiRoutes()],
  server: {
    port: 3000,
    host: 'localhost',
    middlewareMode: false
  },
  // SPA routing fallback for all routes
  preview: {
    middlewareMode: false
  }
})
