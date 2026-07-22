'use server';

import { revalidatePath } from 'next/cache';
import { sql } from 'drizzle-orm';
import { db, users, staffAllowlist } from '@/db';
import { requireAdmin } from '@/lib/staff-access';
import { STAFF_ROLES, type StaffRole, type ActionResult } from '@/lib/roles';
import { sendTransactionalEmail } from '@/server/lib/transactional-email';

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanRoles(raw: string[]): StaffRole[] {
  const valid = raw.filter((r): r is StaffRole =>
    (STAFF_ROLES as readonly string[]).includes(r)
  );
  return Array.from(new Set(valid));
}

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || 'https://controller.fablabdesign.com';
}

async function usersRowFor(email: string) {
  const [row] = await db
    .select({ id: users.id, roles: users.roles })
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(1);
  return row ?? null;
}

/**
 * Add (or re-add / update) a staff member.
 *
 * Writes the intended access + roles to staff_allowlist (the deploy-free
 * grant), and if the person has already signed in (a public.users row
 * exists) mirrors the change onto that row so it takes effect immediately.
 * Sends a best-effort invite email. useActionState signature.
 */
export async function addStaffMember(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;

  const rawEmail = (formData.get('email')?.toString() ?? '').trim();
  const name = formData.get('name')?.toString().trim() || null;
  const roles = cleanRoles(formData.getAll('roles').map((r) => r.toString()));
  const notify = formData.get('notify')?.toString() !== 'off';

  if (!rawEmail) {
    return { ok: false, error: 'Email is required', fieldErrors: { email: ['Email is required'] } };
  }
  if (!EMAIL_RX.test(rawEmail)) {
    return { ok: false, error: 'Enter a valid email address', fieldErrors: { email: ['Enter a valid email address'] } };
  }
  const finalRoles: StaffRole[] = roles.length ? roles : ['project_lead'];
  const email = rawEmail.toLowerCase();

  try {
    await db
      .insert(staffAllowlist)
      .values({
        email,
        name,
        roles: finalRoles,
        active: true,
        invitedBy: admin.userId,
        invitedAt: new Date(),
        updatedAt: new Date()
      })
      .onConflictDoUpdate({
        target: staffAllowlist.email,
        set: { name, roles: finalRoles, active: true, updatedAt: new Date() }
      });

    // If they already have a users row (signed in before, or a domain member),
    // apply the roles + reactivate now so it takes effect without a re-login.
    const existing = await usersRowFor(email);
    if (existing) {
      await db
        .update(users)
        .set({ roles: finalRoles, active: true, name: name ?? undefined, updatedAt: new Date() })
        .where(sql`lower(${users.email}) = ${email}`);
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not add member' };
  }

  if (notify) {
    const url = appUrl();
    void sendTransactionalEmail({
      to: email,
      subject: 'Du har fått tilgang til Fablab Design Controller / You have been added',
      text:
        `Hei,\n\nDu har blitt lagt til som teammedlem i Fablab Design Controller.\n` +
        `Logg inn med Google-kontoen din (${email}) her: ${url}\n\n` +
        `— Fablab Design\n\n----\n\nHi,\n\nYou've been added as a team member in the ` +
        `Fablab Design Controller. Sign in with your Google account (${email}) here: ${url}\n\n— Fablab Design`,
      html:
        `<p>Hei,</p><p>Du har blitt lagt til som teammedlem i <strong>Fablab Design Controller</strong>. ` +
        `Logg inn med Google-kontoen din (${email}):</p>` +
        `<p><a href="${url}">${url}</a></p><p>— Fablab Design</p><hr>` +
        `<p>Hi,</p><p>You've been added as a team member in the <strong>Fablab Design Controller</strong>. ` +
        `Sign in with your Google account (${email}):</p>` +
        `<p><a href="${url}">${url}</a></p><p>— Fablab Design</p>`
    });
  }

  revalidatePath('/team');
  return { ok: true };
}

/** Change a member's roles (mirrored to users + staff_allowlist where present). */
export async function updateStaffRoles(
  email: string,
  rawRoles: string[]
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;

  const target = email.trim().toLowerCase();
  const roles = cleanRoles(rawRoles);
  if (!roles.length) {
    return { ok: false, error: 'A member needs at least one role' };
  }
  // Guard against self-lockout: an admin cannot remove their own admin role.
  if (target === admin.email.toLowerCase() && !roles.includes('admin')) {
    return { ok: false, error: 'You cannot remove your own admin role' };
  }

  try {
    await db
      .update(users)
      .set({ roles, updatedAt: new Date() })
      .where(sql`lower(${users.email}) = ${target}`);
    await db
      .update(staffAllowlist)
      .set({ roles, updatedAt: new Date() })
      .where(sql`lower(${staffAllowlist.email}) = ${target}`);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not update roles' };
  }
  revalidatePath('/team');
  return { ok: true };
}

/** Activate or deactivate a member (revokes/restores access). */
export async function setStaffActive(
  email: string,
  active: boolean
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;

  const target = email.trim().toLowerCase();
  if (!active && target === admin.email.toLowerCase()) {
    return { ok: false, error: 'You cannot deactivate your own account' };
  }
  try {
    await db
      .update(users)
      .set({ active, updatedAt: new Date() })
      .where(sql`lower(${users.email}) = ${target}`);
    await db
      .update(staffAllowlist)
      .set({ active, updatedAt: new Date() })
      .where(sql`lower(${staffAllowlist.email}) = ${target}`);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not update status' };
  }
  revalidatePath('/team');
  return { ok: true };
}

/**
 * Remove a member. A pending invite (allowlist only, never signed in) is
 * deleted outright. Someone who has signed in is deactivated instead, because
 * their users row is referenced elsewhere (audit trail, ownership).
 */
export async function removeStaffMember(email: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;

  const target = email.trim().toLowerCase();
  if (target === admin.email.toLowerCase()) {
    return { ok: false, error: 'You cannot remove your own account' };
  }
  try {
    const existing = await usersRowFor(target);
    if (existing) {
      await db
        .update(users)
        .set({ active: false, updatedAt: new Date() })
        .where(sql`lower(${users.email}) = ${target}`);
      await db
        .update(staffAllowlist)
        .set({ active: false, updatedAt: new Date() })
        .where(sql`lower(${staffAllowlist.email}) = ${target}`);
    } else {
      await db
        .delete(staffAllowlist)
        .where(sql`lower(${staffAllowlist.email}) = ${target}`);
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not remove member' };
  }
  revalidatePath('/team');
  return { ok: true };
}
