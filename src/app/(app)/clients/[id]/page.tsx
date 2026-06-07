import { ClientDetailPanel } from '../detail-panel';

/**
 * Standalone full-page detail for a client. The actual content lives
 * in <ClientDetailPanel mode="page" /> so it can also be rendered
 * inline by the /clients explorer in split view.
 */
export default async function ClientDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ClientDetailPanel clientId={id} mode="page" />;
}
