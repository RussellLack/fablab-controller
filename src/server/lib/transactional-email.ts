/**
 * Transactional email — Postmark wrapper.
 *
 * Single entry point used by every code path that needs to send a
 * branded, non-auth email (currently: comment notifications on the
 * customer portal). Direct HTTP against Postmark's batch endpoint —
 * no SDK install, same shape as our Gmail wrapper.
 *
 * Configuration (Netlify env vars):
 *   - POSTMARK_SERVER_TOKEN     Server-level API token (Postmark dashboard → Servers → your server → API Tokens)
 *   - POSTMARK_FROM_EMAIL       The signed sender address (single-sender verification or DKIM/SPF on the domain)
 *   - POSTMARK_FROM_NAME        Optional display name (defaults to "Fablab Design Controller")
 *   - POSTMARK_MESSAGE_STREAM   Optional stream id (defaults to "outbound" — Postmark's default transactional stream)
 *
 * If `POSTMARK_SERVER_TOKEN` or `POSTMARK_FROM_EMAIL` is unset, the
 * function is a graceful no-op — logs a warning and returns
 * `{ ok: false, skipped: true }`. Callers should treat the result as
 * best-effort and never block the underlying write on it.
 *
 * Per-recipient privacy: each recipient gets a separate email via
 * Postmark's `/email/batch` endpoint, so addresses don't leak across
 * the To-line (matters for portal notifications when multiple
 * customers are invited to the same project).
 *
 * Swapping to another mailer later is a single-file change — the
 * `SendTransactionalEmailArgs` shape stays stable.
 */

export type SendTransactionalEmailArgs = {
  /** Single recipient or an array. Each gets a separate email so addresses don't leak. */
  to: string | string[];
  subject: string;
  /** Plain-text body — always sent as the alternative MIME part. */
  text: string;
  /** HTML body — caller is responsible for client-compatible markup. */
  html: string;
  /** Optional Reply-To address (e.g. the comment author) so recipients can reply directly. */
  replyTo?: { email: string; name?: string };
};

export type TransactionalEmailResult =
  | { ok: true }
  | { ok: false; error: string; skipped?: boolean };

const POSTMARK_BATCH_URL = 'https://api.postmarkapp.com/email/batch';

function formatAddress(email: string, name?: string): string {
  if (!name) return email;
  // RFC 5322 display-name; quote it so commas / specials don't break parsing.
  const safeName = name.replace(/"/g, '\\"');
  return `"${safeName}" <${email}>`;
}

export async function sendTransactionalEmail(
  args: SendTransactionalEmailArgs
): Promise<TransactionalEmailResult> {
  const token = process.env.POSTMARK_SERVER_TOKEN;
  const fromEmail = process.env.POSTMARK_FROM_EMAIL;
  const fromName = process.env.POSTMARK_FROM_NAME || 'Fablab Design Controller';
  const stream = process.env.POSTMARK_MESSAGE_STREAM || 'outbound';

  if (!token || !fromEmail) {
    // Graceful no-op so dev / unconfigured envs don't break the
    // surrounding write. The caller (comment dispatch) is fire-and-forget.
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        '[transactional-email] POSTMARK_SERVER_TOKEN / POSTMARK_FROM_EMAIL not set — skipping notification.'
      );
    }
    return { ok: false, error: 'Postmark not configured', skipped: true };
  }

  const recipients = (Array.isArray(args.to) ? args.to : [args.to]).filter(
    (e) => typeof e === 'string' && e.includes('@')
  );
  if (recipients.length === 0) {
    return { ok: false, error: 'No valid recipients', skipped: true };
  }

  const fromHeader = formatAddress(fromEmail, fromName);
  const replyToHeader = args.replyTo
    ? formatAddress(args.replyTo.email, args.replyTo.name)
    : undefined;

  // One email per recipient via the batch endpoint — Postmark sends
  // each as an independent message so addresses don't appear in
  // each other's To: line.
  const messages = recipients.map((email) => ({
    From: fromHeader,
    To: email,
    Subject: args.subject,
    HtmlBody: args.html,
    TextBody: args.text,
    MessageStream: stream,
    ...(replyToHeader ? { ReplyTo: replyToHeader } : {})
  }));

  try {
    const res = await fetch(POSTMARK_BATCH_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Postmark-Server-Token': token
      },
      body: JSON.stringify(messages)
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return {
        ok: false,
        error: `Postmark ${res.status}: ${detail.slice(0, 300)}`
      };
    }
    // Postmark returns an array of per-recipient results; surface any
    // non-zero ErrorCode as a partial failure but treat the overall
    // call as ok if at least one succeeded.
    type PostmarkResult = { ErrorCode?: number; Message?: string; To?: string };
    const results = (await res.json().catch(() => [])) as PostmarkResult[];
    const failures = results.filter((r) => (r.ErrorCode ?? 0) !== 0);
    if (failures.length === results.length && results.length > 0) {
      return {
        ok: false,
        error: `All recipients failed: ${failures
          .slice(0, 3)
          .map((f) => `${f.To}: ${f.Message ?? 'error'}`)
          .join('; ')}`
      };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Unknown Postmark error'
    };
  }
}
