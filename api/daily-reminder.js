import nodemailer from 'nodemailer'

async function isSubscribed(email) {
  try {
    const { kv } = await import('@vercel/kv')
    const prefs = await kv.get(`user:${email.toLowerCase()}`)
    if (prefs && prefs.dailyReminder === false) return false
  } catch {}
  return true  // default: subscribed
}

// ─── 設定 ───────────────────────────────────────────────
const JIRA_BASE  = 'https://ec-service.asus.com/jira'
const JIRA_PAT   = process.env.JIRA_PAT
const GMAIL_USER = process.env.GMAIL_USER
const GMAIL_PASS = process.env.GMAIL_PASS

// TEST_MODE = true：掃所有人的單，但信件一律寄到 TEST_EMAIL（不會寄到其他 PM）
// 上線後在 Vercel 環境變數把 TEST_MODE 設成 false
const TEST_MODE   = process.env.TEST_MODE !== 'false'
const TEST_EMAIL  = 'Vera_Chang@asus.com'

const JIRA_BROWSE = `${JIRA_BASE}/browse/`

const JQL_BASE = `project = "10602" AND issuetype = Requirement AND status in ("In Progress", Testing, Planning, "Requirement Check") AND resolution = Unresolved AND "MCC#" = MCC2 AND "Website System" = EC`
const JQL = `${JQL_BASE} ORDER BY updated DESC`

const FIELDS = [
  'summary', 'duedate', 'reporter', 'status', 'subtasks',
  'customfield_12107', // SA_Due
  'customfield_12109', // UAT_Due
  'customfield_13500', // Prod_Date
].join(',')

// ─── 主 handler ─────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    // 1. 從 Jira 撈工單
    const issues = await fetchIssues()

    // 2. 分析日期，依 Reporter 分組
    const alertMap = buildAlertMap(issues)

    // 3. 發信（跳過已取消訂閱的用戶）
    const sent = []
    for (const [email, { name, alerts }] of Object.entries(alertMap)) {
      if (!alerts.length) continue
      if (!TEST_MODE && !(await isSubscribed(email))) continue
      const to = TEST_MODE ? TEST_EMAIL : email
      await sendEmail(to, name, alerts)
      sent.push({ reporter: email, to, count: alerts.length })
    }

    const totalAlerts = Object.values(alertMap).reduce((s, v) => s + v.alerts.length, 0)
    return res.status(200).json({
      success: true,
      testMode: TEST_MODE,
      scanned: issues.length,
      totalAlerts,
      emailsSent: sent,
      message: sent.length === 0
        ? '今日無需提醒的工單，未發送 email'
        : `已發送 ${sent.length} 封提醒信`
    })
  } catch (err) {
    console.error('[daily-reminder]', err)
    return res.status(500).json({ error: err.message })
  }
}

// ─── Jira 查詢（透過 n8n 中轉，避免 IP 白名單問題）────────
const N8N_REMINDER_QUERY = 'https://casper3.app.n8n.cloud/webhook/jira-reminder-query'

async function fetchIssues() {
  const r = await fetch(N8N_REMINDER_QUERY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jql: JQL, fields: FIELDS, maxResults: 100 })
  })
  if (!r.ok) throw new Error(`n8n reminder-query ${r.status}`)
  const data = await r.json()
  return data.issues || []
}

// ─── 日期工具 ────────────────────────────────────────────
function parseDate(val) {
  if (!val) return null
  if (typeof val === 'number') return new Date(val)
  return new Date(val.substring(0, 10))
}

function daysUntil(date) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const d = new Date(date); d.setHours(0, 0, 0, 0)
  return Math.round((d - today) / 864e5)
}

// ─── 建立提醒對照表 ──────────────────────────────────────
function buildAlertMap(issues) {
  const map = {}

  for (const { key, fields } of issues) {
    const {
      summary, duedate, reporter, subtasks = [],
      customfield_12107: saDue,
      customfield_12109: uatDue,
      customfield_13500: prodDate,
    } = fields

    if (!reporter?.emailAddress) continue
    const email = reporter.emailAddress
    if (!map[email]) map[email] = { name: reporter.displayName, alerts: [] }

    const push = (type, fieldName, date, daysLeft, extra = {}) =>
      map[email].alerts.push({ key, summary, type, fieldName, date, daysLeft, ...extra })

    // SA_Due：前 2 天提醒
    if (saDue) {
      const d = parseDate(saDue), days = daysUntil(d)
      if (days >= 0 && days <= 2) push('upcoming', 'SA_Due', d, days)
    }

    // UAT_Due：前 2 天提醒
    if (uatDue) {
      const d = parseDate(uatDue), days = daysUntil(d)
      if (days >= 0 && days <= 2) push('upcoming', 'UAT_Due', d, days)
    }

    // Due 上線日：優先使用 Prod_Date，無值時 fallback 到 duedate
    const effectiveDue = prodDate || duedate
    if (effectiveDue) {
      const d = parseDate(effectiveDue), days = daysUntil(d)
      if (days >= 0 && days <= 2) {
        push('upcoming', 'Due 上線日', d, days)
      } else if (days < 0) {
        const openSubs = subtasks.filter(
          st => st.fields?.status?.statusCategory?.key !== 'done'
        )
        push('overdue', 'Due 上線日', d, days, { openSubs })
      }
    }
  }

  return map
}

// ─── 發信 ────────────────────────────────────────────────
async function sendEmail(to, reporterDisplayName, alerts) {
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: GMAIL_USER, pass: GMAIL_PASS }
  })

  const dateStr = new Date().toLocaleDateString('zh-TW', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long'
  })
  const countStr = `${alerts.length} 項需關注`
  const subject = `📋 PM 工單提醒 ${new Date().toLocaleDateString('zh-TW')} — ${countStr}`

  await transporter.sendMail({
    from: `"PM Portal" <${GMAIL_USER}>`,
    to,
    subject,
    html: buildHtml(reporterDisplayName, alerts, dateStr)
  })
}

// ─── 組 HTML Email（無印風 · email-safe table 結構）──────────
function buildHtml(displayName, alerts, dateStr) {
  const firstName = displayName.split('(')[0].trim()
  const overdue  = alerts.filter(a => a.type === 'overdue')
  const upcoming = alerts.filter(a => a.type === 'upcoming')

  const FONT = "'Microsoft JhengHei','微軟正黑體',Helvetica,Arial,sans-serif"
  const C = {
    outerBg:    '#F0EEE9',
    headerBg:   '#9B7660',   // 淺咖啡暖棕：溫暖舒適，不壓迫
    bodyBg:     '#FFFFFF',
    border:     '#DDD9D3',
    text1:      '#2D2D2D',
    text2:      '#737068',
    text3:      '#ABA89F',
    keyColor:   '#2D2D2D',
    red:        '#8B3030',
    redBg:      '#F8EFEE',
    redBorder:  '#D4AFAC',
    amber:      '#7A5C1A',
    amberBg:    '#F8F5E8',
    amberBorder:'#D4C58A',
    subBg:      '#F0EEE9',
  }

  const fmtDate = d =>
    new Date(d).toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' })

  const suggestion = {
    'SA_Due':    '請確認 SA 文件進度，確保如期完成系統分析。',
    'UAT_Due':   '請協調 UAT 測試資源，確保如期完成驗收測試。',
    'Due 上線日': '上線日即將到來，請確認所有工項均已就緒。',
  }
  const overdueMsg = '已超過上線日，請立即確認現況並更新工單進度。'

  const TD = `font-family:${FONT};font-size:14px;color:${C.text1}`  // 通用 td 字型

  // ── 每張 Issue 卡片
  const renderCard = (a, isFirst) => {
    const isOD   = a.type === 'overdue'
    const barClr = isOD ? C.red   : C.amber
    const tagClr = isOD ? C.red   : C.amber
    const tagBg  = isOD ? C.redBg : C.amberBg
    const tagBdr = isOD ? C.redBorder : C.amberBorder
    const tagTxt = isOD
      ? `逾期 ${Math.abs(a.daysLeft)} 天`
      : (a.daysLeft === 0 ? '今天到期' : `還有 ${a.daysLeft} 天`)
    const hint    = isOD ? overdueMsg : (suggestion[a.fieldName] || '')
    // border-collapse:collapse → 靠 cell border 控制；首張不加 border-top（header 底線已夠）
    const topBdr  = isFirst ? '' : `border-top:1px solid ${C.border};`

    const subHtml = (a.openSubs || []).length > 0
      ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px">
           <tr><td bgcolor="${C.subBg}" style="background-color:${C.subBg};padding:7px 10px;font-size:12px;color:${C.text2};line-height:1.8;font-family:${FONT}">
             未關閉 sub-task：
             ${a.openSubs.map(st =>
               `<a href="${JIRA_BROWSE}${st.key}" style="color:${C.keyColor};font-weight:700;text-decoration:underline;font-family:${FONT}">${st.key}</a>`
             ).join(' &nbsp;·&nbsp; ')}
           </td></tr>
         </table>`
      : ''

    return `<tr>
      <td bgcolor="${C.bodyBg}" style="background-color:${C.bodyBg};padding:14px 18px;${topBdr}border-right:1px solid ${C.border};border-bottom:1px solid ${C.border};border-left:3px solid ${barClr}">

        <!-- Key + Tag + Date -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px">
          <tr>
            <td valign="middle" style="font-family:${FONT}">
              <a href="${JIRA_BROWSE}${a.key}" style="font-family:'Courier New',Courier,monospace;font-size:12px;font-weight:700;color:${C.keyColor};text-decoration:none;letter-spacing:0.5px">${a.key}</a>
              &nbsp;<span style="font-size:11px;font-weight:600;padding:2px 8px;color:${tagClr};border:1px solid ${tagBdr};font-family:${FONT}">${tagTxt}</span>
            </td>
            <td align="right" valign="middle" style="font-size:11px;color:${C.text3};white-space:nowrap;padding-left:12px;font-family:${FONT}">${a.fieldName}：${fmtDate(a.date)}</td>
          </tr>
        </table>

        <!-- Summary -->
        <p style="margin:0;font-size:14px;color:${C.text1};line-height:1.65;font-family:${FONT}">${a.summary}</p>

        <!-- Sub-tasks -->
        ${subHtml}

        <!-- Hint -->
        <p style="margin:10px 0 0;font-size:12px;color:${C.text2};line-height:1.6;font-family:${FONT}">${hint}</p>

      </td>
    </tr>`
  }

  // ── Section：border-collapse:collapse，全靠 cell border 控制→粗細一致
  const section = (title, subtitle, accentC, bgC, bdrC, items) =>
    items.length === 0 ? '' : `
      <tr><td style="padding-bottom:24px">
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">

          <!-- Section header：上右下=細線，左=粗色線 -->
          <tr>
            <td bgcolor="${bgC}" style="background-color:${bgC};padding:10px 16px;border-top:1px solid ${bdrC};border-right:1px solid ${bdrC};border-bottom:1px solid ${bdrC};border-left:3px solid ${accentC}">
              <span style="font-size:13px;font-weight:700;color:${accentC};font-family:${FONT}">${title}（${items.length}）</span>
              <br><span style="font-size:12px;color:${C.text2};font-family:${FONT}">${subtitle}</span>
            </td>
          </tr>

          <!-- Issue cards -->
          ${items.map((a, i) => renderCard(a, i === 0)).join('')}

        </table>
      </td></tr>`

  // ── 組合完整 HTML
  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>PM 工單每日提醒</title>
</head>
<body style="margin:0;padding:0;font-family:${FONT}" bgcolor="${C.outerBg}">

<!-- 外層置中 -->
<table width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.outerBg}" style="background-color:${C.outerBg}">
<tr><td align="center" style="padding:28px 16px">
<table width="620" cellpadding="0" cellspacing="0" style="max-width:620px;width:100%;border-collapse:collapse">

  <!-- ── HEADER ── -->
  <tr>
    <td bgcolor="${C.headerBg}" style="background-color:${C.headerBg};padding:22px 28px">
      <table width="100%" cellpadding="0" cellspacing="0"><tr>
        <td>
          <p style="margin:0;font-size:18px;font-weight:700;color:#FFFFFF;font-family:${FONT};letter-spacing:0.5px">PM 工單每日提醒</p>
          <p style="margin:5px 0 0;font-size:12px;color:rgba(255,255,255,0.75);font-family:${FONT};letter-spacing:0.3px">${dateStr}</p>
        </td>
        <td align="right" valign="middle">
          <span style="font-size:11px;color:rgba(255,255,255,0.95);border:1px solid rgba(255,255,255,0.5);padding:3px 10px;font-family:${FONT}">共 ${alerts.length} 項提醒</span>
        </td>
      </tr></table>
    </td>
  </tr>

  <!-- ── BODY ── -->
  <tr>
    <td bgcolor="${C.bodyBg}" style="background-color:${C.bodyBg};padding:28px 28px 8px;border:1px solid ${C.border};border-top:none">

      <!-- Greeting -->
      <p style="margin:0 0 24px;font-size:14px;color:${C.text1};line-height:1.75;font-family:${FONT}">
        Hi <strong>${firstName}</strong>，以下是今日需要關注的工單，請優先處理逾期項目。
      </p>

      <table width="100%" cellpadding="0" cellspacing="0">
        ${section('逾期警示', '已超過上線日期，請立即確認並更新工單', C.red,   C.redBg,   C.redBorder,   overdue)}
        ${section('即將到期', '距離截止日 2 天以內，請提前確認進度',  C.amber, C.amberBg, C.amberBorder, upcoming)}

        <!-- Footer -->
        <tr><td style="padding:16px 0 8px;border-top:1px solid ${C.border};text-align:center;font-size:11px;color:${C.text3};line-height:2;font-family:Helvetica,Arial,sans-serif">
          此信由 PM Portal 自動發送 &nbsp;·&nbsp;
          <a href="${JIRA_BASE}" style="color:${C.text2};text-decoration:underline">前往 Jira</a>
          ${TEST_MODE ? `<br><span style="color:${C.amber}">[ 測試模式：信件已重導向至 Vera_Chang@asus.com ]</span>` : ''}
        </td></tr>
      </table>

    </td>
  </tr>

</table>
</td></tr>
</table>

</body></html>`
}
