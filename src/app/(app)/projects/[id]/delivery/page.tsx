import { ComingSoon } from '@/components/coming-soon';
import { NextActionBanner } from '@/components/next-action-banner';

export default async function ProjectDeliveryPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <>
      <NextActionBanner projectId={id} gate="delivery" />
      <ComingSoon titleKey="tab.delivery" />
    </>
  );
}
