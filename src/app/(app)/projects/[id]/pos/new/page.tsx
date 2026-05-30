import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { db, projects, vendors, items, packages, quotes, approvals } from '@/db';
import { eq, and, sql } from 'drizzle-orm';
import { NewPoForm } from './form-client';

async function getCandidates(projectId: string) {
  if (!process.env.DATABASE_URL) return null;
  try {
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    if (!project) return null;

    // Vendors who have at least one winning quote on this project's items NOT yet on a non-cancelled PO
    const vendorRows = await db.execute<{ id: string; name: string; item_count: number }>(
      sql`SELECT v.id, v.name, COUNT(*)::int AS item_count
          FROM vendors v
          JOIN quotes q ON q.vendor_id = v.id AND q.status = 'winning'
          JOIN items i ON i.winning_quote_id = q.id
          JOIN packages p ON p.id = i.package_id
          WHERE p.project_id = ${projectId}
            AND NOT EXISTS (
              SELECT 1 FROM purchase_order_lines pol
              JOIN purchase_orders po ON po.id = pol.purchase_order_id
              WHERE pol.item_id = i.id AND po.status != 'cancelled'
            )
          GROUP BY v.id, v.name
          ORDER BY v.name`
    );

    // Approved approvals (for the authorising-approval picker)
    const approvalRows = await db.select({
      id: approvals.id, reference: approvals.reference, subject: approvals.subject
    }).from(approvals).where(and(
      eq(approvals.projectId, projectId),
      sql`${approvals.status} IN ('approved', 'approved_with_conditions')`
    ));

    return { project, vendors: vendorRows, approvals: approvalRows };
  } catch { return null; }
}

export default async function NewPoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getCandidates(id);
  if (!data) notFound();
  const t = await getTranslations();
  return (
    <>
      <h2 className="text-[18px] font-semibold mb-1">{t('po.new_title')}</h2>
      <p className="text-ink-2 text-[13px] mb-6">{t('po.new_sub')}</p>
      <NewPoForm
        projectId={data.project.id}
        projectRef={data.project.reference}
        siteAddress={data.project.siteAddress}
        vendors={data.vendors}
        approvals={data.approvals}
      />
    </>
  );
}
