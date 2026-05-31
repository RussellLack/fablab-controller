/**
 * POST /api/items/[itemId]/images
 *
 * Called by the client AFTER all three blobs (original / processed / thumb)
 * have been uploaded directly to Supabase Storage from the browser. The
 * client passes the resulting storage paths; this endpoint:
 *   1. Verifies the caller is authenticated
 *   2. Verifies the item exists and belongs to a project the user can access
 *      (TODO: project membership check — currently any authenticated user;
 *      sufficient for staff-only v1)
 *   3. Creates the item_images row
 *   4. Sets items.primary_image_id (replacing any previous primary)
 *
 * Returns the created row.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db, items, itemImages } from '@/db';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const Body = z.object({
  originalBlobUri: z.string().min(1),
  processedBlobUri: z.string().optional().nullable(),
  thumbnailBlobUri: z.string().optional().nullable(),
  originalMime: z.string().min(1),
  originalBytes: z.number().int().positive().max(5 * 1024 * 1024),  // 5 MB hard limit (v7 spec)
  processedBytes: z.number().int().nonnegative().optional().nullable(),
  widthPx: z.number().int().positive().max(8000).optional().nullable(),
  heightPx: z.number().int().positive().max(8000).optional().nullable(),
  backgroundRemoved: z.boolean().optional(),
  caption: z.string().max(300).optional().nullable(),
  setAsPrimary: z.boolean().optional().default(true)
});

export async function POST(
  req: Request,
  context: { params: Promise<{ itemId: string }> }
) {
  const { itemId } = await context.params;

  // Auth check
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Parse + validate body
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'Bad request', detail: err instanceof Error ? err.message : 'invalid body' },
      { status: 400 }
    );
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: 'DB not configured' }, { status: 500 });
  }

  // Verify item exists
  const found = await db.select({ id: items.id }).from(items).where(eq(items.id, itemId)).limit(1);
  if (found.length === 0) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 });
  }

  // Insert the image row
  const [inserted] = await db.insert(itemImages).values({
    itemId,
    originalBlobUri: body.originalBlobUri,
    processedBlobUri: body.processedBlobUri ?? null,
    thumbnailBlobUri: body.thumbnailBlobUri ?? null,
    originalMime: body.originalMime,
    originalBytes: body.originalBytes,
    processedBytes: body.processedBytes ?? null,
    widthPx: body.widthPx ?? null,
    heightPx: body.heightPx ?? null,
    backgroundRemovedAt: body.backgroundRemoved ? new Date() : null,
    uploadedBy: user.id,
    caption: body.caption ?? null,
    displayOrder: 0
  }).returning();

  // Optionally set as primary image on the item
  if (body.setAsPrimary && inserted) {
    await db.update(items)
      .set({ primaryImageId: inserted.id, updatedAt: new Date() })
      .where(eq(items.id, itemId));
  }

  return NextResponse.json({ image: inserted });
}
