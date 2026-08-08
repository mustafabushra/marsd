/**
 * A real signed-in browser, for auditing the screens behind Clerk.
 *
 * The mobile audit could only reach the eight public pages. Every screen that
 * matters — the dashboard, search, the trust report, the whole admin panel —
 * sits behind a session, and the faults reported from a real phone were on
 * exactly those. Auditing them meant either a password, or faking a session and
 * testing the fake.
 *
 * Clerk's own testing tokens are the third option: a short-lived token minted
 * with the secret key that lets an automated browser through the real sign-in,
 * against the real instance. Nothing is stubbed — the app runs as it does for a
 * user, and what the audit measures is the product.
 *
 * Credentials come from .env.clerk and .env.local, which are git-ignored. They
 * are never printed, and never passed on a command line where they would reach
 * shell history.
 */

import { readFileSync, existsSync } from 'node:fs'

/** Read one key from the first env file that carries it. */
export function envKey(name, files = ['.env.clerk', '.env.local', '.env']) {
  for (const f of files) {
    if (!existsSync(f)) continue
    const line = readFileSync(f, 'utf8').split(/\r?\n/)
      .find((l) => l.trim().startsWith(`${name}=`))
    if (!line) continue
    // The BOM lesson: a value that arrives through a pipe or an editor can
    // carry an invisible character that makes an otherwise correct key fail
    // authentication with no useful message.
    return line.split('=').slice(1).join('=').trim().replace(/^﻿/, '').replace(/^["']|["']$/g, '')
  }
  return null
}

export const CLERK_PUBLISHABLE = envKey('VITE_CLERK_PUBLISHABLE_KEY')
export const CLERK_SECRET = envKey('CLERK_SECRET_KEY')

export const hasClerkKeys = !!(CLERK_PUBLISHABLE && CLERK_SECRET)
