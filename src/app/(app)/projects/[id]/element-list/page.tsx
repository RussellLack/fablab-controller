import { redirect } from 'next/navigation';

export default async function ElementListIndex({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/projects/${id}/element-list/internal`);
}
