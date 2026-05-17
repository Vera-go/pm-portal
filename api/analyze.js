// v4
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { mode, issueKey, summary, description, attachment, comment } = req.body;

    const prompts = {
      bug_reply:
        '你是一位資深技術支援工程師，協助 PM 回覆內部員工的 Bug 回報。\n' +
        '工單號：' + issueKey + '\nSummary：' + summary + '\nDescription：' + description + '\n\n' +
        '直接說明可能的原因（2-3個，簡潔條列），建議解決步驟，說明正在調查。不需要問候語或感謝語。繁體中文，語氣簡潔專業。',

      req_check:
        '你是一位資深 PM，審查需求工單完整性。\n' +
        '工單號：' + issueKey + '\nSummary：' + summary + '\nDescription：' + description + '\n\n' +
        '請產出：\n1. **缺少的資訊**：不足或需補充的項目\n2. **需要釐清的問題**：與 stakeholder 確認的問題\n3. **潛在風險**：影響開發或上線的風險\n繁體中文條列，簡潔清楚。',

      req_impl:
        '你是一位資深專業的專案經理 (PM)，你的工作是根據使用者提供的需求，統整並撰寫商業分析 (BA) 文件。\n' +
        '請詳細分析以下 Jira Issue 的資料，包括 Summary、Description、Attachment 內容，以及所有 Comment。你的目標是從這些資料中提取關鍵資訊，並將其整理成結構化的 BA 文件。\n\n' +
        'Requirment資料如下：\n' +
        'Summary: ' + summary + '\n' +
        'Description: ' + description + '\n' +
        'Attachment 內容: ' + (attachment || '無') + ' (請分析附件內容，並將重要資訊納入考量)\n' +
        'Comment: ' + (comment || '無') + ' (請分析所有評論，並將重要資訊納入考量)\n\n' +
        '**請分別產出以下兩點BA資訊，不需回覆對話，直接產出BA結果，除[需求原因]及[需求描述]的資訊外，不需提供其他資訊，確保Jira description可呈現正確html格式**\n\n' +
        '[需求原因]\n' +
        '**請在此簡述需求原因**\n\n' +
        '[需求描述]\n' +
        '**請在此填入需求描述,請以列1.2.3.4.的方式描述**\n\n' +
        '請以清晰、簡潔、專業的語言撰寫 BA 文件內容。'
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
