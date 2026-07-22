'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { and, eq, isNull, sql } from 'drizzle-orm';
import {
  db,
  projects,
  projectBriefSignoffs,
  projectCustomerInvitations
} from '@/db';
import { createClient as supabaseServer } from '@/lib/supabase/server';
import { isStaffAllowed } from '@/lib/staff-access';

/**
 * Customer brief sign-off (B5).
 *
 * Doctrine: per `00-industry-best-practices.md` §22 ("approval is the
 * contract") and `20-doc-templates-best-practice.md`, written customer
 * approval is the load-bearing evidence that the brief reflects intent.
 * This action is the moment that evidence is created.
 *
 * Behaviour:
 *   - Only the customer (signed in with an active invitation for this
 *     project) can sign off. Staff can never sign off on the customer's
 *     behalf — that would defeat the entire point.
 *   - The brief at the moment of sign-off is FROZEN into
 *     `brief_snapshot` (description + fablabRole + project reference +
 *     title). If staff later edit the brief, that history is preserved
 *     and a fresh sign-off can be requested.
 *   - Audit fields (`user_agent`, `ip`) are best-effort. They come from
 *     request headers; missing ones don't block the sign-off.
 *   - Multiple sign-off rows are allowed over time; the latest by
 *     `signed_off_at` is the operative one.
 */

type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Best-effort client IP. Netlify sets `x-nf-client-connection-ip`;
 * standard proxies set `x-forwarded-for` (comma-separated; first is
 * client). Never blocks if absent — sign-off is more important than
 * the audit field.
 */
function clientIpFromHeaders(h: Headers): string | null {
  const nf = h.get('x-nf-client-connection-ip');
  if (nf) return nf;
  const xff = h.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]?.trim() || null;
  const real = h.get('x-real-ip');
  return real || null;
}

export async function postBriefSignoff(
  projectId: string
): Promise<ActionResult> {
  const supabase = await supabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user?.id || !user.email) {
    return { ok: false, error: 'Not authenticated' };
  }
  if ((await isStaffAllowed(user.email))) {
    return {
      ok: false,
      error: 'Staff cannot sign off on the customer\'s behalf'
    };
  }

  // Confirm the customer has an active invitation for this project.
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
    return { ok: false, error: 'Not authorised to sign off this project' };
  }

  // Freeze the current brief. Description + fablabRole are the
  // operative fields; we also capture the reference + title so the
  // snapshot is self-describing without needing a join.
  const [proj] = await db
    .select({
      reference: projects.reference,
      title: projects.title,
      description: projects.description,
      fablabRole: projects.fablabRole
    })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!proj) return { ok: false, error: 'Project not found' };
  if (!proj.description?.trim()) {
    return {
      ok: false,
      error:
        'The brief has no description yet — there\'s nothing to sign off. Ask your designer to share the brief text first.'
    };
  }

  const h = await headers();
  const userAgent = h.get('user-agent');
  const ip = clientIpFromHeaders(h);

  try {
    await db.insert(projectBriefSignoffs).values({
      projectId,
      signedOffBy: user.id,
      briefSnapshot: {
        description: proj.description,
        fablabRole: proj.fablabRole,
        projectRef: proj.reference,
        title: proj.title
      },
      userAgent: userAgent ?? null,
      ip
    });

    // Both surfaces refresh — the customer sees the green confirmation,
    // staff see the sign-off appear in the activity card.
    revalidatePath(`/projects/${projectId}`);
    revalidatePath(`/portal/projects/${projectId}`);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Unknown error signing off'
    };
  }
}
