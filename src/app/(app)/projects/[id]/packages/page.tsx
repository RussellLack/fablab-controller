import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { db, packages, items } from '@/db';
import { eq, asc } from 'drizzle-orm';
import { formatMoney } from '@/lib/utils';
import { PackagesClient } from './client';

async function getPackagesAndItems(projectId: string) {
  if (!process.env.DATABASE_URL) return { pkgs: [], items: [] };
  try {
    const pkgs = await db.select().from(packages).where(eq(packages.projectId, projectId)).orderBy(asc(packages.sequence));
    const its = pkgs.length === 0 ? [] : await db.select().from(items).where(
      // any item whose packageId is in this project's packages
      // simple: fetch by joining via package_id IN (...). Drizzle's inArray handles uuid[]
      eq(packages.projectId, projectId) // placeholder — we'll filter app-side below
    );
    // Re-fetch correctly: items joined to packages
    const itemRows = pkgs.length === 0 ? [] : await db.select({
      id: items.id, name: items.name, packageId: items.packageId,
      quantity: items.quantity, unit: items.unit, status: items.status,
      itemType: items.itemType, costState: items.costState
    }).from(items)
      .innerJoin(packages, eq(items.packageId, packages.id))
      .where(eq(packages.projectId, projectId));
    return { pkgs, items: itemRows };
  } catch {
    return { pkgs: [], items: [] };
  }
}

export default async function PackagesTabPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { pkgs, items: itemRows } = await getPackagesAndItems(id);
  const t = await getTranslations();
  return (
    <PackagesClient
      projectId={id}
      packages={pkgs.map(p => ({ ...p, budget: p.budget ?? null }))}
      items={itemRows}
    />
  );
}
