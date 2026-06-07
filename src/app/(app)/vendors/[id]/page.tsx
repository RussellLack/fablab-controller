import { VendorDetailPanel } from '../detail-panel';

export default async function VendorDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <VendorDetailPanel vendorId={id} mode="page" />;
}
