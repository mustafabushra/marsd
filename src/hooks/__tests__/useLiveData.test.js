/**
 * Two screens may watch the same table.
 *
 * The live-data hook named its channel after the tables and the filter, so any
 * two components watching the same thing produced the same name. Supabase's
 * `channel(topic)` returns an *existing* channel when one with that topic is
 * open — it does not make a second — so the second component called `.on()` on a
 * channel that had already been subscribed, and the realtime client throws:
 *
 *     cannot add `postgres_changes` callbacks for
 *     realtime:live:notifications:all after `subscribe()`
 *
 * /notifications died on that. NotificationBell lives in the shell header and
 * watches `notifications` on every screen; the notifications page watches the
 * same table, the names matched, and the page rendered an error boundary.
 *
 * Two other pairs of call sites watch identical sets — (reports, disputes) and
 * (reports, disputes, trust_scores) — and survived only because both members of
 * each pair are pages, and two pages are never mounted together. The bell is
 * chrome. That is timing, not safety.
 *
 * The test below is the collision itself: a fake client with the two behaviours
 * that produced the bug — returning an existing channel by topic, and refusing
 * `.on()` after `subscribe()`.
 */

import { describe, it, expect } from 'vitest'
import { liveChannelTopic } from '../useLiveData'

/** A stand-in for RealtimeClient, faithful in the two ways that matter. */
function fakeSupabase() {
  const channels = new Map()
  return {
    channels,
    channel(topic) {
      // Supabase returns the existing channel rather than a second one.
      if (channels.has(topic)) return channels.get(topic)
      const ch = {
        topic,
        subscribed: false,
        handlers: 0,
        on() {
          if (this.subscribed) {
            throw new Error(
              `cannot add \`postgres_changes\` callbacks for realtime:${topic} after \`subscribe()\`.`)
          }
          this.handlers++
          return this
        },
        subscribe() { this.subscribed = true; return this },
      }
      channels.set(topic, ch)
      return ch
    },
  }
}

/** What the hook does inside its effect, without needing a DOM to run it. */
const mount = (supabase, tables, filter, instanceId) => {
  const ch = supabase.channel(liveChannelTopic(tables, filter, instanceId))
  for (const t of tables) ch.on('postgres_changes', { table: t }, () => {})
  ch.subscribe()
  return ch
}

describe('useLiveData channel naming', () => {
  it('يعطي كل مشترك قناة خاصة به', () => {
    expect(liveChannelTopic(['notifications'], null, 'a'))
      .not.toBe(liveChannelTopic(['notifications'], null, 'b'))
  })

  it('الجرس والصفحة يشتركان في notifications معاً بلا انفجار', () => {
    const supabase = fakeSupabase()
    // NotificationBell, mounted in the shell on every screen.
    mount(supabase, ['notifications'], null, 'bell')
    // The /notifications page, opened on top of it. This threw before the fix.
    expect(() => mount(supabase, ['notifications'], null, 'page')).not.toThrow()
    expect(supabase.channels.size).toBe(2)
  })

  it('والاسم القديم كان يفجّر — هذا ما يثبت أن الفحص يقيس شيئاً', () => {
    const supabase = fakeSupabase()
    const legacy = (tables) => {
      const ch = supabase.channel(`live:${tables.join('-')}:all`)
      for (const t of tables) ch.on('postgres_changes', { table: t }, () => {})
      ch.subscribe()
    }
    legacy(['notifications'])
    expect(() => legacy(['notifications'])).toThrow(/after `subscribe\(\)`/)
  })

  it('ترتيب الجداول لا يغيّر القناة لنفس المشترك', () => {
    expect(liveChannelTopic(['reports', 'disputes'], null, 'x'))
      .toBe(liveChannelTopic(['disputes', 'reports'], null, 'x'))
  })

  it('والمرشِّح جزء من الاسم', () => {
    expect(liveChannelTopic(['reports'], 'company_id=eq.1', 'x'))
      .not.toBe(liveChannelTopic(['reports'], 'company_id=eq.2', 'x'))
  })
})
