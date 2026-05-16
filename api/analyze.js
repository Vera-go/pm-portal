// v3
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { mode, issueKey, summary, description } = req.body;

    const prompts = {
bug_reply:
  '你是一位資深技術支援工程師，正在協助 PM 回覆內部員工的 Bug 回報。\n\n' +
  '以下是 Jira 工單內容：\n' +
  '工單號：' + issueKey + '\n' +
  'Summary：' + summary + '\n' +
  'Description：' + description + '\n\n' +
  '請產出一段可以直接複製貼到 Jira comment 的回覆。\n' +
  '要求：\n' +
  '1. 直接說明可能的原因（列出2-3個最可能的原因，簡潔條列）\n' +
  '2. 建議可以先嘗試的解決步驟\n' +
  '3. 說明正在調查並會更新進度\n' +
  '不需要任何問候語、感謝語、客套話，直接進入重點。\n' +
  '請用繁體中文，語氣簡潔專業。',

      req_check:
        '你是一位資深 PM，正在審查需求工單的完整性。\n\n' +
        '以下是 Jira 需求工單內容：\n' +
        '工單號：' + issueKey + '\n' +
        'Summary：' + summary + '\n' +
        'Description：' + description + '\n\n' +
        '請針對這個需求進行完整性檢查，產出：\n' +
        '1. **缺少的資訊**：列出需求描述中不足或需要補充的項目\n' +
        '2. **需要釐清的問題**：列出需要與 stakeholder 確認的問題\n' +
        '3. **潛在風險**：列出可能影響開發或上線的風險\n\n' +
        '請用繁體中文條列，每點簡潔清楚。',

      req_impl:
        '你是一位資深技術 PM，擅長將需求轉換為可執行的技術方向。\n\n' +
        '以下是 Jira 需求工單內容：\n' +
        '工單號：' + issueKey + '\n' +
        'Summary：' + summary + '\n' +
        'Description：' + description + '\n\n' +
        '請針對這個需求產出建議實作方向，包含：\n' +
        '1. **建議拆分的子任務**：將需求拆成可執行的開發任務\n' +
        '2. **技術考量點**：需要特別注意的技術難點或依賴項目\n' +
        '3. **建議驗收條件**：定義 Done 的標準，方便 QA 測試\n\n' +
        '請用繁體中文條列，實用且具體。'
    };

    if (!prompts[mode]) return res.status(400).json({ error: 'Invalid mode' });

    const n8nRes = await fetch('https://casper3.app.n8n.cloud/webhook/jira-analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: prompts[mode] })
    });

    if (!n8nRes.ok) throw new Error('n8n error: ' + n8nRes.status);
    const result = await n8nRes.json();
    res.status(200).json({ text: result.text || result.output || JSON.stringify(result) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
