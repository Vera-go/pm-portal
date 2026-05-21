import { getSessionUser, setCors, parseCookies } from './_utils.js'

const DEFAULT_PREFS = {
  nickname: '',
  avatarId: null,
  dv2inTemplate: '',
  dailyReminder: true
}

// ── Vercel KV helpers ────────────────────────────────────
async function kvGet(key) {
  const { kv } = await import('@vercel/kv')
  return await kv.get(key)
}

async function kvSet(key, value) {
  const { kv } = await import('@vercel/kv')
  await kv.set(key, value)
}

// ── Cookie fallback helpers ──────────────────────────────
function prefsFromCookie(req) {
  const cookies = parseCookies(req.headers.cookie)
  if (!cookies.pm_prefs) return null
  try {
    return JSON.parse(Buffer.from(cookies.pm_prefs, 'base64url').toString())
  } catch {
    return null
  }
}

function setCookiePrefs(res, prefs) {
  const val = Buffer.from(JSON.stringify(prefs)).toString('base64url')
  res.setHeader('Set-Cookie',
    `pm_prefs=${val}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`)
}

// ─────────────────────────────────────────────────────────
export default async function handler(req, res) {
  setCors(res, req)
  if (req.method === 'OPTIONS') return res.status(200).end()

  const user = getSessionUser(req)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  const key = `user:${user.email}`

  // GET ── 取得設定
  if (req.method === 'GET') {
    try {
      const stored = await kvGet(key) || {}
      return res.json({ email: user.email, ...DEFAULT_PREFS, ...stored, _storage: 'kv' })
    } catch {
      // KV 未設定，從 cookie 讀取
      const stored = prefsFromCookie(req) || {}
      return res.json({ email: user.email, ...DEFAULT_PREFS, ...stored, _storage: 'cookie' })
    }
  }

  // POST ── 儲存設定
  if (req.method === 'POST') {
    const { nickname, avatarId, dv2inTemplate, dailyReminder } = req.body || {}
    const update = {}
    if (nickname      !== undefined) update.nickname      = nickname
    if (avatarId      !== undefined) update.avatarId      = avatarId
    if (dv2inTemplate !== undefined) update.dv2inTemplate = dv2inTemplate
    if (dailyReminder !== undefined) update.dailyReminder = !!dailyReminder

    try {
      // 優先用 KV（跨裝置）
      const existing = await kvGet(key) || {}
      const merged = { ...DEFAULT_PREFS, ...existing, ...update, updatedAt: Date.now() }
      await kvSet(key, merged)
      return res.json({ success: true, ...merged, email: user.email, _storage: 'kv' })
    } catch {
      // KV 未設定，改存 cookie（同裝置）
      const existing = prefsFromCookie(req) || {}
      const merged = { ...DEFAULT_PREFS, ...existing, ...update }
      setCookiePrefs(res, merged)
      return res.json({ success: true, ...merged, email: user.email, _storage: 'cookie' })
    }
  }

  return res.status(405).end()
}
