/**
 * Thin wrapper around Gmail's `users.messages.send` API.
 *
 * Doesn't depend on the googleapis SDK — Gmail's REST endpoint takes a
 * base64url-encoded RFC 822 message in a JSON body, which we can build
 * with plain string concatenation. Keeps the bundle small and avoids a
 * heavy SDK dependency for a single endpoint.
 */

const GMAIL_SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';

export type GmailAttachment = {
  filename: string;
  mimeType: string;
  /** Raw bytes — will be base64-encoded into the MIME part. */
  content: Buffer | Uint8Array;
};

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
  /** Optional Bcc address (defaults to the sender for record-keeping). */
  bcc?: string;
  subject: string;
  /** Plain-text body. */
  body: string;
  /** Optional file attachments. If present, the message becomes multipart/mixed. */
  attachments?: GmailAttachment[];
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

/** RFC 822 message builder. Plain text when no attachments; multipart/mixed when present. */
function buildMime(input: SendGmailInput): string {
  const fromHeader = input.fromName
    ? `${quoteIfNeeded(input.fromName)} <${input.from}>`
    : input.from;
  const commonHeaders: string[] = [
    `From: ${fromHeader}`,
    `To: ${input.to}`,
    ...(input.cc ? [`Cc: ${input.cc}`] : []),
    ...(input.bcc ? [`Bcc: ${input.bcc}`] : []),
    `Subject: ${encodeSubject(input.subject)}`,
    'MIME-Version: 1.0'
  ];

  // No attachments → simple text/plain
  if (!input.attachments || input.attachments.length === 0) {
    return (
      [
        ...commonHeaders,
        'Content-Type: text/plain; charset="UTF-8"',
        'Content-Transfer-Encoding: 8bit'
      ].join('\r\n') +
      '\r\n\r\n' +
      input.body
    );
  }

  // Multipart/mixed with text body + each attachment as a base64 part
  const boundary = `===bnd${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2)}===`;

  const parts: string[] = [];
  // Body part
  parts.push(
    [
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: 8bit',
      '',
      input.body
    ].join('\r\n')
  );
  // Attachment parts
  for (const att of input.attachments) {
    const b64 = Buffer.from(att.content).toString('base64');
    const wrapped = b64.match(/.{1,76}/g)?.join('\r\n') ?? b64;
    parts.push(
      [
        `--${boundary}`,
        `Content-Type: ${att.mimeType}; name="${escapeFilename(att.filename)}"`,
        'Content-Transfer-Encoding: base64',
        `Content-Disposition: attachment; filename="${escapeFilename(att.filename)}"`,
        '',
        wrapped
      ].join('\r\n')
    );
  }
  parts.push(`--${boundary}--`);

  return (
    [
      ...commonHeaders,
      `Content-Type: multipart/mixed; boundary="${boundary}"`
    ].join('\r\n') +
    '\r\n\r\n' +
    parts.join('\r\n')
  );
}

function escapeFilename(name: string): string {
  return name.replace(/"/g, '');
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
