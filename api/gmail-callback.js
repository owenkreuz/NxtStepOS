// Handles Google OAuth callback — exchanges code for tokens, stores in Supabase
export default async function handler(req, res) {
  const { code, error } = req.query;

  if (error) {
    return res.redirect(`/dashboard.html?gmail_error=${encodeURIComponent(error)}`);
  }

  if (!code) {
    return res.redirect('/dashboard.html?gmail_error=no_code');
  }

  const clientId     = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const redirectUri  = 'https://nxtstepOS.com/api/gmail-callback';
  const supabaseUrl  = process.env.SUPABASE_URL;
  const supabaseKey  = process.env.SUPABASE_SERVICE_KEY;

  try {
    // Exchange auth code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id:     clientId,
        client_secret: clientSecret,
        redirect_uri:  redirectUri,
        grant_type:    'authorization_code',
      }),
    });

    const tokens = await tokenRes.json();

    if (!tokenRes.ok) {
      console.error('Token exchange error:', tokens);
      return res.redirect('/dashboard.html?gmail_error=token_exchange');
    }

    // Get the Gmail address that was authorized
    const profileRes = await fetch('https://www.googleapis.com/gmail/v1/users/me/profile', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const profile = await profileRes.json();

    const expiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    // Upsert tokens into Supabase (update if same email already connected)
    await fetch(`${supabaseUrl}/rest/v1/gmail_tokens`, {
      method: 'POST',
      headers: {
        'apikey':        supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type':  'application/json',
        'Prefer':        'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({
        email:         profile.emailAddress,
        access_token:  tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_expiry:  expiry,
        updated_at:    new Date().toISOString(),
      }),
    });

    return res.redirect('/dashboard.html?gmail_connected=1');

  } catch (err) {
    console.error('Gmail callback error:', err);
    return res.redirect('/dashboard.html?gmail_error=unknown');
  }
}
