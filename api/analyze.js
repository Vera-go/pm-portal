export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { mode, issueKey, summary, description } = req.body;
    if (!mode || !summary) return res.status(400).json({ error: 'mode and summary are required' });

    const prompts = {
      checklist:
        '你是一位資深 PM 助理。以下是一個 Jira 工單的內容：\n\n' +
        '工單號：' + issueKey + '\nSummary：' + summary + '\nDescription：' + description + '\n\n' +
        '請幫我分析這個工單，產出：\n' +
        '1. **需要確認的資訊 Checklist**：列出目前描述中不足或需要 User 補充的資訊項目\n' +
        '2. **潛在問題**：列出你認為需要 PM 特別注意的風險或問題點\n\n' +
        '請用繁體中文回覆，條列清楚。',
      summary:
        '你是一位資深 PM 助理。以下是一個 Jira 工單的內容：\n\n' +
        '工單號：' + issueKey + '\nSummary：' + summary + '\nDescription：' + description + '\n\n' +
        '請幫我產出一段給主管看的簡短摘要（3-5句話），包含：問題描述、影響範圍、目前狀態。\n' +
        '請用繁體中文回覆，語氣專業簡潔。'
    };

    if (!prompts[mode]) return res.status(400).json({ error: 'Invalid mode' });

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompts[mode] }]
      })
    });

    if (!claudeRes.ok) {
      const err = await claudeRes.text();
      throw new Error('Claude API error: ' + err);
    }

    const result = await claudeRes.json();
    const text = result.content?.[0]?.text || '無法取得回應';
    res.status(200).json({ text });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
