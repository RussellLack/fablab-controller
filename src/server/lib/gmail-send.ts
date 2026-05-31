/**
 * Thin wrapper around Gmail's `users.messages.send` API.
 *
 * Doesn't depend on the googleapis SDK — Gmail's REST endpoint takes a
 * base64url-encoded RFC 822 message in a JSON body, which we can build
 * with plain string concatenation. Keeps the bundle small and avoids a
 * heavy SDK dependency for a single endpoint.
 */

const GMAIL_SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';

export type SendGmailInput = {
  accessToken: string;
  /** Sender's authenticated email (must be the same account as the access token). */
  from: string;
  /** Optional display name for the From header. */
  fromName?: string;
  /** Single recipient address. */
  to: string;
  /** Optional Cc address. */
  cc?: string;
  subject: string;
  /** Plain-text body. */
  body: string;
};

export type SendGmailResult =
  | { ok: true; messageId: string; threadId?: string }
  | { ok: false; status?: number; error: string };

export async function sendGmail(input: SendGmailInput): Promise<SendGmailResult> {
  const mime = buildMime(input);
  const raw = toBase64Url(mime);

  let res: Response;
  try {
    res = await fetch(GMAIL_SEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ raw })
    });
  } catch (e) {
    return { ok: false, error: `Gmail fetch failed: ${(e as Error).message}` };
  }

  if (!res.ok) {
    let detail = '';
    try {
      detail = await res.text();
    } catch {
      // ignore body-read failure; status code is enough signal
    }
    return {
      ok: false,
      status: res.status,
      error: `Gmail API ${res.status}: ${truncate(detail, 240)}`
    };
  }

  const data = (await res.json()) as { id: string; threadId?: string };
  return { ok: true, messageId: data.id, threadId: data.threadId };
}

/** RFC 822 message builder. UTF-8 plain text only — no attachments yet. */
function buildMime(input: SendGmailInput): string {
  const fromHeader = input.fromName
    ? `${quoteIfNeeded(input.fromName)} <${input.from}>`
    : input.from;
  const headers: string[] = [
    `From: ${fromHeader}`,
    `To: ${input.to}`,
    ...(input.cc ? [`Cc: ${input.cc}`] : []),
    `Subject: ${encodeSubject(input.subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit'
  ];
  return headers.join('\r\n') + '\r\n\r\n' + input.body;
}

/** Wrap display names containing punctuation in double quotes. */
function quoteIfNeeded(name: string): string {
  if (/[,;:<>()@\\"]/.test(name)) return `"${name.replace(/"/g, '\\"')}"`;
  return name;
}

/** RFC 2047 encoded-word for non-ASCII subjects. */
function encodeSubject(s: string): string {
  // Pure ASCII → no encoding needed
  if (/^[\x20-\x7e]+$/.test(s)) return s;
  const b64 = Buffer.from(s, 'utf-8').toString('base64');
  return `=?UTF-8?B?${b64}?=`;
}

function toBase64Url(s: string): string {
  return Buffer.from(s, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '…' : s;
}
