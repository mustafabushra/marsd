/**
 * The indicator that says whether what is on screen is current.
 *
 * A dashboard that updates silently is indistinguishable from one that has
 * frozen, and the difference matters most exactly when someone is waiting on a
 * number to move. This says which of the two is happening, and shows the time of
 * the last refresh so "nothing changed" reads differently from "nothing arrived".
 *
 * Kept apart from useLiveData: that file is a hook and holds no markup, and JSX
 * in a .js file is what broke the build when the two lived together.
 */
export function LiveBadge({ connected, liveAt }) {
  const time = liveAt
    ? liveAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : null

  return (
    <span
      title={connected ? 'البيانات تُحدَّث تلقائياً عند أي تغيير' : 'انقطع البث — البيانات قد لا تكون محدَّثة'}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '7px',
        background: connected ? '#F0FDF4' : '#FEF2F2',
        border: `1px solid ${connected ? '#BBF7D0' : '#FECACA'}`,
        color: connected ? '#15803D' : '#B91C1C',
        borderRadius: '999px', padding: '5px 12px',
        fontSize: '12px', fontWeight: 800, whiteSpace: 'nowrap',
      }}
    >
      <span style={{
        width: '7px', height: '7px', borderRadius: '50%',
        background: connected ? '#16A34A' : '#DC2626',
        animation: connected ? 'livePulse 2s ease-in-out infinite' : 'none',
      }} />
      {connected ? (time ? `مباشر · ${time}` : 'مباشر') : 'غير متصل'}
      <style>{`@keyframes livePulse { 0%,100% { opacity: 1 } 50% { opacity: .35 } }`}</style>
    </span>
  )
}
