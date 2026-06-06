'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, isNull, sql } from 'drizzle-orm';
import {
  db,
  projectCustomerComments,
  projectCustomerInvitations,
  users
} from '@/db';
import { createClient as supabaseServer } from '@/lib/supabase/server';
import { isStaffEmail } from '@/lib/auth-helpers';
import { notifyCommentRecipients } from '@/server/lib/comment-notifications';

/**
 * Comment workflow for the brief discussion thread (B4).
 *
 * Both staff and customers post into the same `project_customer_comments`
 * table. `author_is_staff` is denormalised at write time from the
 * caller's email domain, so the UI can render the two sides distinctly
 * without joining against auth.users.
 *
 * Authorisation per call:
 *   - Staff: any signed-in @fablabdesign.com Workspace user can post.
 *   - Customer: must be signed in AND have an active (non-revoked)
 *     invitation for the project.
 *
 * Edit + delete: author-only. We don't expose moderation for v1; if
 * inappropriate customer content shows up, staff can revoke the
 * invitation as the heavy lever.
 */

type ActionResult =
  | { ok: true; commentId?: string }
  | { ok: false; error: string };

/** Allowed section keys — mirrors the schema column comment. */
const ALLOWED_SECTIONS = ['description', 'intake', 'general'] as const;
type Section = (typeof ALLOWED_SECTIONS)[number];

async function authoriseCaller(
  projectId: string
): Promise<
  | { ok: true; userId: string; isStaff: boolean }
  | { ok: false; error: string }
> {
  const supabase = await supabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user?.id || !user.email) {
    return { ok: false, error: 'Not authenticated' };
  }
  if (isStaffEmail(user.email)) {
    return { ok: true, userId: user.id, isStaff: true };
  }
  // Customer path — must have an active invitation for the project.
  const [invite] = await db
    .select({ id: projectCustomerInvitations.id })
    .from(projectCustomerInvitations)
    .where(
      and(
        eq(projectCustomerInvitations.projectId, projectId),
        sql`lower(${projectCustomerInvitations.email}) = ${user.email.toLowerCase()}`,
        isNull(projectCustomerInvitations.revokedAt)
      )
    )
    .limit(1);
  if (!invite) {
    return { ok: false, error: 'Not authorised to comment on this project' };
  }
  return { ok: true, userId: user.id, isStaff: false };
}

function bothRevalidations(projectId: string) {
  // Comments are visible on both surfaces — refresh both so neither
  // side sees a stale thread after a write.
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/portal/projects/${projectId}`);
}

/** Post a new comment (top-level or reply). */
export async function postBriefComment(
  projectId: string,
  formData: FormData
): Promise<ActionResult> {
  const auth = await authoriseCaller(projectId);
  if (!auth.ok) return auth;

  const body = (formData.get('body')?.toString() ?? '').trim();
  if (!body) return { ok: false, error: 'Comment cannot be empty' };
  if (body.length > 5000) {
    return { ok: false, error: 'Comment is too long (max 5000 characters)' };
  }

  const sectionRaw = (formData.get('section')?.toString() ?? '').trim();
  const section: Section =
    ALLOWED_SECTIONS.includes(sectionRaw as Section)
      ? (sectionRaw as Section)
      : 'general';

  const replyToIdRaw = formData.get('replyToId')?.toString().trim() || null;
  // Lightweight validation — must be a UUID string if present. Bad
  // values just skip the link rather than reject the whole write.
  const replyToId =
    replyToIdRaw && /^[0-9a-f-]{36}$/i.test(replyToIdRaw) ? replyToIdRaw : null;

  try {
    const [row] = await db
      .insert(projectCustomerComments)
      .values({
        projectId,
        authorId: auth.userId,
        authorIsStaff: auth.isStaff,
        body,
        section,
        replyToId
      })
      .returning({ id: projectCustomerComments.id });

    bothRevalidations(projectId);

    // Fire-and-forget transactional email — comments must succeed
    // even if email is misconfigured or transiently failing.
    void dispatchCommentNotifications({
      projectId,
      authorId: auth.userId,
      authorIsStaff: auth.isStaff,
      body
    });

    return { ok: true, commentId: row?.id };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Unknown error posting comment'
    };
  }
}

/** Author-only edit. Stamps editedAt so the UI can render "(edited)". */
export async function editBriefComment(
  commentId: string,
  formData: FormData
): Promise<ActionResult> {
  const body = (formData.get('body')?.toString() ?? '').trim();
  if (!body) return { ok: false, error: 'Comment cannot be empty' };
  if (body.length > 5000) {
    return { ok: false, error: 'Comment is too long (max 5000 characters)' };
  }

  const supabase = await supabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user?.id) return { ok: false, error: 'Not authenticated' };

  const [existing] = await db
    .select({
      projectId: projectCustomerComments.projectId,
      authorId: projectCustomerComments.authorId
    })
    .from(projectCustomerComments)
    .where(eq(projectCustomerComments.id, commentId))
    .limit(1);
  if (!existing) return { ok: false, error: 'Comment not found' };
  if (existing.authorId !== user.id) {
    return { ok: false, error: 'You can only edit your own comments' };
  }

  await db
    .update(projectCustomerComments)
    .set({ body, editedAt: new Date() })
    .where(eq(projectCustomerComments.id, commentId));

  bothRevalidations(existing.projectId);
  return { ok: true };
}

/**
 * Author-only delete. Replies to a deleted comment lose their parent
 * link visually but stay in the DB — we tombstone by removing the row,
 * accepting that orphaned replies show as top-level. (Cheap; v2 could
 * cascade or render "[deleted]" placeholders.)
 */
export async function deleteBriefComment(
  commentId: string
): Promise<ActionResult> {
  const supabase = await supabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user?.id) return { ok: false, error: 'Not authenticated' };

  const [existing] = await db
    .select({
      projectId: projectCustomerComments.projectId,
      authorId: projectCustomerComments.authorId
    })
    .from(projectCustomerComments)
    .where(eq(projectCustomerComments.id, commentId))
    .limit(1);
  if (!existing) return { ok: false, error: 'Comment not found' };
  if (existing.authorId !== user.id) {
    return { ok: false, error: 'You can only delete your own comments' };
  }

  await db
    .delete(projectCustomerComments)
    .where(eq(projectCustomerComments.id, commentId));

  bothRevalidations(existing.projectId);
  return { ok: true };
}

/**
 * Internal — resolve the author's display name + email from auth, then
 * hand off to the notification dispatcher. Wrapped in try/catch so a
 * failure here can never propagate to the surrounding action.
 */
async function dispatchCommentNotifications(args: {
  projectId: string;
  authorId: string;
  authorIsStaff: boolean;
  body: string;
}): Promise<void> {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    // For staff authors we prefer the users-table display name (more
    // reliable than user_metadata.full_name). For customers we fall
    // back to the local-part of the email so the notification line
    // reads like a name.
    let displayName: string;
    let email: string | null = user?.email ?? null;
    if (args.authorIsStaff) {
      const [u] = await db
        .select({ name: users.name, email: users.email })
        .from(users)
        .where(eq(users.id, args.authorId))
        .limit(1);
      displayName =
        u?.name ??
        (user?.user_metadata?.full_name as string | undefined) ??
        (u?.email ?? email ?? 'a Fablab designer');
      email = u?.email ?? email;
    } else {
      const local = (email ?? '').split('@')[0] || 'your client';
      // Prettify "marit.solem" → "Marit Solem" for the email body.
      displayName = local
        .split(/[._-]+/)
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
        .join(' ');
    }
    await notifyCommentRecipients({
      projectId: args.projectId,
      authorId: args.authorId,
      authorIsStaff: args.authorIsStaff,
      authorDisplayName: displayName,
      authorEmail: email,
      body: args.body
    });
  } catch {
    // Best-effort — comments must always succeed.
  }
}
