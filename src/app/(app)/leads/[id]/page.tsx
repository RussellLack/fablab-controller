import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db, leads } from '@/db';
import { eq } from 'drizzle-orm';
import { getTranslations } from 'next-intl/server';
import { intakeCompleteness, missingIntakeFields } from '@/lib/validations/lead';
import { IntakeMeter } from '@/components/intake-meter';
import { LeadIntakeClient } from './intake-client';

async function getLead(id: string) {
  if (!process.env.DATABASE_URL) return null;
  try {
    const [row] = await db.select().from(leads).where(eq(leads.id, id)).limit(1);
    return row ?? null;
  } catch {
    return null;
  }
}

export default async function LeadIntakePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lead = await getLead(id);
  if (!lead) notFound();
  const t = await getTranslations();
  const meter = intakeCompleteness(lead as unknown as Record<string, unknown>);
  const missing = missingIntakeFields(lead as unknown as Record<string, unknown>);

  return (
    <>
      <div className="text-xs text-ink-3 mb-1.5">
        <Link href="/leads" className="hover:text-ink">{t('crumbs.leads')}</Link>{' / '}
        {lead.reference}
      </div>

      <LeadIntakeClient lead={lead as unknown as Record<string, unknown>} missing={missing} meter={meter} />
    </>
  );
}
