/**
 * POST   /api/portal/projects/[id]/uploads
 *   Called by the customer's browser AFTER it has uploaded the file
 *   directly to Supabase Storage (bucket: `customer-uploads`, path:
 *   `projects/{projectId}/customer/{uuid}-{filename}`). Body carries
 *   the metadata; this endpoint creates the `project_customer_uploads`
 *   row.
 *
 * DELETE /api/portal/projects/[id]/uploads?uploadId=<uuid>
 *   Customer removes their own upload (metadata + best-effort storage
 *   object). Customers can ONLY delete files they uploaded themselves.
 *
 * Auth contract:
 *   - Caller must be signed in (Supabase Auth).
 *   - Caller's email must NOT be a Fablab staff domain — staff use the
 *     normal staff UI; the portal API is for customers only.
 *   - Caller must have an active (non-revoked) invitation for the
 *     project they're uploading to.
 *
 * Mirrors the rfq-attachments pattern (direct-to-Supabase upload +
 * server-side metadata write) but with per-project authz enforced.
 */

import { NextResponse } from 'next/server';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db, projectCustomerInvitations, projectCustomerUploads } from '@/db';
import { createClient } from '@/lib/supabase/server';
import { isStaffAllowed } from '@/lib/staff-access';

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB — matches RFQ/PO attachment cap.

const PostBody = z.object({
  filename: z.string().min(1).max(300),
  storagePath: z.string().min(1),
  mimeType: z.string().min(1).max(120),
  sizeBytes: z.number().int().positive().max(MAX_BYTES),
  caption: z.string().max(1000).nullable().optional()
});

async function assertCustomerWithInvitation(
  projectId: string
): Promise<
  | { ok: true; userId: string; email: string }
  | { ok: false; status: number; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user?.id || !user.email) {
    return { ok: false, status: 401, error: 'Not authenticated' };
  }
  if ((await isStaffAllowed(user.email))) {
    return {
      ok: false,
      status: 403,
      error: 'Staff cannot upload to the customer portal'
    };
  }

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
    // Don't leak project existence — same shape as a missing project.
    return { ok: false, status: 404, error: 'Not found' };
  }

  return { ok: true, userId: user.id, email: user.email };
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await context.params;
  const auth = await assertCustomerWithInvitation(projectId);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: z.infer<typeof PostBody>;
  try {
    body = PostBody.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      {
        error: 'Bad request',
        detail: err instanceof Error ? err.message : 'invalid body'
      },
      { status: 400 }
    );
  }

  // Enforce the path prefix so a misbehaving client can't register a
  // metadata row pointing at someone else's project's storage.
  const expectedPrefix = `projects/${projectId}/customer/`;
  if (!body.storagePath.startsWith(expectedPrefix)) {
    return NextResponse.json(
      { error: 'storagePath must live under this project' },
      { status: 400 }
    );
  }

  const [row] = await db
    .insert(projectCustomerUploads)
    .values({
      projectId,
      uploadedBy: auth.userId,
      filename: body.filename,
      storagePath: body.storagePath,
      mimeType: body.mimeType,
      sizeBytes: body.sizeBytes,
      caption: body.caption ?? null
    })
    .returning();

  return NextResponse.json({ ok: true, upload: row });
}

export async function DELETE(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await context.params;
  const url = new URL(req.url);
  const uploadId = url.searchParams.get('uploadId');
  if (!uploadId) {
    return NextResponse.json({ error: 'uploadId required' }, { status: 400 });
  }

  const auth = await assertCustomerWithInvitation(projectId);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const [row] = await db
    .select()
    .from(projectCustomerUploads)
    .where(
      and(
        eq(projectCustomerUploads.id, uploadId),
        eq(projectCustomerUploads.projectId, projectId)
      )
    )
    .limit(1);
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Customers can only delete what they uploaded themselves. (Staff
  // deletion would go through a different route — currently out of
  // scope; deletions on the customer side are the rare case.)
  if (row.uploadedBy !== auth.userId) {
    return NextResponse.json(
      { error: 'You can only remove files you uploaded' },
      { status: 403 }
    );
  }

  const supabase = await createClient();
  try {
    await supabase.storage.from('customer-uploads').remove([row.storagePath]);
  } catch {
    // Best-effort — orphan objects are tolerable.
  }
  await db
    .delete(projectCustomerUploads)
    .where(eq(projectCustomerUploads.id, uploadId));

  return NextResponse.json({ ok: true });
}
