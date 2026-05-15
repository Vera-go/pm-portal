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
    const data = await n8nRes.json();
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
