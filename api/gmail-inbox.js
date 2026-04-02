// Fetches unread Gmail messages, classifies each with Claude AI, stores results in Supabase
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SUPABASE_HEADERS = () => ({
  'apikey':        SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type':  'application/json',
});

// Returns a valid access token, refreshing if expired
async function getAccessToken() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/gmail_tokens?select=*&order=updated_at.desc&limit=1`,
    { headers: SUPABASE_HEADERS() }
  );
  const rows = await res.json();
  if (!rows || rows.length === 0) return null;
  const row = rows[0];

  // Refresh if expiring within 2 minutes
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

// Extract plain text body from Gmail message payload
function extractBody(payload) {
  if (!payload) return '';
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf-8');
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      const text = extractBody(part);
      if (text) return text;
    }
  }
  return '';
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const accessToken = await getAccessToken();
  if (!accessToken) return res.status(401).json({ error: 'Gmail not connected' });

  try {
    // List unread emails (last 25)
    const listRes = await fetch(
      'https://www.googleapis.com/gmail/v1/users/me/messages?maxResults=25&q=is:unread',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const listData = await listRes.json();

    if (!listData.messages || listData.messages.length === 0) {
      return res.status(200).json({ emails: [] });
    }

    // Fetch full message details in parallel
    const rawEmails = await Promise.all(
      listData.messages.map(async (msg) => {
        const r = await fetch(
          `https://www.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        return r.json();
      })
    );

    // Parse each message
    const parsed = rawEmails.map((email) => {
      const headers = email.payload?.headers || [];
      const get = (name) => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';
      const body = extractBody(email.payload);
      return {
        gmail_id:  email.id,
        thread_id: email.threadId,
        from:      get('From'),
        subject:   get('Subject') || '(no subject)',
        date:      get('Date'),
        snippet:   email.snippet || '',
        body:      body.slice(0, 3000),
      };
    });

    // Check which are already in DB, classify new ones with Claude
    const results = await Promise.all(parsed.map(async (email) => {
      // Check if already classified
      const dbRes = await fetch(
        `${SUPABASE_URL}/rest/v1/emails?gmail_message_id=eq.${encodeURIComponent(email.gmail_id)}&select=*`,
        { headers: SUPABASE_HEADERS() }
      );
      const dbRows = await dbRes.json();

      if (dbRows && dbRows.length > 0) {
        return { ...email, ...dbRows[0] };
      }

      // Classify with Claude
      const content = email.body || email.snippet;
      let classification = 'needs_attention';
      let ai_reason      = 'Could not classify — flagged for safety';
      let ai_draft_reply = '';

      try {
        const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type':      'application/json',
            'x-api-key':         process.env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model:      'claude-sonnet-4-20250514',
            max_tokens: 1024,
            messages: [{
              role:    'user',
              content: `You are an AI assistant for an independent insurance agency specializing in Commercial and Life insurance.

Classify this email and write a professional draft reply.

From: ${email.from}
Subject: ${email.subject}
Message: ${content}

Respond with valid JSON only:
{
  "classification": "auto_handle" or "needs_attention",
  "reason": "one sentence explaining why",
  "draft_reply": "professional email reply ready to send"
}

Flag as needs_attention if: client wants to cancel, complaint or upset client, claims, large policy changes, payment disputes, anything involving significant money, or any situation requiring human judgement.

Auto-handle if: general question with a clear answer, coverage inquiry, renewal acknowledgment, thank you email, basic info request, or scheduling.`,
            }],
          }),
        });

        const claudeData = await claudeRes.json();
        const parsed = JSON.parse(claudeData.content[0].text);
        classification = parsed.classification;
        ai_reason      = parsed.reason;
        ai_draft_reply = parsed.draft_reply;
      } catch (e) {
        console.error('Claude classification error:', e);
      }

      // Store in Supabase
      const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/emails`, {
        method: 'POST',
        headers: { ...SUPABASE_HEADERS(), 'Prefer': 'return=representation' },
        body: JSON.stringify({
          gmail_message_id: email.gmail_id,
          gmail_thread_id:  email.thread_id,
          from_email:       email.from,
          subject:          email.subject,
          body:             content,
          received_at:      new Date(email.date).toISOString(),
          ai_classification: classification,
          ai_reason,
          ai_draft_reply,
          status: 'pending',
        }),
      });
      const inserted = await insertRes.json();
      const row = Array.isArray(inserted) ? inserted[0] : inserted;

      return { ...email, id: row?.id, ai_classification: classification, ai_reason, ai_draft_reply, status: 'pending' };
    }));

    return res.status(200).json({ emails: results });

  } catch (err) {
    console.error('Gmail inbox error:', err);
    return res.status(500).json({ error: err.message });
  }
}
