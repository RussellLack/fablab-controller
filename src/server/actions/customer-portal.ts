'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db, projectCustomerInvitations } from '@/db';
import { createClient as supabaseServer } from '@/lib/supabase/server';
import { isStaffEmail } from '@/lib/auth-helpers';

type ActionResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Compose the magic-link redirect URL that points the customer at
 * the right project after they sign in.
 *
 * Mirrors the precedence the auth callback already uses:
 *   1. NEXT_PUBLIC_APP_URL (canonical public host)
 *   2. fall back to relative — Supabase tolerates a relative path and
 *      will join it onto the project's configured Site URL
 */
function emailRedirectFor(projectId: string): string {
  const next = `/auth/callback?next=${encodeURIComponent(
    `/portal/projects/${projectId}`
  )}`;
  const base = process.env.NEXT_PUBLIC_APP_URL;
  return base ? `${base}${next}` : next;
}

async function assertStaffCaller(): Promise<
  | { ok: true; userId: string }
  | { ok: false; error: string }
> {
  const supabase = await supabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user?.id || !user.email) {
    return { ok: false, error: 'Not authenticated' };
  }
  if (!isStaffEmail(user.email)) {
    return { ok: false, error: 'Only Fablab staff can invite customers' };
  }
  return { ok: true, userId: user.id };
}

/**
 * Invite a customer to view a project in the portal.
 *
 * Idempotent on the (project, email) pair — re-inviting an existing
 * row clears `revoked_at`, updates the note, and re-sends the magic
 * link. The unique index `pci_project_email_idx` enforces one row
 * per pair.
 *
 * Sends the magic link via `supabase.auth.signInWithOtp` with
 * `shouldCreateUser: true` so first-time customers get an auth.users
 * row on the round trip. The emailRedirectTo points at the
 * auth-callback with `?next=/portal/projects/<id>` so they land
 * straight on their project after sign-in.
 */
export async function inviteProjectCustomer(
  projectId: string,
  formData: FormData
): Promise<ActionResult> {
  const staff = await assertStaffCaller();
  if (!staff.ok) return staff;

  const rawEmail = (formData.get('email')?.toString() ?? '').trim();
  const note = formData.get('note')?.toString().trim() || null;

  if (!rawEmail) {
    return {
      ok: false,
      error: 'Email is required',
      fieldErrors: { email: ['Email is required'] }
    };
  }
  if (!EMAIL_RX.test(rawEmail)) {
    return {
      ok: false,
      error: 'Email is invalid',
      fieldErrors: { email: ['Enter a valid email address'] }
    };
  }
  if (isStaffEmail(rawEmail)) {
    return {
      ok: false,
      error: 'Staff sign in via Google — the customer portal is for external clients.',
      fieldErrors: { email: ['Staff accounts use the Google sign-in flow'] }
    };
  }

  const email = rawEmail.toLowerCase();

  try {
    // Manual upsert: drizzle's onConflictDoUpdate target only accepts column
    // references, but our unique index is on (project_id, lower(email)), so
    // we look the row up first and branch. Idempotent on re-invite — same row
    // gets its note refreshed and revoked_at cleared.
    const [existing] = await db
      .select({ id: projectCustomerInvitations.id })
      .from(projectCustomerInvitations)
      .where(
        and(
          eq(projectCustomerInvitations.projectId, projectId),
          sql`lower(${projectCustomerInvitations.email}) = ${email}`
        )
      )
      .limit(1);

    if (existing) {
      await db
        .update(projectCustomerInvitations)
        .set({
          note,
          revokedAt: null,
          invitedBy: staff.userId,
          invitedAt: new Date()
        })
        .where(eq(projectCustomerInvitations.id, existing.id));
    } else {
      await db.insert(projectCustomerInvitations).values({
        projectId,
        email,
        invitedBy: staff.userId,
        note
      });
    }

    const supabase = await supabaseServer();
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: emailRedirectFor(projectId)
      }
    });
    if (otpError) {
      return {
        ok: false,
        error: `Invitation saved, but the magic link failed to send: ${otpError.message}. Use Resend to retry.`
      };
    }

    revalidatePath(`/projects/${projectId}`);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Unknown error inviting customer'
    };
  }
}

/**
 * Revoke a customer's invitation. Soft-delete: sets revoked_at, keeps
 * the row for audit. The portal layout checks for revokedAt IS NULL,
 * so a revoked customer who clicks an old magic link will land on the
 * portal but see no projects.
 */
export async function revokeProjectCustomerInvitation(
  invitationId: string
): Promise<ActionResult> {
  const staff = await assertStaffCaller();
  if (!staff.ok) return staff;

  try {
    const [updated] = await db
      .update(projectCustomerInvitations)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(projectCustomerInvitations.id, invitationId),
          isNull(projectCustomerInvitations.revokedAt)
        )
      )
      .returning({ projectId: projectCustomerInvitations.projectId });

    if (updated) revalidatePath(`/projects/${updated.projectId}`);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Unknown error revoking invitation'
    };
  }
}

/**
 * Resend the magic link to an existing (non-revoked) invitee.
 * Same `?next=` so they land on the same project.
 */
export async function resendProjectCustomerInvitation(
  invitationId: string
): Promise<ActionResult> {
  const staff = await assertStaffCaller();
  if (!staff.ok) return staff;

  const [invite] = await db
    .select({
      email: projectCustomerInvitations.email,
      projectId: projectCustomerInvitations.projectId,
      revokedAt: projectCustomerInvitations.revokedAt
    })
    .from(projectCustomerInvitations)
    .where(eq(projectCustomerInvitations.id, invitationId))
    .limit(1);

  if (!invite) {
    return { ok: false, error: 'Invitation not found' };
  }
  if (invite.revokedAt) {
    return {
      ok: false,
      error: 'Invitation has been revoked. Invite the customer again instead.'
    };
  }

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithOtp({
    email: invite.email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: emailRedirectFor(invite.projectId)
    }
  });
  if (error) {
    return { ok: false, error: `Magic link failed to send: ${error.message}` };
  }

  await db
    .update(projectCustomerInvitations)
    .set({ invitedAt: new Date(), invitedBy: staff.userId })
    .where(eq(projectCustomerInvitations.id, invitationId));

  revalidatePath(`/projects/${invite.projectId}`);
  return { ok: true };
}
