'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db, projects, auditLogs } from '@/db';
import { getCurrentUser } from '@/lib/supabase/server';
import { isStaffEmail } from '@/lib/auth-helpers';
import { projectEditSchema } from '@/lib/validations/project-edit';

type ActionResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

/**
 * Update project metadata. Stage transitions are intentionally not
 * exposed via this action — those go through the lifecycle UI
 * (Advance / Hold buttons) which enforces gate validation, scope
 * baselines, and other workflow rules. This action is for the
 * "what is this project" attributes, not the "where is it in its
 * lifecycle" attributes.
 */
export async function updateProjectMetadata(
  projectId: string,
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user || !isStaffEmail(user.email)) {
    return { ok: false, error: 'Not authorised' };
  }

  const raw = Object.fromEntries(formData.entries());
  const parsed = projectEditSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Validation failed',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>
    };
  }

  const [before] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!before) return { ok: false, error: 'Project not found' };

  const d = parsed.data;
  const next = {
    title: d.title,
    description: d.description || null,
    projectType: d.projectType,
    fablabRole: d.fablabRole,
    priority: d.priority,
    siteAddress: d.siteAddress || null,
    budget: d.budget != null ? String(d.budget) : null,
    budgetCurrency: d.budgetCurrency,
    targetHandoverDate: d.targetHandoverDate || null
  };

  await db
    .update(projects)
    .set({ ...next, updatedAt: new Date() })
    .where(eq(projects.id, projectId));

  const diff: Record<string, { before: unknown; after: unknown }> = {};
  const norm = (v: unknown) => (v === undefined || v === '' ? null : v);
  for (const key of Object.keys(next) as (keyof typeof next)[]) {
    const b = (before as Record<string, unknown>)[key];
    const a = next[key];
    if (norm(b) === norm(a)) continue;
    // Budget is stored as numeric string in Postgres; normalise both
    // to numbers for the diff comparison so 100 === '100'.
    if (key === 'budget') {
      if (Number(b ?? 0) === Number(a ?? 0)) continue;
    }
    diff[key] = { before: b, after: a };
  }
  if (Object.keys(diff).length > 0) {
    await db.insert(auditLogs).values({
      entityType: 'project',
      entityId: projectId,
      actorId: user.id,
      action: 'update_metadata',
      before: Object.fromEntries(Object.entries(diff).map(([k, v]) => [k, v.before])),
      after: Object.fromEntries(Object.entries(diff).map(([k, v]) => [k, v.after]))
    });
  }

  revalidatePath(`/projects/${projectId}`);
  revalidatePath('/projects');
  redirect(`/projects/${projectId}`);
}
