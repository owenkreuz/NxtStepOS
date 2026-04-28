// NxtStepOS Proposal Generator — uses Claude AI to write a full insurance proposal
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    client_name,
    business_name,
    business_type,
    coverage_types,
    coverage_notes,
    agent_name,
  } = req.body;

  if (!client_name || !coverage_types) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

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
        max_tokens: 2048,
        messages: [{
          role:    'user',
          content: `You are a professional insurance agent writing a formal insurance proposal. Write a complete, polished proposal using the details below.

Client Name: ${client_name}
Business Name: ${business_name || 'N/A'}
Business Type: ${business_type || 'N/A'}
Coverage Requested: ${coverage_types}
Additional Notes: ${coverage_notes || 'None'}
Agent Name: ${agent_name || 'Bryan'}

Write the full proposal in plain text with clear sections:
1. Cover / Introduction (address the client by name, thank them for the opportunity)
2. Understanding Your Needs (summarize their business and coverage needs)
3. Proposed Coverage (detail each coverage type with recommended limits and why)
4. Why Work With Us (2-3 bullet points about the agency's value)
5. Next Steps (clear call to action)
6. Signature line for the agent

Make it professional, warm, and specific to their industry. Plain text only — no markdown, no asterisks, no bullet symbols other than dashes.`,
        }],
      }),
    });

    const data = await claudeRes.json();
    if (!claudeRes.ok) {
      console.error('Claude error:', data);
      return res.status(500).json({ error: 'AI generation failed' });
    }

    const proposal = data.content?.[0]?.text || '';
    return res.status(200).json({ proposal });

  } catch (err) {
    console.error('Proposal generation error:', err);
    return res.status(500).json({ error: err.message });
  }
}
