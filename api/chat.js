module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { question, policyText, history } = req.body;

  if (!question) {
    return res.status(400).json({ error: 'Question is required' });
  }

  const systemPrompt = policyText
    ? `You are a GRC (Governance, Risk & Compliance) policy assistant. 
Answer questions based on the following internal policy document provided by the user.
Be concise, accurate, and cite specific sections when relevant.
If something is not covered in the policy, say so clearly rather than guessing.

POLICY DOCUMENT:
${policyText}`
    : `You are a GRC policy assistant. No policy document provided. Answer general GRC questions and encourage the user to paste a policy document.`;

  const messages = [
    ...(history || []),
    { role: 'user', content: question }
  ];

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 1024,
        system: systemPrompt,
        messages: messages
      })
    });

    if (!response.ok) {
      const error = await response.json();
      return res.status(response.status).json({ error: error.error?.message || 'API error' });
    }

    const data = await response.json();
    const reply = data.content?.[0]?.text || 'No response received.';
    return res.status(200).json({ reply });

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: error.message || 'Failed to get response' });
  }
}
