async function fetchConfluencePages() {
  const confluenceDomain = 'rakeshright.atlassian.net';
  const email = 'rakeshright@gmail.com';
  const apiToken = process.env.CONFLUENCE_API_TOKEN;
  const pageId = '491521';

  const auth = Buffer.from(`${email}:${apiToken}`).toString('base64');

  const response = await fetch(
    `https://${confluenceDomain}/wiki/rest/api/content/${pageId}/child/attachment?expand=version`,
    {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json'
      }
    }
  );

  if (!response.ok) {
    throw new Error(`Confluence API error: ${response.status}`);
  }

  const data = await response.json();
  
  // Get the page content itself
  const pageResponse = await fetch(
    `https://${confluenceDomain}/wiki/rest/api/content/${pageId}?expand=body.storage,children.page.body.storage`,
    {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json'
      }
    }
  );

  const pageData = await pageResponse.json();
  
  // Extract text from page body (strip HTML tags)
  const stripHtml = (html) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  
  let policyText = `Page: ${pageData.title}\n${stripHtml(pageData.body.storage.value)}\n\n`;

  // Also get child pages if any
  if (pageData.children && pageData.children.page && pageData.children.page.results) {
    for (const child of pageData.children.page.results) {
      if (child.body && child.body.storage) {
        policyText += `Page: ${child.title}\n${stripHtml(child.body.storage.value)}\n\n`;
      }
    }
  }

  return policyText;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { question, history } = req.body;

  if (!question) {
    return res.status(400).json({ error: 'Question is required' });
  }

  let policyText = '';
  try {
    policyText = await fetchConfluencePages();
  } catch (err) {
    console.error('Confluence fetch error:', err);
    return res.status(500).json({ error: 'Failed to fetch policies from Confluence: ' + err.message });
  }

  const systemPrompt = `You are a GRC (Governance, Risk & Compliance) policy assistant for Rakesh Test Inc.
You have access to the following internal policy documents fetched live from Confluence.
Answer questions based strictly on these documents. Be concise and cite specific sections when relevant.
If something is not covered, say so clearly.

POLICY DOCUMENTS:
${policyText}`;

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
        model: 'claude-haiku-4-5-20251001',
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
