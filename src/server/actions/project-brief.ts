'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db, projects } from '@/db';
import { createClient as supabaseServer } from '@/lib/supabase/server';

type ActionResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

const ALLOWED_ROLES = [
  'design_advisory_only',
  'design_and_specification',
  'procurement_support',
  'procurement_and_resale',
  'supplier_coordination',
  'delivery_coordination',
  'installation_coordination',
  'full_project_control'
] as const;

/**
 * Atomic update of the two project-level Brief fields the Brief wizard
 * (W4) lets the user edit: description and fablabRole.
 *
 * Other intake data (the 16 fields) lives on the originating lead and
 * is not editable here — the wizard surfaces it as read-only context.
 *
 * The third Brief gate criterion (an approved scope-target Approval) is
 * a separate Approvals workflow; this action does NOT create approvals.
 */
export async function updateProjectBrief(
  projectId: string,
  formData: FormData
): Promise<ActionResult> {
  const supabase = await supabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user?.id) return { ok: false, error: 'Not authenticated' };

  const description = formData.get('description')?.toString().trim() ?? '';
  const fablabRole = formData.get('fablabRole')?.toString() ?? '';

  if (!description) {
    return {
      ok: false,
      error: 'Description is required to complete the Brief gate.',
      fieldErrors: { description: ['Description is required'] }
    };
  }
  if (!ALLOWED_ROLES.includes(fablabRole as (typeof ALLOWED_ROLES)[number])) {
    return {
      ok: false,
      error: 'Fablab role is invalid.',
      fieldErrors: { fablabRole: ['Pick a Fablab role'] }
    };
  }

  try {
    await db
      .update(projects)
      .set({
        description,
        fablabRole: fablabRole as (typeof ALLOWED_ROLES)[number],
        updatedAt: new Date()
      })
      .where(eq(projects.id, projectId));

    revalidatePath(`/projects/${projectId}`);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Unknown error updating brief'
    };
  }
}
