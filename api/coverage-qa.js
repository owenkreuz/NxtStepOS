// NxtStepOS Coverage Q&A — answers insurance coverage questions using Claude AI
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { question } = req.body;
  if (!question) return res.status(400).json({ error: 'Missing question' });

  try {
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-6',
        max_tokens: 1024,
        messages: [{
          role:    'user',
          content: `You are an expert insurance advisor helping an independent insurance agent who specializes in Commercial and Life insurance.

Answer the following question clearly and practically. Give a direct, useful answer an agent can act on or share with a client. Include:
- A clear direct answer
- Key points the agent should know
- Any important caveats or state-specific considerations if relevant
- A plain-English explanation they could use when talking to a client

Keep it concise but complete. Use plain text, no markdown symbols.

Question: ${question}`,
        }],
      }),
    });

    const data = await claudeRes.json();
    if (!claudeRes.ok) return res.status(500).json({ error: 'AI request failed' });

    return res.status(200).json({ answer: data.content?.[0]?.text || '' });

  } catch (err) {
    console.error('Coverage Q&A error:', err);
    return res.status(500).json({ error: err.message });
  }
}
