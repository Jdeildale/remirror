import { safeStorage } from 'electron';
import { OAuth2Client } from 'google-auth-library';
import http from 'node:http';
import { URL } from 'node:url';
import { shell } from 'electron';
import { store } from '../store';
import log from '../log';

const SCOPES = ['https://www.googleapis.com/auth/calendar.events.readonly'];

function clientId(): string {
  const id = process.env.GOOGLE_CLIENT_ID;
  if (!id) throw new Error('GOOGLE_CLIENT_ID not set in environment (.env)');
  return id;
}

function clientSecret(): string {
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!secret) throw new Error('GOOGLE_CLIENT_SECRET not set in environment (.env)');
  return secret;
}

function readStoredRefreshToken(): string | undefined {
  const stored = store.get('google').refreshToken;
  if (!stored) return undefined;
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(Buffer.from(stored, 'base64'));
    }
    return stored;
  } catch (err) {
    log.warn('Failed to decrypt Google refresh token; treating as missing', err);
    return undefined;
  }
}

function writeRefreshToken(token: string): void {
  const google = store.get('google');
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(token).toString('base64');
    store.set('google', { ...google, refreshToken: encrypted });
  } else {
    store.set('google', { ...google, refreshToken: token });
  }
}

export function hasStoredAuth(): boolean {
  return !!readStoredRefreshToken();
}

export function getAuthorizedClient(): OAuth2Client | null {
  const refreshToken = readStoredRefreshToken();
  if (!refreshToken) return null;
  const client = new OAuth2Client(clientId(), clientSecret());
  client.setCredentials({ refresh_token: refreshToken });
  return client;
}

/**
 * Runs the desktop OAuth loopback flow:
 * 1. Spin up a local HTTP server on a random port
 * 2. Open the system browser to Google's consent page
 * 3. Capture the auth code on the loopback redirect
 * 4. Exchange for tokens; store the refresh token
 * Resolves with the authorized client or rejects on error/timeout.
 */
export async function startOAuthFlow(): Promise<OAuth2Client> {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.listen(0, '127.0.0.1', async () => {
      try {
        const addr = server.address();
        if (typeof addr === 'string' || addr === null) {
          throw new Error('Local OAuth server failed to bind');
        }
        const redirectUri = `http://127.0.0.1:${addr.port}`;
        const client = new OAuth2Client(clientId(), clientSecret(), redirectUri);

        const authUrl = client.generateAuthUrl({
          access_type: 'offline',
          prompt: 'consent',
          scope: SCOPES,
        });

        const timeout = setTimeout(() => {
          server.close();
          reject(new Error('OAuth flow timed out after 5 minutes'));
        }, 5 * 60_000);

        server.on('request', async (req, res) => {
          try {
            if (!req.url) return;
            const u = new URL(req.url, redirectUri);
            const code = u.searchParams.get('code');
            const err = u.searchParams.get('error');
            if (err) {
              res.end(`OAuth error: ${err}. You can close this tab.`);
              clearTimeout(timeout);
              server.close();
              reject(new Error(`OAuth error: ${err}`));
              return;
            }
            if (!code) {
              res.end('Waiting for code...');
              return;
            }
            const { tokens } = await client.getToken(code);
            if (!tokens.refresh_token) {
              res.end('OAuth succeeded but no refresh token returned. Re-run "Connect" with prompt=consent.');
              clearTimeout(timeout);
              server.close();
              reject(new Error('No refresh token returned'));
              return;
            }
            writeRefreshToken(tokens.refresh_token);
            client.setCredentials(tokens);
            res.end('Remirror is connected to Google Calendar. You can close this tab.');
            clearTimeout(timeout);
            server.close();
            log.info('Google Calendar OAuth completed; refresh token stored');
            resolve(client);
          } catch (e) {
            log.error('OAuth callback error', e);
            res.statusCode = 500;
            res.end('Internal error during OAuth callback. Check logs.');
            clearTimeout(timeout);
            server.close();
            reject(e);
          }
        });

        await shell.openExternal(authUrl);
      } catch (e) {
        server.close();
        reject(e);
      }
    });
  });
}

export function disconnectGoogle(): void {
  const google = store.get('google');
  store.set('google', { ...google, refreshToken: undefined, syncedAt: undefined });
  log.info('Google Calendar disconnected; refresh token removed from store');
}
