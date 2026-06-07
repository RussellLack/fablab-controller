'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { eq, inArray } from 'drizzle-orm';
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

/* ────────────── bulk actions ────────────── */

const PRIORITIES = ['low', 'normal', 'high'] as const;
type Priority = (typeof PRIORITIES)[number];

type BulkResult = { ok: true; affected: number } | { ok: false; error: string };

/**
 * Bulk-set priority on many projects. Common during planning weeks
 * when staff triage a batch of imported PowerOffice projects.
 */
export async function bulkUpdateProjectPriority(
  ids: string[],
  newPriority: string
): Promise<BulkResult> {
  const user = await getCurrentUser();
  if (!user || !isStaffEmail(user.email)) {
    return { ok: false, error: 'Not authorised' };
  }
  if (!ids.length) return { ok: false, error: 'No ids provided' };
  if (!PRIORITIES.includes(newPriority as Priority)) {
    return { ok: false, error: 'Invalid priority' };
  }

  const before = await db
    .select({ id: projects.id, priority: projects.priority })
    .from(projects)
    .where(inArray(projects.id, ids));

  await db
    .update(projects)
    .set({ priority: newPriority as Priority, updatedAt: new Date() })
    .where(inArray(projects.id, ids));

  const auditRows = before
    .filter((b) => b.priority !== newPriority)
    .map((b) => ({
      entityType: 'project',
      entityId: b.id,
      actorId: user.id,
      action: 'update_metadata',
      before: { priority: b.priority },
      after: { priority: newPriority }
    }));
  if (auditRows.length) await db.insert(auditLogs).values(auditRows);

  revalidatePath('/projects');
  return { ok: true, affected: ids.length };
}
