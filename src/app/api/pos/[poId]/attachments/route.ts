/**
 * POST /api/pos/[poId]/attachments
 *   Mirrors /api/rfqs/[rfqId]/attachments. Client uploads to Supabase Storage
 *   bucket `po-attachments` at
 *   `projects/{projectId}/pos/{poId}/{uuid}-{filename}`, then POSTs metadata
 *   here to create the po_attachments row.
 *
 * DELETE /api/pos/[poId]/attachments?attachmentId=<uuid>
 *   Removes the metadata row + best-effort storage object delete.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db, poAttachments, purchaseOrders } from '@/db';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

const MAX_BYTES = 5 * 1024 * 1024;

const PostBody = z.object({
  filename: z.string().min(1).max(300),
  storagePath: z.string().min(1),
  mimeType: z.string().min(1).max(120),
  sizeBytes: z.number().int().positive().max(MAX_BYTES)
});

export async function POST(
  req: Request,
  context: { params: Promise<{ poId: string }> }
) {
  const { poId } = await context.params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: z.infer<typeof PostBody>;
  try {
    body = PostBody.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'Bad request', detail: err instanceof Error ? err.message : 'invalid body' },
      { status: 400 }
    );
  }

  const [po] = await db.select({ id: purchaseOrders.id })
    .from(purchaseOrders).where(eq(purchaseOrders.id, poId)).limit(1);
  if (!po) return NextResponse.json({ error: 'PO not found' }, { status: 404 });

  const [row] = await db.insert(poAttachments).values({
    poId,
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
  context: { params: Promise<{ poId: string }> }
) {
  const { poId } = await context.params;
  const url = new URL(req.url);
  const attachmentId = url.searchParams.get('attachmentId');
  if (!attachmentId) {
    return NextResponse.json({ error: 'attachmentId required' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [row] = await db.select().from(poAttachments).where(
    and(eq(poAttachments.id, attachmentId), eq(poAttachments.poId, poId))
  ).limit(1);
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  try {
    await supabase.storage.from('po-attachments').remove([row.storagePath]);
  } catch {
    // ignore
  }
  await db.delete(poAttachments).where(eq(poAttachments.id, attachmentId));

  return NextResponse.json({ ok: true });
}
