// Marks an email as dismissed in Supabase
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { emailId } = req.body;
  if (!emailId) return res.status(400).json({ error: 'Missing emailId' });

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  await fetch(`${supabaseUrl}/rest/v1/emails?id=eq.${emailId}`, {
    method: 'PATCH',
    headers: {
      'apikey':        supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({ status: 'dismissed' }),
  });

  return res.status(200).json({ success: true });
}
