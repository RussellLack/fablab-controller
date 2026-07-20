import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db, leads } from '@/db';
import { leadDraftSchema } from '@/lib/validations/lead';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Public intake endpoint, creates a website-source lead.
 * Called server-to-server by the marketing site's /api/onboarding forwarder,
 * gated by the x-intake-secret header. Middleware exempts /api/public/*.
 */

async function nextLeadReference(): Promise<string> {
  const year = new Date().getFullYear();
  const [row] = await db.execute<{ next: number }>(
    sql`SELECT COALESCE(MAX(CAST(SUBSTRING(reference FROM '[0-9]+$') AS INTEGER)), 0) + 1 AS next
        FROM leads WHERE reference LIKE ${'LEAD-' + year + '-%'}`
  );
  return `LEAD-${year}-${String(row?.next ?? 1).padStart(4, '0')}`;
}

export async function POST(request: Request) {
  const secret = process.env.INTAKE_SHARED_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: 'Intake not configured' }, { status: 503 });
  }
  if (request.headers.get('x-intake-secret') !== secret) {
    return NextResponse.json({ ok: false, error: 'Unauthorised' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = leadDraftSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'Invalid input', fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }
  const d = parsed.data;

  if (!d.prospectiveClientName && !d.primaryContactEmail && !d.desiredOutcome) {
    return NextResponse.json({ ok: false, error: 'Empty intake' }, { status: 400 });
  }

  try {
    const reference = await nextLeadReference();
    const [row] = await db.insert(leads).values({
      reference,
      source: 'website',
      status: 'new',
      prospectiveClientName: d.prospectiveClientName ?? null,
      clientKind: d.clientKind ?? null,
      primaryContactName: d.primaryContactName ?? null,
      primaryContactEmail: d.primaryContactEmail || null,
      primaryContactPhone: d.primaryContactPhone ?? null,
      propertyAddress: d.propertyAddress ?? null,
      projectType: d.projectType ?? null,
      roomsOrZones: d.roomsOrZones ?? null,
      desiredOutcome: d.desiredOutcome ?? null,
      budgetExpectation: d.budgetExpectation?.toString() ?? null,
      budgetCurrency: d.budgetCurrency ?? 'NOK',
      timelineExpectation: d.timelineExpectation ?? null,
      decisionMakers: d.decisionMakers ?? null,
      approvalProcess: d.approvalProcess ?? null,
      existingSuppliers: d.existingSuppliers ?? null,
      knownConstraints: d.knownConstraints ?? null,
      designStylePreferences: d.designStylePreferences ?? null,
      procurementExpectations: d.procurementExpectations ?? null,
      deliveryInstallExpectations: d.deliveryInstallExpectations ?? null,
      fablabExpectedRole: d.fablabExpectedRole ?? null,
      notes: d.notes ?? null
    }).returning({ id: leads.id, reference: leads.reference });

    if (!row) return NextResponse.json({ ok: false, error: 'Insert failed' }, { status: 500 });
    return NextResponse.json({ ok: true, id: row.id, reference: row.reference });
  } catch {
    return NextResponse.json({ ok: false, error: 'Could not save intake' }, { status: 500 });
  }
}
