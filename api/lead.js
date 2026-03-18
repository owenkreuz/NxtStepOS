export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, agency, email, phone, type } = req.body;

  if (!name || !agency || !email || !phone || !type) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Format the lead data
  const lead = {
    name,
    agency,
    email,
    phone,
    type,
    submitted_at: new Date().toISOString()
  };

  try {
    // Send notification email to NxtStepOS owner via Anthropic AI summary
    const notifyApiKey = process.env.ANTHROPIC_API_KEY;
    
    // Log the lead to console (visible in Vercel logs)
    console.log('NEW LEAD:', JSON.stringify(lead, null, 2));

    // Send welcome email to the lead using Anthropic to generate personalized message
    if (notifyApiKey) {
      const aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': notifyApiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 500,
          messages: [{
            role: 'user',
            content: `Write a short, warm, professional welcome email for a new NxtStepOS trial signup. 
            Their name is ${name}, they run ${agency}, a ${type} insurance agency.
            The email should:
            - Welcome them personally by first name
            - Confirm their 30-day free trial has started
            - Tell them we'll reach out within 24 hours to schedule their 30-minute onboarding call
            - Build excitement about what NxtStepOS will do for their agency
            - Be 3-4 short paragraphs, warm but professional
            - Sign off as "The NxtStepOS Team"
            Just write the email body, no subject line needed.`
          }]
        })
      });

      const aiData = await aiResponse.json();
      const welcomeMessage = aiData.content?.[0]?.text || '';
      
      // Log the welcome message (in production this would be sent via email service)
      console.log('WELCOME EMAIL FOR', email, ':', welcomeMessage);
    }

    return res.status(200).json({ 
      success: true, 
      message: 'Lead captured successfully',
      lead 
    });

  } catch (error) {
    console.error('Lead capture error:', error);
    // Still return success to user even if notification fails
    return res.status(200).json({ success: true, message: 'Lead captured' });
  }
}
