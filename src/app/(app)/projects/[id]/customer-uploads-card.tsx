import { desc, eq } from 'drizzle-orm';
import { getTranslations } from 'next-intl/server';
import { db, projectCustomerUploads } from '@/db';
import { formatDate } from '@/lib/utils';
import { StaffCustomerUploadDownload } from './staff-customer-upload-download';

/**
 * Staff-side read-only list of files customers have uploaded for this
 * project. Sits next to the Customer activity card on the project Brief
 * page. Customer uploads land here via the portal (B3).
 *
 * Download is via the client `<StaffCustomerUploadDownload>` button — it
 * generates a short-lived signed URL from the browser's Supabase session
 * (staff bucket policy allows authenticated reads). Staff cannot delete
 * customer uploads here; the API only permits owner-deletes.
 */
export async function CustomerUploadsCard({ projectId }: { projectId: string }) {
  const t = await getTranslations();

  const rows = await db
    .select({
      id: projectCustomerUploads.id,
      filename: projectCustomerUploads.filename,
      storagePath: projectCustomerUploads.storagePath,
      sizeBytes: projectCustomerUploads.sizeBytes,
      createdAt: projectCustomerUploads.createdAt
    })
    .from(projectCustomerUploads)
    .where(eq(projectCustomerUploads.projectId, projectId))
    .orderBy(desc(projectCustomerUploads.createdAt));

  return (
    <div className="card">
      <h3 className="card-title mb-2">{t('customer_uploads_staff.title')}</h3>
      <p className="text-[12px] text-ink-2 mb-3 leading-snug">
        {t('customer_uploads_staff.help')}
      </p>

      {rows.length === 0 ? (
        <p className="text-[12px] text-ink-3 italic">
          {t('customer_uploads_staff.empty')}
        </p>
      ) : (
        <ul className="space-y-1">
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex items-center gap-2 text-[13px] py-1.5 border-b border-line last:border-0"
            >
              <StaffCustomerUploadDownload
                storagePath={r.storagePath}
                filename={r.filename}
              />
              <span className="text-[11px] text-ink-3">
                {formatBytes(r.sizeBytes)}
              </span>
              <span className="text-[11px] text-ink-3">
                {formatDate(r.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
