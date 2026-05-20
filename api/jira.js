export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { issueKey } = req.body;
    if (!issueKey) return res.status(400).json({ error: 'issueKey is required' });

    const n8nRes = await fetch('https://casper3.app.n8n.cloud/webhook/jira-query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ issueKey })
    });

    if (!n8nRes.ok) throw new Error('n8n responded with ' + n8nRes.status);
    const raw = await n8nRes.json();

    // 相容 Simplify 開/關兩種結構，統一回傳扁平格式
    const f = raw.fields || {};
    const normalized = {
      key:         raw.key         || issueKey,
      summary:     raw.summary     || f.summary     || '',
      description: raw.description || f.description || '',
      status:      raw.status      || (f.status && f.status.name)       || '',
      assignee:    raw.assignee    || (f.assignee && f.assignee.displayName) || '',
      priority:    raw.priority    || (f.priority && f.priority.name)   || '',
      issuetype:   raw.issuetype   || (f.issuetype && f.issuetype.name) || '',
      attachment:  raw.attachment  || f.attachment  || [],
      comment:     raw.comment     || f.comment     || { comments: [] },
    };

    res.status(200).json(normalized);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
