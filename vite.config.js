import { defineConfig } from 'vite'
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
          await mod.default({ ...req, query, method: req.method }, res)
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
