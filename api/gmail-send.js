// Sends a reply via Gmail API and updates email status in Supabase
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SUPABASE_HEADERS = () => ({
  'apikey':        SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type':  'application/json',
});

async function getAccessToken() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/gmail_tokens?select=*&order=updated_at.desc&limit=1`,
    { headers: SUPABASE_HEADERS() }
  );
  const rows = await res.json();
  if (!rows || rows.length === 0) return null;
  const row = rows[0];

  if (new Date(row.token_expiry) <= new Date(Date.now() + 120000)) {
    const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     process.env.GMAIL_CLIENT_ID,
        client_secret: process.env.GMAIL_CLIENT_SECRET,
        refresh_token: row.refresh_token,
        grant_type:    'refresh_token',
      }),
    });
    const refreshed = await refreshRes.json();
    if (!refreshRes.ok) return null;

    const expiry = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
    await fetch(`${SUPABASE_URL}/rest/v1/gmail_tokens?email=eq.${encodeURIComponent(row.email)}`, {
      method: 'PATCH',
      headers: SUPABASE_HEADERS(),
      body: JSON.stringify({ access_token: refreshed.access_token, token_expiry: expiry, updated_at: new Date().toISOString() }),
    });
    return refreshed.access_token;
  }

  return row.access_token;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { to, subject, body, emailId } = req.body;

  if (!to || !subject || !body) {
    return res.status(400).json({ error: 'Missing required fields: to, subject, body' });
  }

  const accessToken = await getAccessToken();
  if (!accessToken) return res.status(401).json({ error: 'Gmail not connected' });

  try {
    // Build RFC 2822 message
    const message = [
      `To: ${to}`,
      `Subject: ${subject}`,
      'Content-Type: text/plain; charset=utf-8',
      'MIME-Version: 1.0',
      '',
      body,
    ].join('\r\n');

    const encoded = Buffer.from(message)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const sendRes = await fetch('https://www.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization:  `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: encoded }),
    });

    if (!sendRes.ok) {
      const err = await sendRes.json();
      console.error('Gmail send error:', err);
      return res.status(500).json({ error: err.error?.message || 'Failed to send email' });
    }

    // Mark email as sent in Supabase
    if (emailId) {
      await fetch(`${SUPABASE_URL}/rest/v1/emails?id=eq.${emailId}`, {
        method: 'PATCH',
        headers: SUPABASE_HEADERS(),
        body: JSON.stringify({ status: 'sent' }),
      });
    }

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('Gmail send error:', err);
    return res.status(500).json({ error: err.message });
  }
}
