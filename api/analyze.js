 // v2
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { mode, issueKey, summary, description } = req.body;

    const prompts = {
      checklist:
        '你是一位資深 PM 助理。以下是一個 Jira 工單：\n\n' +
        '工單號：' + issueKey + '\nSummary：' + summary + '\nDescription：' + description + '\n\n' +
        '請產出：\n1. **需要確認的資訊 Checklist**：列出描述中不足或需要 User 補充的項目\n' +
        '2. **潛在問題**：列出 PM 需要特別注意的風險\n請用繁體中文條列。',
      summary:
        '你是一位資深 PM 助理。以下是一個 Jira 工單：\n\n' +
        '工單號：' + issueKey + '\nSummary：' + summary + '\nDescription：' + description + '\n\n' +
        '請用3-5句話寫給主管看的摘要，包含問題、影響範圍、狀態。繁體中文，專業簡潔。'
    };

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
