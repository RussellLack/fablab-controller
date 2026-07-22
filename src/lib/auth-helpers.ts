/**
 * Auth role discriminator for the staff-vs-customer split.
 *
 * Staff sign in via Google OAuth with hd=fablabdesign.com — every
 * staff email therefore belongs to the Fablab Design Workspace
 * domain. Customers sign in via the email magic-link provider, so
 * their email is whatever address the designer invited.
 *
 * Lives in src/lib so client and server can both use it.
 */

const STAFF_DOMAINS = ['fablabdesign.com'];

// Individually allow-listed staff who sign in with a non-Workspace Google
// account (e.g. a personal gmail). These addresses get full staff access
// even though they don't belong to a STAFF_DOMAINS domain. Keep this list
// short and intentional — every entry here can reach the internal app.
const STAFF_EMAILS = ['maxamundsenlack@gmail.com'];

export function isStaffEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const lower = email.toLowerCase();
  if (STAFF_EMAILS.includes(lower)) return true;
  return STAFF_DOMAINS.some((d) => lower.endsWith('@' + d));
}
