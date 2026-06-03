/**
 * Comment notification dispatcher.
 *
 * Called by `postBriefComment` after a comment row lands. Routes:
 *
 *   - Staff comment   → email every customer with an active (non-
 *                       revoked) invitation on the project.
 *   - Customer comment → email the project owner (`projects.currentOwnerId`).
 *                       If no owner is set, this is a silent no-op —
 *                       Phase 3 setup includes a one-off backfill that
 *                       sets owners on legacy projects (see
 *                       `23-implementation-log.md`).
 *
 * Author never receives their own notification. Edits don't fire
 * notifications. All sends are best-effort: a failure logs but does
 * NOT bubble up — comments must always succeed regardless of email
 * deliverability.
 */

import { and, eq, isNull, sql } from 'drizzle-orm';
import {
  db,
  projects,
  projectCustomerInvitations,
  users
} from '@/db';
import { sendTransactionalEmail } from './transactional-email';

type NotifyArgs = {
  projectId: string;
  /** The author of the comment that just landed. We exclude them from the recipient list. */
  authorId: string;
  authorIsStaff: boolean;
  /** The author's display name for the email body. */
  authorDisplayName: string;
  /** Optional Reply-To address (the author's email), so recipients can reply directly. */
  authorEmail?: string | null;
  body: string;
  /** Used to build absolute deep-links. Falls back to relative if unset. */
  appBaseUrl?: string;
};

const MAX_EXCERPT = 480;

/** Fire-and-forget. Never throws; callers don't need to await for correctness. */
export async function notifyCommentRecipients(args: NotifyArgs): Promise<void> {
  try {
    // 1. Resolve project metadata + recipients.
    const [proj] = await db
      .select({
        reference: projects.reference,
        title: projects.title,
        currentOwnerId: projects.currentOwnerId
      })
      .from(projects)
      .where(eq(projects.id, args.projectId))
      .limit(1);
    if (!proj) return;

    let recipients: string[] = [];
    if (args.authorIsStaff) {
      // Customer notifications — every active invitation, minus the
      // (rare) case where the author themselves was somehow invited.
      const rows = await db
        .select({ email: projectCustomerInvitations.email })
        .from(projectCustomerInvitations)
        .where(
          and(
            eq(projectCustomerInvitations.projectId, args.projectId),
            isNull(projectCustomerInvitations.revokedAt)
          )
        );
      recipients = rows
        .map((r) => r.email.toLowerCase())
        .filter((e) => !!e);
    } else {
      // Owner notification.
      if (!proj.currentOwnerId || proj.currentOwnerId === args.authorId) return;
      const [owner] = await db
        .select({ email: users.email })
        .from(users)
        .where(eq(users.id, proj.currentOwnerId))
        .limit(1);
      if (!owner?.email) return;
      recipients = [owner.email.toLowerCase()];
    }
    if (recipients.length === 0) return;

    // 2. Compose the message.
    const baseUrl =
      args.appBaseUrl ??
      process.env.NEXT_PUBLIC_APP_URL ??
      'https://controller.fablabdesign.com';
    const deepLink = args.authorIsStaff
      ? `${baseUrl}/portal/projects/${args.projectId}`
      : `${baseUrl}/projects/${args.projectId}`;

    const excerpt = truncate(args.body, MAX_EXCERPT);
    const subject = `${proj.reference} · ${args.authorIsStaff ? 'New comment from Fablab' : 'New comment from your client'}`;
    const heading = args.authorIsStaff
      ? `${args.authorDisplayName} at Fablab Design posted a new comment on ${proj.reference}.`
      : `${args.authorDisplayName} posted a new comment on ${proj.reference}.`;
    const ctaLabel = args.authorIsStaff
      ? 'Open your project'
      : 'Open the project';

    const html = renderHtml({
      heading,
      projectTitle: proj.title,
      excerpt,
      ctaLabel,
      deepLink
    });
    const text = renderPlain({
      heading,
      projectTitle: proj.title,
      excerpt,
      ctaLabel,
      deepLink
    });

    await sendTransactionalEmail({
      to: recipients,
      subject,
      html,
      text,
      replyTo: args.authorEmail
        ? { email: args.authorEmail, name: args.authorDisplayName }
        : undefined
    });
  } catch (err) {
    // Best-effort — never propagate.
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[comment-notifications] dispatch failed:', err);
    }
  }
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + '…';
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderHtml(args: {
  heading: string;
  projectTitle: string;
  excerpt: string;
  ctaLabel: string;
  deepLink: string;
}): string {
  // Inline-styled, table-based — survives Gmail/Outlook stripping.
  // Tone deliberately mirrors `25-supabase-email-templates.md` so the
  // portal magic-link email and the comment notifications feel like
  // the same product.
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f6f5f1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a1a;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="480" style="max-width:480px;background:#ffffff;border:1px solid #e2e0d8;border-radius:12px;padding:32px;">
        <tr>
          <td style="font-size:16px;font-weight:600;color:#1a1a1a;padding-bottom:8px;">
            <span style="color:#c44a3f;">●</span>&nbsp;Fablab Design Controller
          </td>
        </tr>
        <tr>
          <td style="font-size:13px;color:#6b6b6b;padding-bottom:24px;">
            New comment on the brief
          </td>
        </tr>
        <tr>
          <td style="font-size:14px;line-height:1.55;color:#1a1a1a;padding-bottom:16px;">
            ${escapeHtml(args.heading)}
          </td>
        </tr>
        <tr>
          <td style="font-size:13px;line-height:1.5;color:#1a1a1a;background:#f6f5f1;border-radius:8px;padding:14px 16px;white-space:pre-wrap;">
            ${escapeHtml(args.excerpt)}
          </td>
        </tr>
        <tr>
          <td style="padding-top:24px;">
            <div style="font-size:12px;color:#6b6b6b;margin-bottom:8px;">Project: ${escapeHtml(args.projectTitle)}</div>
            <a href="${escapeHtml(args.deepLink)}" style="display:inline-block;background:#1a1a1a;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;">
              ${escapeHtml(args.ctaLabel)}
            </a>
          </td>
        </tr>
        <tr>
          <td style="font-size:11px;line-height:1.5;color:#8a8a8a;border-top:1px solid #e2e0d8;padding-top:16px;margin-top:24px;">
            You're receiving this because you're part of this project's discussion. Reply directly to this email to respond.
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
}

function renderPlain(args: {
  heading: string;
  projectTitle: string;
  excerpt: string;
  ctaLabel: string;
  deepLink: string;
}): string {
  return `Fablab Design Controller — New comment on the brief

${args.heading}

> ${args.excerpt.replace(/\n/g, '\n> ')}

Project: ${args.projectTitle}
${args.ctaLabel}: ${args.deepLink}

You're receiving this because you're part of this project's discussion. Reply to this email to respond.`;
}
