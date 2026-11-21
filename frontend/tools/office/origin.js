/**
 * Editor origin for /tools/office/: the build-time VITE_OFFICE_EDITOR_ORIGIN, or ?ed=<url> only while this
 * page itself runs on localhost (local testing). Plain http is accepted only on localhost.
 */
export function resolveEditorOrigin(env, loc) {
  const local = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(loc.hostname)
  const override = local ? new URLSearchParams(loc.search).get('ed') : null
  for (const raw of [override, env]) {
    if (!raw) continue
    try {
      const u = new URL(String(raw).trim())
      if (u.protocol === 'https:' || (local && u.protocol === 'http:')) return u.origin
    } catch { /* 잘못된 값은 무시 */ }
  }
  return null
}
