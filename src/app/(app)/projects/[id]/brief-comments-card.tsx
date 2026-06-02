import { asc, eq } from 'drizzle-orm';
import { db, projectCustomerComments } from '@/db';
import { createClient } from '@/lib/supabase/server';
import {
  BriefComments,
  type BriefComment
} from '@/components/portal/brief-comments';

/**
 * Staff-side mount of the shared <BriefComments> thread. Same data,
 * same component as the customer portal — the only difference is the
 * caller identity (a staff user with currentUserIsStaff=true upstream).
 *
 * The component itself doesn't care who's staff vs customer in its
 * props; that's encoded per-comment via `authorIsStaff`. We pass the
 * current user id so own-author edit/delete affordances appear.
 */
export async function BriefCommentsCard({ projectId }: { projectId: string }) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  const rows = await db
    .select({
      id: projectCustomerComments.id,
      authorId: projectCustomerComments.authorId,
      authorIsStaff: projectCustomerComments.authorIsStaff,
      body: projectCustomerComments.body,
      section: projectCustomerComments.section,
      replyToId: projectCustomerComments.replyToId,
      createdAt: projectCustomerComments.createdAt,
      editedAt: projectCustomerComments.editedAt
    })
    .from(projectCustomerComments)
    .where(eq(projectCustomerComments.projectId, projectId))
    .orderBy(asc(projectCustomerComments.createdAt));

  const initial: BriefComment[] = rows.map((c) => ({
    id: c.id,
    authorId: c.authorId,
    authorIsStaff: c.authorIsStaff,
    body: c.body,
    section: c.section,
    replyToId: c.replyToId,
    createdAt: c.createdAt.toISOString(),
    editedAt: c.editedAt ? c.editedAt.toISOString() : null
  }));

  return (
    <BriefComments
      projectId={projectId}
      initial={initial}
      currentUserId={user?.id ?? ''}
      canPost={true}
    />
  );
}
