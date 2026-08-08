#!/usr/bin/env node
/**
 * The built app and its serverless functions, on one origin, locally.
 *
 * `vite preview` serves the pages and 404s every `/api/*` call. `vercel dev`
 * should do both, but it starts the dev script on a port of its own choosing
 * and then fails to find it — «Failed to detect a server running on port
 * 54582» — because the script pins 3000.
 *
 * Neither is worth fighting for a test. This serves `dist/` and mounts each
 * file in `api/` at its own path, with the same request and response shapes
 * Vercel gives a function, so the code under test is the deployed code and not
 * an adaptation of it.
 *
 * A local harness, not a deployment target: single-threaded, no caching, no
 * compression, and it reads secrets from the git-ignored env files.
 *
 *   node scripts/serve-with-api.mjs [port]
 */

import { createServer } from 'node:http'
import { readFile, readdir } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const PORT = Number(process.argv[2]) || 3000
const DIST = resolve('dist')

// Environment, the way the host would have supplied it. A committed .env does
// not reach a deployed function; here it is the only source there is.
for (const f of ['.env.vercel.local', '.env.clerk', '.env.migrations', '.env.local', '.env']) {
  if (!existsSync(f)) continue
  for (const line of readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (!m) continue
    const [, k, raw] = m
    if (process.env[k]) continue
    process.env[k] = raw.trim().replace(/^﻿/, '').replace(/^["']|["']$/g, '')
  }
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.woff2': 'font/woff2', '.ico': 'image/x-icon',
}

const handlers = new Map()
for (const f of await readdir('api')) {
  if (!f.endsWith('.js')) continue
  const mod = await import(pathToFileURL(resolve('api', f)).href)
  handlers.set(`/api/${f.replace(/\.js$/, '')}`, mod.default)
}
console.log(`  الدوال: ${[...handlers.keys()].join(', ')}`)

const readBody = (req) => new Promise((res) => {
  let b = ''
  req.on('data', (c) => { b += c })
  req.on('end', () => res(b))
})

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)

  const fn = handlers.get(url.pathname)
  if (fn) {
    // The small part of the Vercel request/response surface these functions
    // use. Anything they reach for that is not here should fail loudly rather
    // than silently differ from production.
    req.body = await readBody(req)
    res.status = (c) => { res.statusCode = c; return res }
    res.json = (o) => { res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(o)) }
    try {
      await fn(req, res)
    } catch (e) {
      res.statusCode = 500
      res.end(JSON.stringify({ error: e.message }))
    }
    return
  }

  // Static, then the SPA fallback — every client route has to reach index.html
  // or /u/<token> would 404 on the one browser that matters.
  const file = join(DIST, url.pathname === '/' ? 'index.html' : url.pathname)
  try {
    const body = await readFile(file)
    res.setHeader('Content-Type', MIME[extname(file)] || 'application/octet-stream')
    res.end(body)
  } catch {
    try {
      res.setHeader('Content-Type', MIME['.html'])
      res.end(await readFile(join(DIST, 'index.html')))
    } catch {
      res.statusCode = 404
      res.end('not found')
    }
  }
}).listen(PORT, '127.0.0.1', () => console.log(`  http://127.0.0.1:${PORT}\n`))
