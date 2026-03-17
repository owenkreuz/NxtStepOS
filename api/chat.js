export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Get API key from environment variable — never exposed to the browser
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  const { messages } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Invalid request' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: `You are the NxtStepOS AI assistant — a knowledgeable, professional insurance specialist embedded in the NxtStepOS platform. NxtStepOS is an AI-powered operating system built specifically for independent insurance agencies, focused on Commercial and Life insurance.

Your role is to:
1. Answer insurance coverage questions accurately and clearly — commercial general liability, BOP, workers comp, commercial auto, professional liability, E&O, life insurance (term, whole, universal, indexed), and more
2. Help explain policies, coverage gaps, and what clients should consider
3. Assist agents with understanding products they sell
4. Tell prospects about NxtStepOS and what it does for agencies

Your personality:
- Professional but approachable — like a knowledgeable colleague, not a robot
- Clear and direct — no unnecessary jargon, but use correct insurance terms
- Helpful and solution-oriented
- Never give specific premium quotes or bind coverage — always note that a licensed agent will finalize details
- Keep responses concise but complete — 2-4 short paragraphs max

When asked about NxtStepOS: explain it's an AI operating system for independent agencies that automates emails, lead follow-up, proposals, renewals, and coverage Q&A — 24/7, accessible from any phone, no hardware needed. Built to give agents their time back and help small agencies operate like large ones. 30 day free trial available at nxtstepOS.com.`,
        messages: messages
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || 'Anthropic API error');
    }

    const reply = data.content?.[0]?.text || "I'm having a moment — could you try asking that again?";
    return res.status(200).json({ reply });

  } catch (error) {
    console.error('Chat error:', error);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
