// NxtStepOS Sequences API
// GET  — returns all sequences + active enrollment count
// POST — enrolls a lead in a sequence

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SB = () => ({
  'apikey':        SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type':  'application/json',
});

export default async function handler(req, res) {

  // GET — list sequences and all enrollments
  if (req.method === 'GET') {
    const [seqRes, enrollRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/sequences?select=*&order=created_at.asc`, { headers: SB() }),
      fetch(`${SUPABASE_URL}/rest/v1/lead_sequences?select=*&order=created_at.desc`, { headers: SB() }),
    ]);

    const sequences   = await seqRes.json();
    const enrollments = await enrollRes.json();

    return res.status(200).json({ sequences, enrollments });
  }

  // POST — enroll a lead
  if (req.method === 'POST') {
    const { lead_email, lead_name, lead_insurance_type, sequence_id } = req.body;

    if (!lead_email || !sequence_id) {
      return res.status(400).json({ error: 'Missing lead_email or sequence_id' });
    }

    // Check not already active in this sequence
    const existRes = await fetch(
      `${SUPABASE_URL}/rest/v1/lead_sequences?lead_email=eq.${encodeURIComponent(lead_email)}&sequence_id=eq.${sequence_id}&status=eq.active&select=id`,
      { headers: SB() }
    );
    const existing = await existRes.json();
    if (existing && existing.length > 0) {
      return res.status(409).json({ error: 'Lead already active in this sequence' });
    }

    // Get step 1 delay
    const stepRes = await fetch(
      `${SUPABASE_URL}/rest/v1/sequence_steps?sequence_id=eq.${sequence_id}&step_number=eq.1&select=delay_days`,
      { headers: SB() }
    );
    const steps = await stepRes.json();
    const delay = steps?.[0]?.delay_days ?? 1;

    const nextSendAt = new Date();
    nextSendAt.setDate(nextSendAt.getDate() + delay);

    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/lead_sequences`, {
      method: 'POST',
      headers: { ...SB(), 'Prefer': 'return=representation' },
      body: JSON.stringify({
        lead_email,
        lead_name:           lead_name || '',
        lead_insurance_type: lead_insurance_type || '',
        sequence_id,
        current_step:  1,
        status:        'active',
        next_send_at:  nextSendAt.toISOString(),
      }),
    });

    const inserted = await insertRes.json();
    return res.status(200).json({ success: true, enrollment: Array.isArray(inserted) ? inserted[0] : inserted });
  }

  // PATCH — stop a sequence for a lead
  if (req.method === 'PATCH') {
    const { id, status } = req.body;
    if (!id) return res.status(400).json({ error: 'Missing id' });

    await fetch(`${SUPABASE_URL}/rest/v1/lead_sequences?id=eq.${id}`, {
      method: 'PATCH', headers: SB(),
      body: JSON.stringify({ status: status || 'stopped' }),
    });

    return res.status(200).json({ success: true });
  }

  // GET with ?run=1 — trigger sequence runner
  if (req.method === 'GET' && req.query.run === '1') {
    const now = new Date().toISOString();
    let sent = 0, failed = 0, completed = 0;
    const dueRes = await fetch(
      `${SUPABASE_URL}/rest/v1/lead_sequences?status=eq.active&next_send_at=lte.${encodeURIComponent(now)}&select=*`,
      { headers: SB() }
    );
    const due = await dueRes.json();
    if (!due || due.length === 0) return res.status(200).json({ sent: 0, message: 'No emails due' });

    function personalize(text, lead) {
      return text
        .replace(/\{\{name\}\}/g, lead.lead_name?.split(' ')[0] || 'there')
        .replace(/\{\{insurance_type\}\}/g, lead.lead_insurance_type || 'insurance');
    }

    for (const enrollment of due) {
      try {
        const stepRes = await fetch(
          `${SUPABASE_URL}/rest/v1/sequence_steps?sequence_id=eq.${enrollment.sequence_id}&step_number=eq.${enrollment.current_step}&select=*`,
          { headers: SB() }
        );
        const steps = await stepRes.json();
        if (!steps || steps.length === 0) {
          await fetch(`${SUPABASE_URL}/rest/v1/lead_sequences?id=eq.${enrollment.id}`, {
            method: 'PATCH', headers: SB(), body: JSON.stringify({ status: 'completed' }),
          });
          completed++; continue;
        }
        const step = steps[0];
        const sendRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.RESEND_API_KEY}` },
          body: JSON.stringify({ from: 'Bryan <hello@nxtstepos.com>', to: enrollment.lead_email, subject: personalize(step.subject, enrollment), text: personalize(step.body, enrollment) }),
        });
        if (!sendRes.ok) { failed++; continue; }
        const nextStepRes = await fetch(
          `${SUPABASE_URL}/rest/v1/sequence_steps?sequence_id=eq.${enrollment.sequence_id}&step_number=eq.${enrollment.current_step + 1}&select=*`,
          { headers: SB() }
        );
        const nextSteps = await nextStepRes.json();
        if (nextSteps && nextSteps.length > 0) {
          const nextSendAt = new Date(); nextSendAt.setDate(nextSendAt.getDate() + nextSteps[0].delay_days);
          await fetch(`${SUPABASE_URL}/rest/v1/lead_sequences?id=eq.${enrollment.id}`, {
            method: 'PATCH', headers: SB(),
            body: JSON.stringify({ current_step: enrollment.current_step + 1, next_send_at: nextSendAt.toISOString(), last_sent_at: now }),
          });
        } else {
          await fetch(`${SUPABASE_URL}/rest/v1/lead_sequences?id=eq.${enrollment.id}`, {
            method: 'PATCH', headers: SB(), body: JSON.stringify({ status: 'completed', last_sent_at: now }),
          });
          completed++;
        }
        sent++;
      } catch (err) { failed++; }
    }
    return res.status(200).json({ sent, failed, completed });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
