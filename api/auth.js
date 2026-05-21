import { createTransport } from 'nodemailer'
import { sign, verify, parseCookies, setCors } from './_utils.js'

export default async function handler(req, res) {
  setCors(res, req)
  if (req.method === 'OPTIONS') return res.status(200).end()

  // GET ?token=xxx  →  verify magic link, set session cookie, redirect
  if (req.method === 'GET' && req.query.token) {
    const payload = verify(req.query.token)
    if (!payload || payload.type !== 'magic') {
      return res.redirect(302, '/?auth_error=1')
    }
    const session = sign({
      email: payload.email,
      type: 'session',
      exp: Date.now() + 30 * 24 * 60 * 60 * 1000
    })
    res.setHeader('Set-Cookie',
      `pm_auth=${session}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`)
    return res.redirect(302, '/')
  }

  // GET  →  check session
  if (req.method === 'GET') {
    const cookies = parseCookies(req.headers.cookie)
    const payload = verify(cookies.pm_auth)
    if (!payload || payload.type !== 'session') {
      return res.json({ authenticated: false })
    }
    return res.json({ authenticated: true, email: payload.email })
  }

  // POST { email }  →  send magic link
  if (req.method === 'POST') {
    const email = ((req.body || {}).email || '').toLowerCase().trim()
    if (!email.endsWith('@asus.com')) {
      return res.status(400).json({ error: '請使用 @asus.com 信箱登入' })
    }

    const token = sign({ email, type: 'magic', exp: Date.now() + 15 * 60 * 1000 })
    const proto = req.headers['x-forwarded-proto'] || 'https'
    const link  = `${proto}://${req.headers.host}/api/auth?token=${token}`

    // 開發模式：直接印出連結，不寄信
    if (process.env.VERCEL_ENV !== 'production') {
      console.log('\n[auth] ✉  Magic link (dev mode):\n' + link + '\n')
      return res.json({ success: true })
    }

    try {
      const transporter = createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_PASS }
      })
      await transporter.sendMail({
        from: `"PM Portal" <${process.env.GMAIL_USER}>`,
        to: email,
        subject: 'PM Portal 登入連結',
        html: magicLinkEmail(link)
      })
      return res.json({ success: true })
    } catch (err) {
      console.error('[auth] email error:', err)
      return res.status(500).json({ error: '寄送信件失敗，請稍後再試' })
    }
  }

  // DELETE  →  logout
  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie',
      'pm_auth=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0')
    return res.json({ success: true })
  }

  return res.status(405).end()
}

function magicLinkEmail(link) {
  return `<!DOCTYPE html><html lang="zh-TW"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F7F8FA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 16px">
<table width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#fff;border-radius:12px;border:1px solid #E0E0E0;overflow:hidden">
  <tr><td style="background:#0052CC;padding:24px 32px">
    <span style="color:#fff;font-size:16px;font-weight:600;letter-spacing:0.3px">PM Portal</span>
  </td></tr>
  <tr><td style="padding:32px">
    <h2 style="margin:0 0 12px;font-size:20px;color:#172B4D">登入驗證</h2>
    <p style="margin:0 0 28px;font-size:14px;color:#5E6C84;line-height:1.6">
      請點擊下方按鈕完成登入。此連結將在 <strong>15 分鐘</strong>後失效。
    </p>
    <a href="${link}" style="display:inline-block;padding:12px 28px;background:#0052CC;color:#fff;text-decoration:none;border-radius:6px;font-size:15px;font-weight:500">登入 PM Portal</a>
    <p style="margin:28px 0 0;font-size:12px;color:#97A0AF">如果您沒有申請登入，請忽略此信件。</p>
  </td></tr>
</table>
</td></tr></table></body></html>`
}
