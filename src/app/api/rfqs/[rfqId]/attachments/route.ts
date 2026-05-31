/**
 * POST /api/rfqs/[rfqId]/attachments
 *   Called by the client AFTER it has uploaded the file directly to Supabase
 *   Storage (bucket: `rfq-attachments`, path:
 *   `projects/{projectId}/rfqs/{rfqId}/{uuid}-{filename}`). Body carries the
 *   metadata; this endpoint creates the `rfq_attachments` row.
 *
 * DELETE /api/rfqs/[rfqId]/attachments?attachmentId=<uuid>
 *   Removes the metadata row + tries to delete the storage object.
 *
 * Same auth/access pattern as /api/items/[itemId]/images: any signed-in
 * staff user can attach/remove on any RFQ (project-membership check is
 * TODO).
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db, rfqAttachments, rfqs } from '@/db';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

const MAX_BYTES = 5 * 1024 * 1024;          // 5 MB per file (consistent with image upload)

const PostBody = z.object({
  filename: z.string().min(1).max(300),
  storagePath: z.string().min(1),
  mimeType: z.string().min(1).max(120),
  sizeBytes: z.number().int().positive().max(MAX_BYTES)
});

export async function POST(
  req: Request,
  context: { params: Promise<{ rfqId: string }> }
) {
  const { rfqId } = await context.params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: z.infer<typeof PostBody>;
  try {
    body = PostBody.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'Bad request', detail: err instanceof Error ? err.message : 'invalid body' },
      { status: 400 }
    );
  }

  // Verify the RFQ exists
  const [rfq] = await db.select({ id: rfqs.id, status: rfqs.status })
    .from(rfqs).where(eq(rfqs.id, rfqId)).limit(1);
  if (!rfq) return NextResponse.json({ error: 'RFQ not found' }, { status: 404 });

  const [row] = await db.insert(rfqAttachments).values({
    rfqId,
    filename: body.filename,
    storagePath: body.storagePath,
    mimeType: body.mimeType,
    sizeBytes: body.sizeBytes,
    uploadedBy: user.id
  }).returning();

  return NextResponse.json({ ok: true, attachment: row });
}

export async function DELETE(
  req: Request,
  context: { params: Promise<{ rfqId: string }> }
) {
  const { rfqId } = await context.params;
  const url = new URL(req.url);
  const attachmentId = url.searchParams.get('attachmentId');
  if (!attachmentId) {
    return NextResponse.json({ error: 'attachmentId required' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [row] = await db.select().from(rfqAttachments).where(
    and(eq(rfqAttachments.id, attachmentId), eq(rfqAttachments.rfqId, rfqId))
  ).limit(1);
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Best-effort storage object delete — don't fail if it's already gone
  try {
    await supabase.storage.from('rfq-attachments').remove([row.storagePath]);
  } catch {
    // ignore
  }

  await db.delete(rfqAttachments).where(eq(rfqAttachments.id, attachmentId));

  return NextResponse.json({ ok: true });
}
