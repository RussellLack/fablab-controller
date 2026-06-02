import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { db, projects, leads } from '@/db';
import { eq } from 'drizzle-orm';
import { formatMoney, formatDate } from '@/lib/utils';
import { getProject } from './queries';
import { getProjectGates } from '@/server/queries/project-gates';
import { NextActionBanner } from '@/components/next-action-banner';
import { BriefLauncher } from './brief-launcher';
import { CustomerActivityCard } from './customer-activity-card';
import { CustomerUploadsCard } from './customer-uploads-card';
import type { IntakeContext } from '@/components/wizard/brief-wizard';

type FablabRole =
  | 'design_advisory_only'
  | 'design_and_specification'
  | 'procurement_support'
  | 'procurement_and_resale'
  | 'supplier_coordination'
  | 'delivery_coordination'
  | 'installation_coordination'
  | 'full_project_control';

/** Pull the originating lead's 16 intake fields, if we have a leadId on the project. */
async function getLeadIntake(projectId: string): Promise<IntakeContext | null> {
  if (!process.env.DATABASE_URL) return null;
  try {
    const [proj] = await db
      .select({ leadId: projects.leadId })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    if (!proj?.leadId) return null;

    const [lead] = await db.select().from(leads).where(eq(leads.id, proj.leadId)).limit(1);
    if (!lead) return null;

    return {
      prospectiveClientName: lead.prospectiveClientName,
      clientKind: lead.clientKind,
      primaryContactName: lead.primaryContactName,
      primaryContactEmail: lead.primaryContactEmail,
      primaryContactPhone: lead.primaryContactPhone,
      propertyAddress: lead.propertyAddress,
      projectType: lead.projectType,
      roomsOrZones: lead.roomsOrZones,
      desiredOutcome: lead.desiredOutcome,
      budgetExpectation: lead.budgetExpectation,
      budgetCurrency: lead.budgetCurrency,
      timelineExpectation: lead.timelineExpectation,
      decisionMakers: lead.decisionMakers,
      approvalProcess: lead.approvalProcess,
      existingSuppliers: lead.existingSuppliers,
      knownConstraints: lead.knownConstraints,
      designStylePreferences: lead.designStylePreferences,
      procurementExpectations: lead.procurementExpectations,
      deliveryInstallExpectations: lead.deliveryInstallExpectations,
      fablabExpectedRole: lead.fablabExpectedRole
    };
  } catch {
    return null;
  }
}

export default async function ProjectBriefPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await getProject(id);
  if (!p) notFound();
  const t = await getTranslations();

  const [intake, gates] = await Promise.all([getLeadIntake(id), getProjectGates(id)]);

  // The third Brief gate criterion is "at least one approved scope-target Approval".
  // The Brief gate computation already encodes this in its state — Brief is "done"
  // only when all three criteria pass. We surface the criterion directly so the
  // wizard's gate step can render an accurate live checklist.
  const scopeApprovalApproved =
    gates.brief.state === 'done' || gates.brief.nextActionKey === undefined
      ? gates.brief.state === 'done'
      : // If brief is in_progress and nextActionKey points at the approval one,
        // the approval criterion is the unmet one; otherwise it's done.
        gates.brief.nextActionKey !== 'gate.brief.next_approval';

  return (
    <>
      <NextActionBanner projectId={id} gate="brief" />

      <div className="flex items-end justify-between mb-4 gap-4">
        <p className="text-ink-2 text-[13px]">{t('brief.subtitle')}</p>
        <BriefLauncher
          projectId={id}
          currentDescription={p.description ?? ''}
          currentRole={(p.fablabRole as FablabRole) ?? 'design_advisory_only'}
          intake={intake}
          scopeApprovalApproved={scopeApprovalApproved}
        />
      </div>

      <div className="grid grid-cols-[2fr_1fr] gap-6">
        <div className="space-y-6">
          <div className="card">
            <h3 className="card-title mb-3">{t('proj.brief')}</h3>
            <p className="text-[13px] leading-6 whitespace-pre-wrap">{p.description ?? '—'}</p>
          </div>
          <CustomerActivityCard projectId={id} />
          <CustomerUploadsCard projectId={id} />
        </div>
        <div>
          <div className="card">
            <h3 className="card-title mb-3">{t('proj.details')}</h3>
            <dl className="grid grid-cols-[140px_1fr] gap-y-1 gap-x-4 text-[13px]">
              <dt className="text-ink-3">{t('proj.client')}</dt>
              <dd>{p.clientName ?? '—'}</dd>
              <dt className="text-ink-3">{t('proj.contact')}</dt>
              <dd>{p.clientContact ?? '—'}</dd>
              <dt className="text-ink-3">{t('proj.type')}</dt>
              <dd>{t(`type.${p.projectType}`)}</dd>
              <dt className="text-ink-3">{t('proj.budget')}</dt>
              <dd>{formatMoney(p.budget, p.budgetCurrency ?? 'NOK')}</dd>
              <dt className="text-ink-3">{t('proj.handover')}</dt>
              <dd>{formatDate(p.targetHandoverDate)}</dd>
            </dl>
          </div>
        </div>
      </div>
    </>
  );
}
