import { db, packages } from '@/db';
import { eq, asc } from 'drizzle-orm';
import { getTranslations } from 'next-intl/server';
import { ItemForm } from './form-client';

async function getPackages(projectId: string) {
  if (!process.env.DATABASE_URL) return [];
  try {
    return await db.select({ id: packages.id, name: packages.name }).from(packages)
      .where(eq(packages.projectId, projectId)).orderBy(asc(packages.sequence));
  } catch { return []; }
}

export default async function NewItemPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ packageId?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const pkgs = await getPackages(id);
  const t = await getTranslations();
  return (
    <>
      <h2 className="text-[18px] font-semibold mb-4">{t('item.new_title')}</h2>
      <p className="text-ink-2 text-[13px] mb-6">{t('item.new_sub')}</p>
      <ItemForm projectId={id} packages={pkgs} defaultPackageId={sp.packageId} />
    </>
  );
}
