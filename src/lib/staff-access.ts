/**
 * Server-side staff access resolution.
 *
 * The staff-vs-customer gate used to be a pure email check (isStaffEmail):
 * company domain or a small hard-coded allow-list. This module makes it
 * database-driven so admins can add external team members from the Team
 * screen without a code deploy, and can deactivate anyone.
 *
 * Authoritative rule for "is this email allowed into the staff app right now?":
 *   - If a public.users row exists: honour its `active` flag (so an admin can
 *     deactivate any member, domain or external).
 *   - Otherwise (never signed in): allow if the email is company-domain (it
 *     will auto-provision on first sign-in) OR has an active staff_allowlist row.
 *
 * Fails safe: on any DB error it falls back to the synchronous domain/hard-code
 * check, so a database hiccup can never lock the core @fablabdesign.com staff
 * out, and never silently grants access to an unknown external address.
 *
 * Server-only — it imports the Drizzle client. Do not import from a Client
 * Component. Pure email/domain checks live in '@/lib/auth-helpers'.
 */
import { sql } from 'drizzle-orm';
import { db, users, staffAllowlist } from '@/db';
import { isStaffEmail } from '@/lib/auth-helpers';
import { createClient as supabaseServer } from '@/lib/supabase/server';

export type StaffContext = {
  allowed: boolean;
  isAdmin: boolean;
  roles: string[];
  userId: string | null;
};

/** Boolean gate: may this email access the staff app right now? */
export async function isStaffAllowed(
  email: string | null | undefined
): Promise<boolean> {
  if (!email) return false;
  const lower = email.toLowerCase();
  try {
    const [u] = await db
      .select({ active: users.active })
      .from(users)
      .where(sql`lower(${users.email}) = ${lower}`)
      .limit(1);
    if (u) return u.active;
    if (isStaffEmail(lower)) return true;
    const [a] = await db
      .select({ active: staffAllowlist.active })
      .from(staffAllowlist)
      .where(sql`lower(${staffAllowlist.email}) = ${lower}`)
      .limit(1);
    return !!(a && a.active);
  } catch {
    return isStaffEmail(lower);
  }
}

/**
 * Richer resolution used by the app layout and admin guards: one query that
 * yields whether the email is allowed, whether they are an admin, and their
 * roles. `authUserId` (the Supabase auth id) is echoed back for members who
 * are allowed but have no users row yet.
 */
export async function getStaffContext(
  email: string | null | undefined,
  authUserId?: string | null
): Promise<StaffContext> {
  const empty: StaffContext = {
    allowed: false,
    isAdmin: false,
    roles: [],
    userId: authUserId ?? null
  };
  if (!email) return { ...empty, userId: null };
  const lower = email.toLowerCase();
  try {
    const [u] = await db
      .select({ id: users.id, roles: users.roles, active: users.active })
      .from(users)
      .where(sql`lower(${users.email}) = ${lower}`)
      .limit(1);
    if (u) {
      const roles = u.roles ?? [];
      return {
        allowed: u.active,
        isAdmin: roles.includes('admin'),
        roles,
        userId: u.id
      };
    }
    if (isStaffEmail(lower)) {
      return { allowed: true, isAdmin: false, roles: [], userId: authUserId ?? null };
    }
    const [a] = await db
      .select({ roles: staffAllowlist.roles, active: staffAllowlist.active })
      .from(staffAllowlist)
      .where(sql`lower(${staffAllowlist.email}) = ${lower}`)
      .limit(1);
    if (a) {
      const roles = a.roles ?? [];
      return {
        allowed: a.active,
        isAdmin: roles.includes('admin'),
        roles,
        userId: authUserId ?? null
      };
    }
    return empty;
  } catch {
    return {
      allowed: isStaffEmail(lower),
      isAdmin: false,
      roles: [],
      userId: authUserId ?? null
    };
  }
}

/** Guard for admin-only server actions. Resolves the current user + role. */
export async function requireAdmin(): Promise<
  | { ok: true; userId: string; email: string }
  | { ok: false; error: string }
> {
  const supabase = await supabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user?.id || !user.email) return { ok: false, error: 'Not authenticated' };
  const ctx = await getStaffContext(user.email, user.id);
  if (!ctx.allowed) return { ok: false, error: 'Not authorised' };
  if (!ctx.isAdmin) return { ok: false, error: 'Admins only' };
  return { ok: true, userId: user.id, email: user.email };
}
