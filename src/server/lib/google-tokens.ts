import { eq } from 'drizzle-orm';
import { db, userGoogleTokens } from '@/db';

/**
 * Per-user Google OAuth access/refresh token handling.
 *
 * The login page requests offline + `gmail.send` scope so that after Google
 * sign-in we receive both a short-lived `access_token` (~1 hour) and a
 * long-lived `refresh_token`. Supabase Auth exposes these as
 * `session.provider_token` and `session.provider_refresh_token` once after
 * sign-in; the OAuth callback persists them here via `saveGoogleTokens`.
 *
 * On send (Commit 3), the Gmail-API call uses `getOrRefreshGoogleAccessToken`
 * to obtain a valid access token, refreshing against Google's token endpoint
 * if the stored one is within a minute of expiry.
 *
 * Refresh requires `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` env vars to
 * be set on the server (same values configured in Supabase Auth's Google
 * provider). When absent, refresh returns null and the caller should treat
 * it as "user must re-sign-in to re-authorise".
 */

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

/** Refresh if the access token has fewer seconds left than this. */
const REFRESH_BUFFER_MS = 60_000;

/** Google access tokens default to 3600s; assume ~50 min if we weren't told. */
const ASSUMED_LIFETIME_MS = 50 * 60 * 1000;

export type SaveTokensInput = {
  accessToken: string;
  refreshToken?: string | null;
  /** seconds until expiry, as returned by Google's token endpoint */
  expiresIn?: number | null;
  /** explicit Date — takes priority over expiresIn */
  expiresAt?: Date | null;
  /** space-separated scope string returned by Google */
  scope?: string | null;
};

export async function saveGoogleTokens(userId: string, t: SaveTokensInput) {
  const expiresAt =
    t.expiresAt ??
    (t.expiresIn != null
      ? new Date(Date.now() + t.expiresIn * 1000)
      : new Date(Date.now() + ASSUMED_LIFETIME_MS));

  await db
    .insert(userGoogleTokens)
    .values({
      userId,
      accessToken: t.accessToken,
      refreshToken: t.refreshToken ?? null,
      expiresAt,
      scope: t.scope ?? null,
      updatedAt: new Date()
    })
    .onConflictDoUpdate({
      target: userGoogleTokens.userId,
      set: {
        accessToken: t.accessToken,
        // Only overwrite refresh_token when a new one is supplied — Google
        // doesn't send a fresh refresh_token on access-token refresh.
        ...(t.refreshToken ? { refreshToken: t.refreshToken } : {}),
        expiresAt,
        scope: t.scope ?? null,
        updatedAt: new Date()
      }
    });
}

/**
 * Returns a valid Google access token for `userId`, refreshing if needed.
 * Returns null if:
 *   - the user has no stored tokens (never signed in with gmail.send), OR
 *   - refresh is required but no refresh_token is on file, OR
 *   - GOOGLE_CLIENT_ID/SECRET env vars are missing, OR
 *   - the refresh call to Google failed.
 *
 * Callers should treat null as "ask the user to sign in again with the
 * Gmail scope" — surfaced via a re-auth banner in the UI.
 */
export async function getOrRefreshGoogleAccessToken(
  userId: string
): Promise<string | null> {
  const [row] = await db
    .select()
    .from(userGoogleTokens)
    .where(eq(userGoogleTokens.userId, userId))
    .limit(1);
  if (!row) return null;

  const expiresMs = row.expiresAt?.getTime() ?? 0;
  const timeLeft = expiresMs - Date.now();
  if (timeLeft > REFRESH_BUFFER_MS) {
    return row.accessToken;
  }

  if (!row.refreshToken) return null;

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: row.refreshToken,
    grant_type: 'refresh_token'
  });

  let res: Response;
  try {
    res = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;

  type RefreshResponse = {
    access_token: string;
    expires_in: number;
    scope?: string;
    token_type: string;
  };
  const data = (await res.json()) as RefreshResponse;

  await saveGoogleTokens(userId, {
    accessToken: data.access_token,
    refreshToken: null, // refresh response doesn't include a new refresh_token
    expiresIn: data.expires_in,
    scope: data.scope ?? row.scope ?? null
  });

  return data.access_token;
}
