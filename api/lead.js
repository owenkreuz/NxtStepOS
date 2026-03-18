// NxtStepOS Lead Capture API v2 — nxtstepos.com
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, agency, email, phone, type } = req.body;

  if (!name || !agency || !email || !phone || !type) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const lead = {
    name,
    agency,
    email,
    phone,
    type,
    submitted_at: new Date().toISOString()
  };

  console.log('NEW LEAD:', JSON.stringify(lead, null, 2));

  const resendKey = process.env.RESEND_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  // Get first name only
  const firstName = name.split(' ')[0];

  try {
    // Step 1 — Generate personalized welcome email with AI
    let welcomeBody = `Hi ${firstName},\n\nWelcome to NxtStepOS! Your 30-day free trial has officially started.\n\nWe'll be reaching out within 24 hours to schedule your personal onboarding call. In just 30 minutes we'll have your agency fully set up and running on autopilot.\n\nGet ready — your agency is about to change.\n\nThe NxtStepOS Team`;

    if (anthropicKey) {
      try {
        const aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': anthropicKey,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 400,
            messages: [{
              role: 'user',
              content: `Write a short warm professional welcome email for a new NxtStepOS trial signup. Their name is ${firstName}, they run ${agency}, a ${type} insurance agency. The email should welcome them by first name, confirm their 30-day free trial has started, tell them we will reach out within 24 hours to schedule their 30-minute onboarding call, and build excitement about what NxtStepOS will do for their agency. 3-4 short paragraphs. Sign off as The NxtStepOS Team. Plain text only, no HTML.`
            }]
          })
        });
        const aiData = await aiResponse.json();
        if (aiData.content?.[0]?.text) {
          welcomeBody = aiData.content[0].text;
        }
      } catch (aiErr) {
        console.error('AI email generation failed, using default:', aiErr);
      }
    }

    if (resendKey) {
      // Step 2 — Send welcome email to the lead
      const welcomeResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${resendKey}`
        },
        body: JSON.stringify({
          from: 'NxtStepOS <hello@nxtstepos.com>',
          to: email,
          subject: `Welcome to NxtStepOS, ${firstName} — Your Trial Has Started`,
          text: welcomeBody
        })
      });
      const welcomeData = await welcomeResponse.json();
      console.log('WELCOME EMAIL RESPONSE:', JSON.stringify(welcomeData));

      // Step 3 — Send notification email to you (the owner)
      const notifyResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${resendKey}`
        },
        body: JSON.stringify({
          from: 'NxtStepOS Leads <hello@nxtstepos.com>',
          to: 'owenkreuzberger@gmail.com',
          subject: `New Trial Signup — ${agency}`,
          text: `NEW LEAD ALERT\n\nName: ${name}\nAgency: ${agency}\nEmail: ${email}\nPhone: ${phone}\nInsurance Type: ${type}\nSubmitted: ${lead.submitted_at}\n\nFollow up within 24 hours to schedule their onboarding call.`
        })
      });
      const notifyData = await notifyResponse.json();
      console.log('NOTIFY EMAIL RESPONSE:', JSON.stringify(notifyData));
    } else {
      console.log('NO RESEND KEY FOUND');
    }

    return res.status(200).json({ success: true });

  } catch (error) {
    console.error('Lead capture error:', error);
    return res.status(200).json({ success: true });
  }
}
