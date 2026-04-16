// ─────────────────────────────────────────────────────────────────────────────
// GmailOAuthService — thin wrapper over Google OAuth 2.0.
// The actual Gmail API polling (listing messages, fetching threads) lives in
// a separate GmailProvider that consumes tokens produced here. This service
// only handles the OAuth dance and token refresh.
//
// Required env:
//   GOOGLE_CLIENT_ID
//   GOOGLE_CLIENT_SECRET
//   GOOGLE_OAUTH_REDIRECT_URI   (e.g. https://worksuite-api.vercel.app/email-intel/oauth/callback)
//
// If any of those are missing, methods throw a clear error so the routes can
// return a helpful "not configured" message to the browser.
// ─────────────────────────────────────────────────────────────────────────────

const GOOGLE_AUTH_URL  = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

const GMAIL_READONLY_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const USER_EMAIL_SCOPE     = 'https://www.googleapis.com/auth/userinfo.email';

export interface GoogleOAuthTokens {
  access_token: string;
  refresh_token?: string;
  expires_in: number; // seconds
  token_type: string;
  scope: string;
}

export class GmailOAuthService {
  private config(): { clientId: string; clientSecret: string; redirectUri: string } {
    const clientId     = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri  = process.env.GOOGLE_OAUTH_REDIRECT_URI;
    if (!clientId || !clientSecret || !redirectUri) {
      throw Object.assign(
        new Error('Google OAuth not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_OAUTH_REDIRECT_URI.'),
        { statusCode: 503, code: 'GOOGLE_OAUTH_NOT_CONFIGURED' },
      );
    }
    return { clientId, clientSecret, redirectUri };
  }

  isConfigured(): boolean {
    return Boolean(
      process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_OAUTH_REDIRECT_URI,
    );
  }

  /** Build the consent URL the browser should redirect the user to. */
  buildAuthUrl(state: string): string {
    const { clientId, redirectUri } = this.config();
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: `${GMAIL_READONLY_SCOPE} ${USER_EMAIL_SCOPE}`,
      access_type: 'offline',
      prompt: 'consent',
      state,
      include_granted_scopes: 'true',
    });
    return `${GOOGLE_AUTH_URL}?${params.toString()}`;
  }

  /** Exchange an authorization code for tokens. */
  async exchangeCodeForTokens(code: string): Promise<GoogleOAuthTokens> {
    const { clientId, clientSecret, redirectUri } = this.config();
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code,
    });
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Google token exchange failed (${res.status}): ${text}`);
    }
    return (await res.json()) as GoogleOAuthTokens;
  }

  /** Refresh an access token. */
  async refreshAccessToken(refreshToken: string): Promise<GoogleOAuthTokens> {
    const { clientId, clientSecret } = this.config();
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Google token refresh failed (${res.status}): ${text}`);
    }
    return (await res.json()) as GoogleOAuthTokens;
  }

  /** Fetch the authenticated user's email (for display + verification). */
  async fetchUserEmail(accessToken: string): Promise<string> {
    const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error(`Google userinfo failed (${res.status})`);
    const json = (await res.json()) as { email?: string };
    if (!json.email) throw new Error('Google userinfo response missing email');
    return json.email;
  }
}
