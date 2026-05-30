import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { formatMoney, formatDate } from '@/lib/utils';
import { getProject } from './queries';

export default async function ProjectBriefPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await getProject(id);
  if (!p) notFound();
  const t = await getTranslations();

  return (
    <div className="grid grid-cols-[2fr_1fr] gap-6">
      <div className="card">
        <h3 className="card-title mb-3">{t('proj.brief')}</h3>
        <p className="text-[13px] leading-6">{p.description ?? '—'}</p>
      </div>
      <div>
        <div className="card">
          <h3 className="card-title mb-3">{t('proj.details')}</h3>
          <dl className="grid grid-cols-[140px_1fr] gap-y-1 gap-x-4 text-[13px]">
            <dt className="text-ink-3">{t('proj.client')}</dt><dd>{p.clientName ?? '—'}</dd>
            <dt className="text-ink-3">{t('proj.contact')}</dt><dd>{p.clientContact ?? '—'}</dd>
            <dt className="text-ink-3">{t('proj.type')}</dt><dd>{t(`type.${p.projectType}`)}</dd>
            <dt className="text-ink-3">{t('proj.budget')}</dt>
            <dd>{formatMoney(p.budget, p.budgetCurrency ?? 'NOK')}</dd>
            <dt className="text-ink-3">{t('proj.handover')}</dt>
            <dd>{formatDate(p.targetHandoverDate)}</dd>
          </dl>
        </div>
      </div>
    </div>
  );
}
