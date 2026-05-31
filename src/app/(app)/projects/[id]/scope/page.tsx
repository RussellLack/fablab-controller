import { ComingSoon } from '@/components/coming-soon';
import { NextActionBanner } from '@/components/next-action-banner';

export default async function ProjectScopePage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <>
      <NextActionBanner projectId={id} gate="scope" />
      <ComingSoon titleKey="tab.scope" />
    </>
  );
}
