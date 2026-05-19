import { createHash } from 'crypto'

function makeToken(password) {
  return createHash('sha256').update(password + 'pm-portal').digest('hex').slice(0, 32)
}

function parseCookies(cookieHeader = '') {
  return Object.fromEntries(
    cookieHeader.split(';')
      .map(c => c.trim().split('='))
      .filter(p => p.length === 2)
      .map(([k, v]) => [k.trim(), v.trim()])
  )
}

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const PORTAL_PASSWORD = process.env.PORTAL_PASSWORD
  if (!PORTAL_PASSWORD) return res.status(500).json({ error: '尚未設定 PORTAL_PASSWORD' })

  const expected = makeToken(PORTAL_PASSWORD)

  // GET：驗證目前的 session cookie
  if (req.method === 'GET') {
    const cookies = parseCookies(req.headers.cookie)
    if (cookies.pm_auth === expected) return res.status(200).json({ ok: true })
    return res.status(401).json({ ok: false })
  }

  // POST：登入
  if (req.method === 'POST') {
    const { password } = req.body || {}
    if (password !== PORTAL_PASSWORD) {
      return res.status(401).json({ error: '密碼錯誤' })
    }
    const maxAge = 60 * 60 * 24 * 30  // 30 天
    res.setHeader('Set-Cookie', `pm_auth=${expected}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`)
    return res.status(200).json({ ok: true })
  }

  return res.status(405).end()
}
