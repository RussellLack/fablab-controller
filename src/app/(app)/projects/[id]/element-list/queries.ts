/**
 * Element List — server queries.
 *
 * One canonical query fetches all the data the three views need (items +
 * package + room + winning quote + vendor). Each view route then masks
 * what it shows; nothing is filtered from the DB just based on view.
 *
 * Performance budget: ~80 items per project, single project fetch on each
 * Element List load. No need for caching beyond what React's cache() provides.
 */

import { cache } from 'react';
import { db, items, packages, rooms, quotes, vendors, projects, itemImages } from '@/db';
import { eq, and, inArray } from 'drizzle-orm';

export type ElementListItemRow = {
  id: string;
  packageId: string;
  packageName: string | null;
  roomId: string | null;
  roomName: string | null;
  name: string;
  description: string | null;
  manufacturer: string | null;
  sku: string | null;
  material: string | null;
  colour: string | null;
  quantity: string;                 // numeric stored as string by drizzle
  unit: string;
  status: string;
  costState: string;
  vendorId: string | null;
  vendorName: string | null;
  unitCost: string | null;          // from winning quote
  unitCostCurrency: string | null;
  targetMarginPct: string | null;
  clientPrice: string | null;       // manual override (used when no winning quote)
  discountPct: string | null;
  discountAmount: string | null;
  discountReason: string | null;
  showOnCustomerView: boolean;
  primaryImageId: string | null;
  thumbUrl: string | null;            // Wave 5 — surfaced for rendering thumbs in the list
  processedUrl: string | null;        // larger view (transparent PNG) — used by PDF / print
};

export type ElementListData = {
  project: {
    id: string;
    reference: string;
    title: string;
    vatRate: string;
    defaultDiscountPct: string | null;
    deliveryCountry: string | null;
    budgetCurrency: string;
  };
  items: ElementListItemRow[];
};

/**
 * Fetch all the data needed for the Element List, regardless of which view
 * will render it. View routes filter / mask on top of this.
 */
export const getElementListData = cache(async (projectId: string): Promise<ElementListData | null> => {
  if (!process.env.DATABASE_URL) return null;

  try {
    // 1) Project
    const proj = await db.select({
      id: projects.id,
      reference: projects.reference,
      title: projects.title,
      vatRate: projects.vatRate,
      defaultDiscountPct: projects.defaultDiscountPct,
      deliveryCountry: projects.deliveryCountry,
      budgetCurrency: projects.budgetCurrency
    }).from(projects).where(eq(projects.id, projectId)).limit(1);

    if (proj.length === 0) return null;

    // 2) Packages for this project (for joining)
    const pkgs = await db.select({
      id: packages.id, name: packages.name
    }).from(packages).where(eq(packages.projectId, projectId));

    if (pkgs.length === 0) {
      return { project: proj[0]!, items: [] };
    }

    const pkgIds = pkgs.map(p => p.id);
    const pkgNameById = new Map(pkgs.map(p => [p.id, p.name]));

    // 3) Items in those packages
    const rawItems = await db.select().from(items).where(inArray(items.packageId, pkgIds));

    if (rawItems.length === 0) {
      return { project: proj[0]!, items: [] };
    }

    // 4) Winning quotes (and their vendor) for these items
    const winningQuoteIds = rawItems
      .map(i => i.winningQuoteId)
      .filter((q): q is string => q !== null);

    let quoteVendorByItemId = new Map<string, {
      vendorId: string | null;
      vendorName: string | null;
      unitCost: string | null;
      unitCostCurrency: string | null;
    }>();

    if (winningQuoteIds.length > 0) {
      const quoteRows = await db.select({
        id: quotes.id,
        itemId: quotes.itemId,
        unitCost: quotes.unitCost,
        currency: quotes.currency,
        vendorId: vendors.id,
        vendorName: vendors.name
      })
        .from(quotes)
        .leftJoin(vendors, eq(quotes.vendorId, vendors.id))
        .where(inArray(quotes.id, winningQuoteIds));

      quoteVendorByItemId = new Map(quoteRows.map(q => [q.itemId, {
        vendorId: q.vendorId,
        vendorName: q.vendorName,
        unitCost: q.unitCost,
        unitCostCurrency: q.currency
      }]));
    }

    // 5) Room names (optional; only for items with roomId set)
    const roomIds = Array.from(new Set(rawItems.map(i => i.roomId).filter((r): r is string => r !== null)));
    let roomNameById = new Map<string, string>();
    if (roomIds.length > 0) {
      const roomRows = await db.select({ id: rooms.id, name: rooms.name })
        .from(rooms).where(inArray(rooms.id, roomIds));
      roomNameById = new Map(roomRows.map(r => [r.id, r.name]));
    }

    // 5b) Primary image URLs by item id
    const imageIds = Array.from(new Set(rawItems.map(i => i.primaryImageId).filter((id): id is string => id !== null)));
    const imageById = new Map<string, { thumbUrl: string | null; processedUrl: string | null }>();
    if (imageIds.length > 0) {
      const imgRows = await db.select({
        id: itemImages.id,
        thumbnailBlobUri: itemImages.thumbnailBlobUri,
        processedBlobUri: itemImages.processedBlobUri,
        originalBlobUri: itemImages.originalBlobUri
      }).from(itemImages).where(inArray(itemImages.id, imageIds));
      for (const img of imgRows) {
        imageById.set(img.id, {
          thumbUrl: img.thumbnailBlobUri ?? img.originalBlobUri,
          processedUrl: img.processedBlobUri ?? img.originalBlobUri
        });
      }
    }

    // 6) Stitch
    const rows: ElementListItemRow[] = rawItems.map(it => {
      const winning = it.winningQuoteId ? quoteVendorByItemId.get(it.id) : null;
      return {
        id: it.id,
        packageId: it.packageId,
        packageName: pkgNameById.get(it.packageId) ?? null,
        roomId: it.roomId,
        roomName: it.roomId ? (roomNameById.get(it.roomId) ?? null) : null,
        name: it.name,
        description: it.description,
        manufacturer: it.manufacturer,
        sku: it.sku,
        material: it.material,
        colour: it.colour,
        quantity: it.quantity,
        unit: it.unit,
        status: it.status,
        costState: it.costState,
        vendorId: winning?.vendorId ?? null,
        vendorName: winning?.vendorName ?? null,
        unitCost: winning?.unitCost ?? null,
        unitCostCurrency: winning?.unitCostCurrency ?? null,
        targetMarginPct: it.targetMarginPct,
        clientPrice: it.clientPrice,
        discountPct: it.discountPct,
        discountAmount: it.discountAmount,
        discountReason: it.discountReason,
        showOnCustomerView: it.showOnCustomerView,
        primaryImageId: it.primaryImageId,
        thumbUrl: it.primaryImageId ? (imageById.get(it.primaryImageId)?.thumbUrl ?? null) : null,
        processedUrl: it.primaryImageId ? (imageById.get(it.primaryImageId)?.processedUrl ?? null) : null
      };
    });

    return { project: proj[0]!, items: rows };
  } catch (err) {
    console.error('[element-list] query failed:', err);
    return null;
  }
});
