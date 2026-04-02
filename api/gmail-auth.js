// Redirects the user to Google's OAuth consent screen
export default function handler(req, res) {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const redirectUri = 'https://nxtstepOS.com/api/gmail-callback';

  const scope = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.modify',
  ].join(' ');

  const url =
    'https://accounts.google.com/o/oauth2/v2/auth' +
    `?client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent(scope)}` +
    `&access_type=offline` +
    `&prompt=consent`;

  res.redirect(url);
}
