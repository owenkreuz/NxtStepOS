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

  return res.status(405).json({ error: 'Method not allowed' });
}
