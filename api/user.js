import { getSessionUser, setCors } from './_utils.js'

const DEFAULT_PREFS = {
  nickname: '',
  avatarId: null,
  dv2inTemplate: '',
  dailyReminder: true
}

async function getKv() {
  const { kv } = await import('@vercel/kv')
  return kv
}

export default async function handler(req, res) {
  setCors(res, req)
  if (req.method === 'OPTIONS') return res.status(200).end()

  const user = getSessionUser(req)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  const key = `user:${user.email}`

  if (req.method === 'GET') {
    try {
      const kv = await getKv()
      const stored = await kv.get(key) || {}
      return res.json({ email: user.email, ...DEFAULT_PREFS, ...stored })
    } catch {
      return res.json({ email: user.email, ...DEFAULT_PREFS })
    }
  }

  if (req.method === 'POST') {
    const { nickname, avatarId, dv2inTemplate, dailyReminder } = req.body || {}
    const update = {}
    if (nickname      !== undefined) update.nickname      = nickname
    if (avatarId      !== undefined) update.avatarId      = avatarId
    if (dv2inTemplate !== undefined) update.dv2inTemplate = dv2inTemplate
    if (dailyReminder !== undefined) update.dailyReminder = !!dailyReminder

    try {
      const kv = await getKv()
      const existing = await kv.get(key) || {}
      const merged = { ...DEFAULT_PREFS, ...existing, ...update, updatedAt: Date.now() }
      await kv.set(key, merged)
      return res.json({ success: true, ...merged, email: user.email })
    } catch (err) {
      console.error('[user] KV error:', err)
      return res.status(500).json({ error: 'Vercel KV 尚未設定，請先在 Vercel 建立 KV 資料庫' })
    }
  }

  return res.status(405).end()
}
