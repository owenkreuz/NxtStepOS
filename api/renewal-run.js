// NxtStepOS Renewal Automation — called daily by Vercel cron at 10am EST
// Sends renewal reminder emails to clients 90, 60, and 30 days before their policy renews

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SB = () => ({
  'apikey':        SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type':  'application/json',
});

const MILESTONES = [90, 60, 30];

const EMAIL_TEMPLATES = {
  90: {
    subject: 'Your {{policy_type}} policy renews in 90 days — let\'s review your coverage',
    body: `Hi {{first_name}},

I wanted to give you an early heads-up that your {{policy_type}} policy is coming up for renewal in about 90 days.

This is actually the perfect time to review your coverage — we have plenty of time to shop the market, make any adjustments, and make sure you're getting the best rate possible.

A lot can change in a year. If your business has grown, added employees, or changed operations, your coverage needs may have changed too.

I'll reach out closer to your renewal date as well, but if you'd like to get started now, just reply to this email.

Best,
Bryan`,
  },
  60: {
    subject: 'Your {{policy_type}} policy renews in 60 days — time to start shopping',
    body: `Hi {{first_name}},

Your {{policy_type}} policy is coming up for renewal in 60 days, so I wanted to check in and make sure we're on track.

Now is a great time to:
- Review your current coverage limits
- See if anything has changed in your business this year
- Shop other carriers to make sure you're getting the best rate

I'm happy to put together some options for you at no cost. Just reply and we'll get started.

Best,
Bryan`,
  },
  30: {
    subject: 'Action needed — your {{policy_type}} policy renews in 30 days',
    body: `Hi {{first_name}},

Your {{policy_type}} policy renews in 30 days and I want to make sure everything is taken care of on your end.

If you'd like to make any changes, switch carriers, or simply confirm you're renewing as-is, please reply to this email so we can get everything processed in time.

If I don't hear from you, your policy will renew at its current terms.

As always, I'm here if you have any questions.

Best,
Bryan`,
  },
};

function personalize(text, client) {
  return text
    .replace(/\{\{first_name\}\}/g, client.first_name || 'there')
    .replace(/\{\{last_name\}\}/g,  client.last_name  || '')
    .replace(/\{\{policy_type\}\}/g, client.policy_type || 'insurance');
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const today = new Date(); today.setHours(0, 0, 0, 0);
  let sent = 0, skipped = 0, failed = 0;

  try {
    // Fetch all active clients with a renewal date and email
    const clientsRes = await fetch(
      `${SUPABASE_URL}/rest/v1/clients?select=*&status=eq.active&email=neq.null`,
      { headers: SB() }
    );
    const clients = await clientsRes.json();

    if (!clients || clients.length === 0) {
      return res.status(200).json({ sent: 0, message: 'No active clients with email found' });
    }

    for (const client of clients) {
      if (!client.renewal_date || !client.email) { skipped++; continue; }

      const renewal = new Date(client.renewal_date); renewal.setHours(0, 0, 0, 0);
      const daysUntil = Math.round((renewal - today) / (1000 * 60 * 60 * 24));

      // Check if this client hits any milestone today (±1 day window)
      const milestone = MILESTONES.find(m => Math.abs(daysUntil - m) <= 1);
      if (!milestone) { skipped++; continue; }

      // Check if we already sent this milestone reminder
      const trackRes = await fetch(
        `${SUPABASE_URL}/rest/v1/renewal_reminders?client_id=eq.${client.id}&days_before=eq.${milestone}&select=id&limit=1`,
        { headers: SB() }
      );
      const existing = await trackRes.json();
      if (existing && existing.length > 0) { skipped++; continue; }

      // Build and send email
      const template = EMAIL_TEMPLATES[milestone];
      const subject  = personalize(template.subject, client);
      const body     = personalize(template.body, client);

      const sendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from:    'Bryan <hello@nxtstepos.com>',
          to:      client.email,
          subject,
          text:    body,
        }),
      });

      if (!sendRes.ok) {
        console.error(`Failed to send renewal reminder to ${client.email}`);
        failed++;
        continue;
      }

      // Log it so we don't send again
      await fetch(`${SUPABASE_URL}/rest/v1/renewal_reminders`, {
        method: 'POST',
        headers: { ...SB(), 'Prefer': 'return=minimal' },
        body: JSON.stringify({
          client_id:   client.id,
          client_name: `${client.first_name} ${client.last_name}`,
          client_email: client.email,
          policy_type: client.policy_type,
          renewal_date: client.renewal_date,
          days_before: milestone,
        }),
      });

      console.log(`Sent ${milestone}-day renewal reminder to ${client.email}`);
      sent++;
    }

    return res.status(200).json({ sent, skipped, failed, total: clients.length });

  } catch (err) {
    console.error('Renewal runner error:', err);
    return res.status(500).json({ error: err.message });
  }
}
