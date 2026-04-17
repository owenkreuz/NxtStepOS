// NxtStepOS Sequence Runner — called daily by Vercel cron at 9am EST
// Sends follow-up emails to leads that are due in active sequences

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SB = () => ({
  'apikey':        SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type':  'application/json',
});

function personalize(text, lead) {
  const name          = lead.lead_name?.split(' ')[0] || 'there';
  const insuranceType = lead.lead_insurance_type || 'insurance';
  return text
    .replace(/\{\{name\}\}/g, name)
    .replace(/\{\{insurance_type\}\}/g, insuranceType);
}

export default async function handler(req, res) {
  // Allow Vercel cron (GET) or manual trigger (POST)
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const now = new Date().toISOString();

  try {
    // Fetch all active enrollments that are due
    const dueRes = await fetch(
      `${SUPABASE_URL}/rest/v1/lead_sequences?status=eq.active&next_send_at=lte.${encodeURIComponent(now)}&select=*`,
      { headers: SB() }
    );
    const due = await dueRes.json();

    if (!due || due.length === 0) {
      return res.status(200).json({ sent: 0, message: 'No emails due' });
    }

    let sent = 0, failed = 0, completed = 0;

    for (const enrollment of due) {
      try {
        // Get the current step content
        const stepRes = await fetch(
          `${SUPABASE_URL}/rest/v1/sequence_steps?sequence_id=eq.${enrollment.sequence_id}&step_number=eq.${enrollment.current_step}&select=*`,
          { headers: SB() }
        );
        const steps = await stepRes.json();
        if (!steps || steps.length === 0) {
          // Step not found — complete the sequence
          await fetch(`${SUPABASE_URL}/rest/v1/lead_sequences?id=eq.${enrollment.id}`, {
            method: 'PATCH', headers: SB(),
            body: JSON.stringify({ status: 'completed' }),
          });
          completed++;
          continue;
        }

        const step = steps[0];
        const subject = personalize(step.subject, enrollment);
        const body    = personalize(step.body, enrollment);

        // Send via Resend
        const sendRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          },
          body: JSON.stringify({
            from:    'Bryan <hello@nxtstepos.com>',
            to:      enrollment.lead_email,
            subject,
            text:    body,
          }),
        });

        if (!sendRes.ok) {
          const err = await sendRes.json();
          console.error(`Failed to send to ${enrollment.lead_email}:`, err);
          failed++;
          continue;
        }

        // Find next step
        const nextStepRes = await fetch(
          `${SUPABASE_URL}/rest/v1/sequence_steps?sequence_id=eq.${enrollment.sequence_id}&step_number=eq.${enrollment.current_step + 1}&select=*`,
          { headers: SB() }
        );
        const nextSteps = await nextStepRes.json();

        if (nextSteps && nextSteps.length > 0) {
          // Schedule next step
          const nextSendAt = new Date();
          nextSendAt.setDate(nextSendAt.getDate() + nextSteps[0].delay_days);
          await fetch(`${SUPABASE_URL}/rest/v1/lead_sequences?id=eq.${enrollment.id}`, {
            method: 'PATCH', headers: SB(),
            body: JSON.stringify({
              current_step:  enrollment.current_step + 1,
              next_send_at:  nextSendAt.toISOString(),
              last_sent_at:  now,
            }),
          });
        } else {
          // No more steps — sequence complete
          await fetch(`${SUPABASE_URL}/rest/v1/lead_sequences?id=eq.${enrollment.id}`, {
            method: 'PATCH', headers: SB(),
            body: JSON.stringify({ status: 'completed', last_sent_at: now }),
          });
          completed++;
        }

        sent++;
      } catch (err) {
        console.error(`Error processing enrollment ${enrollment.id}:`, err);
        failed++;
      }
    }

    return res.status(200).json({ sent, failed, completed, total: due.length });

  } catch (err) {
    console.error('Sequence runner error:', err);
    return res.status(500).json({ error: err.message });
  }
}
