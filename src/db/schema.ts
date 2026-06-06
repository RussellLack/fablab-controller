/**
 * Fablab Design Controller — Drizzle Schema (v0.8)
 *
 * Canonical implementation of the data model documented in
 * `16-data-model-v6.md`. Every entity from Waves 0–4 is represented.
 *
 * Conventions:
 *   - All tables use uuid PKs with defaultRandom()
 *   - All tables have created_at; mutable tables have updated_at
 *   - Polymorphic FKs use multiple nullable FK columns + DB check constraint
 *   - jsonb is used for structured arrays where querying as relational rows
 *     would explode the schema (e.g. delivery photos, linked_records, tags)
 *   - Enums are defined as pgEnum for type safety + constraint
 *   - Money is stored as numeric(14, 2) (decimal) — never floats
 *
 * Build order: this schema corresponds to v0.8 (feature-complete). For an
 * incremental build, generate migrations wave-by-wave rather than one
 * big initial migration.
 */

import {
  pgTable, pgEnum, uuid, varchar, text, boolean, integer, numeric,
  timestamp, date, jsonb, uniqueIndex, index, primaryKey, check
} from 'drizzle-orm/pg-core';
import { sql, relations } from 'drizzle-orm';

/* ─────────────────────────── ENUMS ─────────────────────────── */

export const userRoleEnum = pgEnum('user_role', [
  'project_lead', 'designer', 'procurement', 'site_coordinator', 'approver', 'admin'
]);
export const localeEnum = pgEnum('locale', ['en', 'no']);

export const leadStatusEnum = pgEnum('lead_status', [
  'new', 'qualifying', 'qualified', 'proposal_sent', 'converted', 'lost', 'archived'
]);
export const leadSourceEnum = pgEnum('lead_source', [
  'referral', 'direct_inquiry', 'repeat_client', 'partner', 'website', 'other'
]);
export const lostReasonEnum = pgEnum('lost_reason', [
  'no_response', 'budget_mismatch', 'timing', 'competitor_won', 'out_of_scope', 'other'
]);

export const clientKindEnum = pgEnum('client_kind', [
  'individual', 'business', 'public_sector', 'cultural_institution', 'hospitality_group'
]);

export const fablabRoleEnum = pgEnum('fablab_role', [
  'design_advisory_only', 'design_and_specification', 'procurement_support',
  'procurement_and_resale', 'supplier_coordination', 'delivery_coordination',
  'installation_coordination', 'full_project_control'
]);

export const projectTypeEnum = pgEnum('project_type', [
  'residential', 'commercial', 'hospitality', 'retail', 'workplace', 'cultural', 'mixed'
]);

export const projectStageEnum = pgEnum('project_stage', [
  'brief', 'concept', 'design_development', 'specification',
  'procurement_production', 'installation', 'handover',
  'on_hold', 'cancelled', 'archived', 'in_dispute'
]);

export const priorityEnum = pgEnum('priority', ['low', 'normal', 'high']);
export const currencyEnum = pgEnum('currency', ['NOK', 'EUR', 'USD', 'GBP', 'SEK', 'DKK']);

export const scopeVersionStatusEnum = pgEnum('scope_version_status', [
  'draft', 'for_review', 'for_approval', 'approved', 'superseded'
]);

export const packageKindEnum = pgEnum('package_kind', ['room', 'category', 'trade', 'phase']);
export const packageStatusEnum = pgEnum('package_status', [
  'draft', 'for_review', 'client_approved', 'in_procurement', 'complete'
]);

export const itemTypeEnum = pgEnum('item_type', ['sourced', 'bespoke']);
export const itemStatusEnum = pgEnum('item_status', [
  'specified', 'quoted', 'ordered', 'in_production', 'ready',
  'shipped', 'received', 'installed', 'signed_off',
  'on_hold', 'substituted', 'cancelled', 'damaged', 'backorder'
]);
export const itemCostStateEnum = pgEnum('item_cost_state', [
  'estimated', 'quoted', 'approved', 'committed', 'landed', 'invoiced', 'paid', 'reconciled'
]);

export const vendorKindEnum = pgEnum('vendor_kind', [
  'supplier', 'fabricator', 'contractor', 'internal_workshop'
]);

export const rfqStatusEnum = pgEnum('rfq_status', [
  'draft', 'sent', 'responses_received', 'evaluating', 'awarded', 'closed_no_award', 'cancelled'
]);
export const quoteStatusEnum = pgEnum('quote_status', [
  'pending', 'received', 'winning', 'lost', 'expired', 'withdrawn'
]);

export const poStatusEnum = pgEnum('po_status', [
  'draft', 'ready_for_review', 'issued', 'confirmed',
  'partially_fulfilled', 'fulfilled', 'cancelled'
]);

export const drawingDisciplineEnum = pgEnum('drawing_discipline', [
  'A', 'I', 'M', 'E', 'S', 'FF', 'BJ'
]);
export const drawingStatusEnum = pgEnum('drawing_status', [
  'wip', 'for_review', 'for_approval', 'for_construction', 'as_built', 'superseded'
]);

export const approvalStatusEnum = pgEnum('approval_status', [
  'draft', 'sent_for_approval', 'approved', 'rejected',
  'approved_with_conditions', 'expired', 'superseded'
]);
export const approvalChannelEnum = pgEnum('approval_channel', [
  'email', 'portal', 'in_person', 'phone_confirmed_in_writing', 'signed_document'
]);

export const changeOrderStatusEnum = pgEnum('change_order_status', [
  'requested', 'under_review', 'priced', 'sent_for_approval',
  'approved', 'rejected', 'implemented', 'closed', 'withdrawn'
]);
export const changeOrderRequestedByEnum = pgEnum('co_requested_by', [
  'client', 'designer', 'vendor', 'site_condition', 'regulatory',
  'cost_pressure', 'client_taste_change', 'other'
]);
export const changeImpactTypeEnum = pgEnum('change_impact_type', [
  'add', 'remove', 'modify_spec', 'modify_qty', 'modify_vendor',
  'modify_price', 'modify_lead_time', 'cascade_delay', 'other'
]);

export const riskCategoryEnum = pgEnum('risk_category', [
  'scope_risk', 'budget_risk', 'supplier_risk', 'freight_risk', 'customs_risk',
  'site_readiness_risk', 'client_approval_risk', 'payment_risk', 'installation_risk',
  'quality_risk', 'legal_contract_risk', 'margin_risk', 'reputation_risk'
]);
export const riskStatusEnum = pgEnum('risk_status', [
  'identified', 'assessed', 'mitigation_planned', 'mitigation_in_progress',
  'mitigated', 'accepted', 'realised', 'closed'
]);
export const riskBandEnum = pgEnum('risk_band', ['low', 'medium', 'high', 'critical']);

export const issueCategoryEnum = pgEnum('issue_category', [
  'supplier_dispute', 'customs_holdup', 'delivery_problem', 'quality_concern',
  'internal_blocker', 'client_friction', 'scope_dispute', 'contract_dispute',
  'technical_issue', 'regulatory_issue', 'financial_dispute', 'other'
]);
export const issueStatusEnum = pgEnum('issue_status', [
  'open', 'investigating', 'pending_external', 'resolved', 'escalated', 'closed'
]);
export const severityEnum = pgEnum('severity', ['low', 'medium', 'high', 'critical']);

export const decisionTypeEnum = pgEnum('decision_type', [
  'commercial', 'design', 'supplier', 'risk_acceptance', 'scope',
  'technical', 'client_management', 'process', 'other'
]);

export const defectTypeEnum = pgEnum('defect_type', [
  'damaged_in_transit', 'wrong_item', 'wrong_qty', 'quality_below_spec',
  'missing_components', 'late_delivery', 'documentation_error',
  'non_conforming_finish', 'other'
]);
export const defectSeverityEnum = pgEnum('defect_severity', [
  'minor', 'moderate', 'major', 'total_loss'
]);
export const defectStatusEnum = pgEnum('defect_status', [
  'raised', 'vendor_notified', 'under_vendor_review', 'accepted_by_vendor',
  'disputed_by_vendor', 'replacement_pending', 'replacement_received',
  'credit_issued', 'refund_received', 'resolved', 'escalated', 'legal'
]);
export const defectResolutionEnum = pgEnum('defect_resolution', [
  'replacement', 'repair', 'credit_note', 'refund', 'partial_credit',
  'accept_as_is', 'escalate'
]);

export const shipmentStatusEnum = pgEnum('shipment_status', [
  'planned', 'dispatched', 'in_transit', 'customs_pending', 'customs_cleared',
  'customs_held', 'at_warehouse', 'out_for_delivery', 'delivered',
  'partially_received', 'rejected', 'returned'
]);
export const shipmentModeEnum = pgEnum('shipment_mode', ['road', 'sea', 'air', 'rail', 'mixed']);
export const shipmentItemStatusEnum = pgEnum('shipment_item_status', [
  'in_transit', 'received', 'damaged', 'missing', 'wrong'
]);
export const deliveryEventTypeEnum = pgEnum('delivery_event_type', [
  'dispatched', 'in_transit', 'customs_entered', 'customs_cleared',
  'customs_held', 'customs_released', 'at_warehouse', 'out_for_delivery',
  'delivered', 'delivery_attempted', 'delivery_failed', 'returned',
  'damaged_in_transit', 'exception'
]);

export const invoiceStatusEnum = pgEnum('invoice_status', [
  'draft', 'issued', 'sent', 'partially_paid', 'paid', 'overdue', 'void'
]);
export const paymentStatusEnum = pgEnum('payment_status', [
  'expected', 'received', 'cleared', 'disputed', 'refunded'
]);
export const paymentMethodEnum = pgEnum('payment_method', [
  'bank_transfer', 'card', 'cheque', 'cash', 'credit_note', 'other'
]);

export const billingTriggerEventEnum = pgEnum('billing_trigger_event', [
  'retainer_due', 'design_phase_started', 'concept_approved', 'scope_signed',
  'procurement_approval_received', 'po_issued', 'supplier_deposit_required',
  'goods_shipped', 'goods_delivered', 'installation_completed',
  'change_order_approved', 'hours_threshold_exceeded', 'final_handover'
]);
export const billingTriggerCalcEnum = pgEnum('billing_trigger_calc', [
  'fixed', 'percent_of_budget', 'percent_of_pos', 'time_and_materials', 'custom'
]);

export const equipmentCategoryEnum = pgEnum('equipment_category', [
  'laser', 'cnc', '3d_printer', 'vinyl', 'electronics',
  'hand_tool', 'finishing', 'other'
]);
export const equipmentStatusEnum = pgEnum('equipment_status', [
  'available', 'maintenance', 'retired'
]);
export const bookingStatusEnum = pgEnum('booking_status', [
  'scheduled', 'in_progress', 'completed', 'cancelled'
]);

export const fileKindEnum = pgEnum('file_kind', [
  'cad', 'pdf', 'image', 'bom', 'specification', 'quote', 'invoice',
  'photograph', 'export', 'template_generated', 'other'
]);

export const timeCategoryEnum = pgEnum('time_category', [
  'design_work', 'client_meetings', 'procurement', 'supplier_coordination',
  'freight_customs', 'site_visits', 'install_coordination', 'admin',
  'rework', 'change_requests', 'non_billable_goodwill'
]);

export const docTemplateSlugEnum = pgEnum('doc_template_slug', [
  'rfq', 'price_request', 'purchase_order', 'installation_order',
  'invoice', 'change_order_request', 'approval_request',
  'letter_of_agreement', 'fee_proposal', 'project_status_report',
  'handover_document', 'defect_notification', 'decline_notification', 'other'
]);
export const docTemplateStatusEnum = pgEnum('doc_template_status', [
  'draft', 'for_review', 'active', 'archived'
]);

export const lessonsStatusEnum = pgEnum('lessons_status', [
  'not_started', 'draft', 'in_review', 'finalised', 'published'
]);

export const translationStatusEnum = pgEnum('translation_status', [
  'mt_only', 'human_reviewed', 'verified'
]);

export const vendorCommStageEnum = pgEnum('vendor_comm_stage', [
  'inquiry', 'rfq', 'quote_response', 'negotiation', 'award_notification',
  'decline_notification', 'po_draft_review', 'po_issued', 'po_confirmation',
  'delivery_update', 'quality_concern', 'payment', 'general'
]);
export const vendorCommChannelEnum = pgEnum('vendor_comm_channel', [
  'email', 'portal', 'phone', 'in_person', 'letter', 'other'
]);
export const vendorCommDirectionEnum = pgEnum('vendor_comm_direction', ['outbound', 'inbound']);

export const stageTransitionDecisionEnum = pgEnum('stage_transition_decision', [
  'advance', 'approve', 'reject', 'request_changes', 'hold',
  'resume', 'dispute', 'archive', 'pass', 'fail'
]);

/* Project Coaching MVP-A — see 28-project-coaching-layer.md §7.1.
 * Note: we deliberately REUSE the existing `timeCategoryEnum` for work
 * type (it covers the same conceptual space). The new addition is the
 * commercial classification — `chargeability_status` — which drives the
 * Work Evidence Summary narrative and the Project Coach dashboard. */
export const evidenceCategoryEnum = pgEnum('evidence_category', [
  'design_progress',
  'project_coordination',
  'decisions_and_approvals',
  'budget_and_scope_control',
  'risks_and_issues',
  'customer_actions_needed',
  'handover'
]);

export const coachRecommendationStatusEnum = pgEnum('coach_recommendation_status', [
  'open',
  'acknowledged',
  'resolved',
  'dismissed'
]);

export const coachRecommendationSeverityEnum = pgEnum('coach_recommendation_severity', [
  'critical',
  'high',
  'medium',
  'low'
]);

export const chargeabilityStatusEnum = pgEnum('time_entry_chargeability', [
  'included',                       // covered by the agreed scope baseline
  'chargeable',                     // additional billable project work
  'change',                         // change-order territory; billable via CO
  'out_of_scope_approval_needed',   // unclear classification; needs CO or scope update
  'goodwill',                       // non-billable, "included at our cost"
  'internal_admin',                 // internal work, never customer-facing
  'rework_fablab',                  // rework caused by us
  'rework_customer',                // rework caused by customer-change
  'rework_supplier'                 // rework caused by supplier issue
]);

/* ─────────────────────────── USERS & AUTH ─────────────────────────── */

/**
 * `users` mirrors `auth.users` from Supabase via id. We don't manage the
 * password column — Supabase Auth does. We extend with app-level roles.
 */
export const users = pgTable('users', {
  id: uuid('id').primaryKey(),                              // == auth.users.id
  email: varchar('email', { length: 320 }).notNull().unique(),
  name: varchar('name', { length: 200 }).notNull(),
  roles: text('roles').array().notNull().default(sql`'{}'::text[]`),
  languagePref: localeEnum('language_pref').notNull().default('no'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, t => ({
  emailIdx: index('users_email_idx').on(t.email)
}));

/* ─────────────────────────── RFQ ATTACHMENTS ─────────────────────────── */
/**
 * Files attached to an RFQ — uploaded to Supabase Storage by the browser,
 * registered here, then included as multipart/mixed parts in the outgoing
 * Gmail email. Follows the same direct-upload pattern as item images (Wave 5).
 *
 * No FK to a project — derivable via rfqs.projectId; saves a join column.
 */
export const rfqAttachments = pgTable('rfq_attachments', {
  id: uuid('id').primaryKey().defaultRandom(),
  rfqId: uuid('rfq_id').notNull().references(() => rfqs.id, { onDelete: 'cascade' }),
  filename: varchar('filename', { length: 300 }).notNull(),
  storagePath: text('storage_path').notNull(),
  mimeType: varchar('mime_type', { length: 120 }).notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  uploadedBy: uuid('uploaded_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, t => ({
  rfqIdx: index('rfq_attachments_rfq_idx').on(t.rfqId)
}));

/**
 * PO attachments — mirror of rfqAttachments for purchase orders. Sent as
 * multipart/mixed parts when the PO is issued via Gmail (BINDING moment).
 */
export const poAttachments = pgTable('po_attachments', {
  id: uuid('id').primaryKey().defaultRandom(),
  poId: uuid('po_id').notNull().references(() => purchaseOrders.id, { onDelete: 'cascade' }),
  filename: varchar('filename', { length: 300 }).notNull(),
  storagePath: text('storage_path').notNull(),
  mimeType: varchar('mime_type', { length: 120 }).notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  uploadedBy: uuid('uploaded_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, t => ({
  poIdx: index('po_attachments_po_idx').on(t.poId)
}));

/* ────────────────────── CUSTOMER PORTAL (W4b) ────────────────────── */
/**
 * Per-project customer invitations. One row per (project × email).
 * Customer auth happens via Supabase Auth email magic links; this
 * table is the authorisation list — sign-in alone doesn't grant
 * access; you also need an unrevoked, accepted invitation for the
 * project you're trying to view.
 *
 * See `24-customer-portal.md` for the full design.
 */
export const projectCustomerInvitations = pgTable(
  'project_customer_invitations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    invitedBy: uuid('invited_by').notNull(), // staff auth user id
    invitedAt: timestamp('invited_at', { withTimezone: true }).notNull().defaultNow(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    note: text('note') // optional personal note from inviter
  },
  (t) => ({
    // One invitation per (project, lower(email)) so accidental dupes are blocked.
    projectEmailIdx: uniqueIndex('pci_project_email_idx').on(
      t.projectId,
      sql`lower(${t.email})`
    ),
    emailIdx: index('pci_email_idx').on(sql`lower(${t.email})`)
  })
);

/**
 * Files uploaded by the customer through the portal — mood boards,
 * reference images, existing plans, sample photos. Mirrors the
 * direct-upload pattern used by rfq_attachments / po_attachments.
 *
 * Bucket: `customer-uploads`
 * Path: `projects/{projectId}/customer/{uuid}-{filename}`
 */
export const projectCustomerUploads = pgTable(
  'project_customer_uploads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    uploadedBy: uuid('uploaded_by').notNull(), // customer auth user id
    filename: varchar('filename', { length: 300 }).notNull(),
    storagePath: text('storage_path').notNull(),
    mimeType: varchar('mime_type', { length: 120 }).notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    caption: text('caption'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    projectIdx: index('pcu_project_idx').on(t.projectId)
  })
);

/**
 * Threaded comments on a project's brief. Both customer and staff
 * post here; author_is_staff is denormalised so portal UI can render
 * the two sides distinctly without a join.
 */
export const projectCustomerComments = pgTable(
  'project_customer_comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id').notNull(), // staff OR customer auth user id
    authorIsStaff: boolean('author_is_staff').notNull(),
    body: text('body').notNull(),
    section: varchar('section', { length: 40 }), // nullable; "description", "intake", "general"
    replyToId: uuid('reply_to_id'), // self-ref; FK added later if needed
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    editedAt: timestamp('edited_at', { withTimezone: true })
  },
  (t) => ({
    projectIdx: index('pcc_project_created_idx').on(t.projectId, t.createdAt)
  })
);

/**
 * Customer sign-offs of the brief. A frozen snapshot of the brief
 * text + role at the moment of sign-off is stored as the legal
 * artefact ("approval is the contract" — 00- §22). Multiple rows
 * allowed (re-brief → re-sign); latest signed_off_at is operative.
 */
export const projectBriefSignoffs = pgTable(
  'project_brief_signoffs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    signedOffBy: uuid('signed_off_by').notNull(), // customer auth user id
    signedOffAt: timestamp('signed_off_at', { withTimezone: true }).notNull().defaultNow(),
    briefSnapshot: jsonb('brief_snapshot'), // { description, fablabRole, projectRef, title } at sign-off
    userAgent: text('user_agent'),
    ip: text('ip')
  },
  (t) => ({
    projectIdx: index('pbs_project_signed_idx').on(t.projectId, t.signedOffAt)
  })
);

/* ─────────────────────────── GOOGLE OAUTH TOKENS ─────────────────────────── */
/**
 * Per-user Google OAuth tokens, captured at sign-in callback when the
 * gmail.send scope is granted. No FK to users — `user_id` is the Supabase
 * `auth.users.id` directly, so we don't depend on a domain users row being
 * present (some users have one, some don't).
 *
 * Tokens are refreshed on demand by `src/server/lib/google-tokens.ts`.
 */
export const userGoogleTokens = pgTable('user_google_tokens', {
  userId: uuid('user_id').primaryKey(),
  accessToken: text('access_token').notNull(),
  refreshToken: text('refresh_token'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  scope: text('scope'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

/* ─────────────────────────── LEADS ─────────────────────────── */

export const leads = pgTable('leads', {
  id: uuid('id').primaryKey().defaultRandom(),
  reference: varchar('reference', { length: 40 }).notNull().unique(),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  source: leadSourceEnum('source').notNull(),
  status: leadStatusEnum('status').notNull().default('new'),
  convertedProjectId: uuid('converted_project_id'),         // FK added after projects defined
  ownerId: uuid('owner_id').references(() => users.id),
  lostReason: lostReasonEnum('lost_reason'),
  lostAt: timestamp('lost_at', { withTimezone: true }),

  // Required intake fields (§2)
  prospectiveClientName: varchar('prospective_client_name', { length: 200 }),
  clientKind: clientKindEnum('client_kind'),
  primaryContactName: varchar('primary_contact_name', { length: 200 }),
  primaryContactEmail: varchar('primary_contact_email', { length: 320 }),
  primaryContactPhone: varchar('primary_contact_phone', { length: 40 }),
  propertyAddress: text('property_address'),
  projectType: projectTypeEnum('project_type'),
  roomsOrZones: text('rooms_or_zones'),
  desiredOutcome: text('desired_outcome'),
  budgetExpectation: numeric('budget_expectation', { precision: 14, scale: 2 }),
  budgetCurrency: currencyEnum('budget_currency').default('NOK'),
  timelineExpectation: text('timeline_expectation'),
  decisionMakers: text('decision_makers'),
  approvalProcess: text('approval_process'),
  existingSuppliers: text('existing_suppliers'),
  knownConstraints: text('known_constraints'),
  designStylePreferences: text('design_style_preferences'),
  procurementExpectations: text('procurement_expectations'),
  deliveryInstallExpectations: text('delivery_install_expectations'),
  fablabExpectedRole: fablabRoleEnum('fablab_expected_role'),
  notes: text('notes'),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, t => ({
  statusIdx: index('leads_status_idx').on(t.status, t.ownerId),
  fnnelIdx: index('leads_funnel_idx').on(t.status, t.receivedAt)
}));

/* ─────────────────────────── CLIENTS ─────────────────────────── */

export const clients = pgTable('clients', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 200 }).notNull(),
  kind: clientKindEnum('kind').notNull(),
  primaryContactName: varchar('primary_contact_name', { length: 200 }),
  primaryContactEmail: varchar('primary_contact_email', { length: 320 }),
  primaryContactPhone: varchar('primary_contact_phone', { length: 40 }),
  billingAddress: text('billing_address'),
  orgNumber: varchar('org_number', { length: 40 }),
  paymentTermsDays: integer('payment_terms_days').notNull().default(30),
  bankAccountRef: varchar('bank_account_ref', { length: 60 }),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

/* ─────────────────────────── PROJECTS ─────────────────────────── */

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  reference: varchar('reference', { length: 40 }).notNull().unique(),
  title: varchar('title', { length: 300 }).notNull(),
  description: text('description'),
  clientId: uuid('client_id').notNull().references(() => clients.id),
  leadId: uuid('lead_id').references(() => leads.id),
  projectType: projectTypeEnum('project_type').notNull(),
  fablabRole: fablabRoleEnum('fablab_role').notNull(),
  currentStage: projectStageEnum('current_stage').notNull().default('brief'),
  currentOwnerId: uuid('current_owner_id').references(() => users.id),
  siteAddress: text('site_address'),
  priority: priorityEnum('priority').notNull().default('normal'),
  budget: numeric('budget', { precision: 14, scale: 2 }),
  budgetCurrency: currencyEnum('budget_currency').notNull().default('NOK'),
  vatRate: numeric('vat_rate', { precision: 5, scale: 2 }).notNull().default('25.00'),
  targetHandoverDate: date('target_handover_date'),
  currentScopeBaselineId: uuid('current_scope_baseline_id'),

  // Wave 5 v7 — Element List
  defaultDiscountPct: numeric('default_discount_pct', { precision: 5, scale: 2 }),  // applied to all items lacking a per-item discount
  deliveryCountry: varchar('delivery_country', { length: 2 }),                       // ISO 3166-1 alpha-2; drives VAT context

  // Wave 2 rollups (refreshed by background job)
  totalCommittedCost: numeric('total_committed_cost', { precision: 14, scale: 2 }).default('0'),
  totalLandedCost: numeric('total_landed_cost', { precision: 14, scale: 2 }).default('0'),
  totalInvoiced: numeric('total_invoiced', { precision: 14, scale: 2 }).default('0'),
  totalPaid: numeric('total_paid', { precision: 14, scale: 2 }).default('0'),
  totalOutstanding: numeric('total_outstanding', { precision: 14, scale: 2 }).default('0'),
  budgetVariance: numeric('budget_variance', { precision: 14, scale: 2 }).default('0'),
  budgetVariancePct: numeric('budget_variance_pct', { precision: 5, scale: 2 }).default('0'),
  marginActualPct: numeric('margin_actual_pct', { precision: 5, scale: 2 }),
  marginTargetPct: numeric('margin_target_pct', { precision: 5, scale: 2 }),
  marginVariancePct: numeric('margin_variance_pct', { precision: 5, scale: 2 }),
  lastRollupAt: timestamp('last_rollup_at', { withTimezone: true }),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, t => ({
  stageIdx: index('projects_stage_idx').on(t.currentStage, t.priority),
  clientIdx: index('projects_client_idx').on(t.clientId),
  ownerIdx: index('projects_owner_idx').on(t.currentOwnerId)
}));

export const stageTransitions = pgTable('stage_transitions', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  fromStage: projectStageEnum('from_stage'),
  toStage: projectStageEnum('to_stage').notNull(),
  actorId: uuid('actor_id').notNull().references(() => users.id),
  decision: stageTransitionDecisionEnum('decision').notNull(),
  note: text('note'),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow()
}, t => ({
  projectIdx: index('st_project_idx').on(t.projectId, t.occurredAt)
}));

/* ─────────────────────────── SCOPE ─────────────────────────── */

export const scopeBaselines = pgTable('scope_baselines', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().unique().references(() => projects.id),
  currentVersionId: uuid('current_version_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export const scopeBaselineVersions = pgTable('scope_baseline_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  scopeBaselineId: uuid('scope_baseline_id').notNull().references(() => scopeBaselines.id),
  versionNumber: integer('version_number').notNull(),
  status: scopeVersionStatusEnum('status').notNull().default('draft'),
  approvalId: uuid('approval_id'),
  supersededById: uuid('superseded_by_id'),
  createdViaChangeOrderId: uuid('created_via_change_order_id'),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  approvedAt: timestamp('approved_at', { withTimezone: true }),

  // The 15 structured scope fields (§4)
  projectAreas: text('project_areas'),
  roomsOrZones: jsonb('rooms_or_zones'),
  includedServices: text('included_services').array(),
  excludedServices: text('excluded_services').array(),
  deliverables: text('deliverables').array(),
  designOutputs: text('design_outputs').array(),
  procurementResponsibilities: text('procurement_responsibilities'),
  supplierCoordinationResponsibilities: text('supplier_coordination_responsibilities'),
  siteVisitExpectations: text('site_visit_expectations'),
  meetingExpectations: text('meeting_expectations'),
  timelineAssumptions: text('timeline_assumptions'),
  budgetAssumptions: text('budget_assumptions'),
  clientResponsibilities: text('client_responsibilities'),
  approvalGates: text('approval_gates').array(),
  knownDependencies: text('known_dependencies')
}, t => ({
  baselineVersionIdx: uniqueIndex('sbv_baseline_version_idx')
    .on(t.scopeBaselineId, t.versionNumber),
  statusIdx: index('sbv_status_idx').on(t.status)
}));

/* ─────────────────────────── ROOMS ─────────────────────────── */

export const rooms = pgTable('rooms', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  name: varchar('name', { length: 200 }).notNull(),
  kind: varchar('kind', { length: 60 }).notNull(),                // flat enum union — many kinds, kept as varchar
  sequence: integer('sequence').notNull().default(0),
  floorLevel: varchar('floor_level', { length: 20 }),
  areaM2: numeric('area_m2', { precision: 8, scale: 2 }),
  ceilingHeightM: numeric('ceiling_height_m', { precision: 5, scale: 2 }),
  photos: jsonb('photos'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, t => ({
  projectIdx: index('rooms_project_idx').on(t.projectId, t.sequence)
}));

/* ─────────────────────────── PACKAGES ─────────────────────────── */

export const packages = pgTable('packages', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  name: varchar('name', { length: 200 }).notNull(),
  kind: packageKindEnum('kind').notNull(),
  sequence: integer('sequence').notNull().default(0),
  status: packageStatusEnum('status').notNull().default('draft'),
  budget: numeric('budget', { precision: 14, scale: 2 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, t => ({
  projectIdx: index('packages_project_idx').on(t.projectId, t.sequence)
}));

/* ─────────────────────────── ITEMS ─────────────────────────── */

export const items = pgTable('items', {
  id: uuid('id').primaryKey().defaultRandom(),
  packageId: uuid('package_id').notNull().references(() => packages.id),
  roomId: uuid('room_id').references(() => rooms.id),
  name: varchar('name', { length: 300 }).notNull(),
  description: text('description'),
  itemType: itemTypeEnum('item_type').notNull(),
  category: varchar('category', { length: 60 }).notNull(),         // FF&E or bespoke category
  subcategory: varchar('subcategory', { length: 120 }),
  quantity: numeric('quantity', { precision: 12, scale: 2 }).notNull(),
  unit: varchar('unit', { length: 20 }).notNull(),
  winningQuoteId: uuid('winning_quote_id'),
  status: itemStatusEnum('status').notNull().default('specified'),
  costState: itemCostStateEnum('cost_state').notNull().default('estimated'),

  // Wave 2 cost states (singular numbers)
  clientBudget: numeric('client_budget', { precision: 14, scale: 2 }),
  clientBudgetCurrency: currencyEnum('client_budget_currency'),
  designEstimate: numeric('design_estimate', { precision: 14, scale: 2 }),
  designEstimateCurrency: currencyEnum('design_estimate_currency'),
  approvedBudget: numeric('approved_budget', { precision: 14, scale: 2 }),
  approvedBudgetCurrency: currencyEnum('approved_budget_currency'),
  approvedBudgetApprovalId: uuid('approved_budget_approval_id'),
  clientPrice: numeric('client_price', { precision: 14, scale: 2 }),
  clientPriceCurrency: currencyEnum('client_price_currency'),
  targetMarginPct: numeric('target_margin_pct', { precision: 5, scale: 2 }),

  // Customs & international (§13)
  manufacturer: varchar('manufacturer', { length: 200 }),
  sku: varchar('sku', { length: 120 }),
  dimensions: jsonb('dimensions'),
  finish: varchar('finish', { length: 200 }),
  material: varchar('material', { length: 200 }),
  colour: varchar('colour', { length: 80 }),
  countryOfOrigin: varchar('country_of_origin', { length: 2 }),
  hsCode: varchar('hs_code', { length: 20 }),
  incoterms: varchar('incoterms', { length: 20 }),

  // Lifecycle dates
  orderedAt: date('ordered_at'),
  expectedDeliveryAt: date('expected_delivery_at'),
  actualDeliveryAt: date('actual_delivery_at'),
  installedAt: date('installed_at'),
  signedOffAt: date('signed_off_at'),

  specFileId: uuid('spec_file_id'),
  notes: text('notes'),

  // Wave 5 v7 — Element List
  primaryImageId: uuid('primary_image_id'),                                          // → item_images.id (FK declared inline below)
  discountPct: numeric('discount_pct', { precision: 5, scale: 2 }),                  // per-item discount; if null, project default applies
  discountAmount: numeric('discount_amount', { precision: 14, scale: 2 }),           // alternative absolute discount; mutually exclusive with pct (app-level enforced)
  discountReason: varchar('discount_reason', { length: 200 }),
  showOnCustomerView: boolean('show_on_customer_view').notNull().default(true),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, t => ({
  packageIdx: index('items_package_idx').on(t.packageId, t.status),
  roomIdx: index('items_room_idx').on(t.roomId),
  riskIdx: index('items_at_risk_idx').on(t.status, t.expectedDeliveryAt),
  costStateIdx: index('items_cost_state_idx').on(t.costState)
}));

/* ─────────────────────────── LANDED COST ─────────────────────────── */

export const landedCostBreakdowns = pgTable('landed_cost_breakdowns', {
  id: uuid('id').primaryKey().defaultRandom(),
  itemId: uuid('item_id').notNull().unique().references(() => items.id),
  status: varchar('status', { length: 20 }).notNull().default('missing'),    // missing | incomplete | estimated | complete
  currency: currencyEnum('currency').notNull(),
  productCost: numeric('product_cost', { precision: 14, scale: 2 }),
  supplierDiscount: numeric('supplier_discount', { precision: 14, scale: 2 }),
  freight: numeric('freight', { precision: 14, scale: 2 }),
  freightInsurance: numeric('freight_insurance', { precision: 14, scale: 2 }),
  customsDuty: numeric('customs_duty', { precision: 14, scale: 2 }),
  importVat: numeric('import_vat', { precision: 14, scale: 2 }),
  brokerFees: numeric('broker_fees', { precision: 14, scale: 2 }),
  documentationFees: numeric('documentation_fees', { precision: 14, scale: 2 }),
  storage: numeric('storage', { precision: 14, scale: 2 }),
  handling: numeric('handling', { precision: 14, scale: 2 }),
  whiteGloveDelivery: numeric('white_glove_delivery', { precision: 14, scale: 2 }),
  installation: numeric('installation', { precision: 14, scale: 2 }),
  returnRiskAllowance: numeric('return_risk_allowance', { precision: 14, scale: 2 }),
  damageRiskAllowance: numeric('damage_risk_allowance', { precision: 14, scale: 2 }),
  totalLandedCost: numeric('total_landed_cost', { precision: 14, scale: 2 }),
  totalLandedPerUnit: numeric('total_landed_per_unit', { precision: 14, scale: 2 }),
  fxRateToProject: numeric('fx_rate_to_project', { precision: 12, scale: 6 }),
  confidence: varchar('confidence', { length: 30 }),
  lastCalculatedAt: timestamp('last_calculated_at', { withTimezone: true }),
  calculatedBy: uuid('calculated_by').references(() => users.id),
  notes: text('notes')
}, t => ({
  statusIdx: index('lcb_status_idx').on(t.status)
}));

/* ─────────────────────────── VENDORS ─────────────────────────── */

export const vendors = pgTable('vendors', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 200 }).notNull(),
  kind: vendorKindEnum('kind').notNull(),
  categories: text('categories').array().notNull().default(sql`'{}'::text[]`),
  country: varchar('country', { length: 2 }),
  incoterms: varchar('incoterms', { length: 20 }),
  contactName: varchar('contact_name', { length: 200 }),
  contactEmail: varchar('contact_email', { length: 320 }),
  contactPhone: varchar('contact_phone', { length: 40 }),
  address: text('address'),
  typicalLeadTimeDays: integer('typical_lead_time_days'),
  paymentTerms: varchar('payment_terms', { length: 120 }),
  defaultCurrency: currencyEnum('default_currency'),
  returnsPolicy: text('returns_policy'),
  claimsProcess: text('claims_process'),
  documentationQualityScore: integer('documentation_quality_score'),
  leadTimeReliabilityScore: integer('lead_time_reliability_score'),
  rating: integer('rating'),
  preferredSupplier: boolean('preferred_supplier').notNull().default(false),
  isInternal: boolean('is_internal').notNull().default(false),
  riskNotes: text('risk_notes'),
  notes: text('notes'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

/* ─────────────────────────── RFQ & QUOTES ─────────────────────────── */

export const rfqs = pgTable('rfqs', {
  id: uuid('id').primaryKey().defaultRandom(),
  reference: varchar('reference', { length: 40 }).notNull().unique(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  packageId: uuid('package_id').references(() => packages.id),
  title: varchar('title', { length: 300 }).notNull(),
  description: text('description'),
  status: rfqStatusEnum('status').notNull().default('draft'),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  responseDeadline: date('response_deadline'),
  awardedAt: timestamp('awarded_at', { withTimezone: true }),
  disclaimerText: text('disclaimer_text').notNull(),
  documentFileId: uuid('document_file_id'),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export const rfqItems = pgTable('rfq_items', {
  rfqId: uuid('rfq_id').notNull().references(() => rfqs.id),
  itemId: uuid('item_id').notNull().references(() => items.id)
}, t => ({ pk: primaryKey({ columns: [t.rfqId, t.itemId] }) }));

export const rfqVendors = pgTable('rfq_vendors', {
  rfqId: uuid('rfq_id').notNull().references(() => rfqs.id),
  vendorId: uuid('vendor_id').notNull().references(() => vendors.id),
  invitedAt: timestamp('invited_at', { withTimezone: true }).notNull().defaultNow(),
  respondedAt: timestamp('responded_at', { withTimezone: true })
}, t => ({ pk: primaryKey({ columns: [t.rfqId, t.vendorId] }) }));

export const quotes = pgTable('quotes', {
  id: uuid('id').primaryKey().defaultRandom(),
  rfqId: uuid('rfq_id').notNull().references(() => rfqs.id),
  itemId: uuid('item_id').notNull().references(() => items.id),
  vendorId: uuid('vendor_id').notNull().references(() => vendors.id),
  status: quoteStatusEnum('status').notNull().default('pending'),
  unitCost: numeric('unit_cost', { precision: 14, scale: 2 }),
  quotedQuantity: numeric('quoted_quantity', { precision: 12, scale: 2 }),
  lineTotal: numeric('line_total', { precision: 14, scale: 2 }),
  currency: currencyEnum('currency'),
  fxRateToProject: numeric('fx_rate_to_project', { precision: 12, scale: 6 }),
  leadTimeDays: integer('lead_time_days'),
  validUntil: date('valid_until'),
  includesShipping: boolean('includes_shipping'),
  includesInstall: boolean('includes_install'),
  paymentTerms: varchar('payment_terms', { length: 120 }),
  quoteFileId: uuid('quote_file_id'),
  notes: text('notes'),
  receivedAt: date('received_at'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, t => ({
  itemIdx: index('quotes_item_idx').on(t.itemId, t.status),
  // unique winning quote per item (partial index)
  winningIdx: uniqueIndex('quotes_winning_idx').on(t.itemId)
    .where(sql`status = 'winning'`)
}));

/* ─────────────────────────── PURCHASE ORDERS ─────────────────────────── */

export const purchaseOrders = pgTable('purchase_orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  reference: varchar('reference', { length: 40 }).notNull().unique(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  vendorId: uuid('vendor_id').notNull().references(() => vendors.id),
  status: poStatusEnum('status').notNull().default('draft'),
  issuedAt: date('issued_at'),
  confirmedAt: date('confirmed_at'),
  fulfilledAt: date('fulfilled_at'),
  currency: currencyEnum('currency').notNull(),
  fxRateToProject: numeric('fx_rate_to_project', { precision: 12, scale: 6 }),
  subtotalNet: numeric('subtotal_net', { precision: 14, scale: 2 }).notNull().default('0'),
  vatAmount: numeric('vat_amount', { precision: 14, scale: 2 }).notNull().default('0'),
  shippingCost: numeric('shipping_cost', { precision: 14, scale: 2 }),
  totalGross: numeric('total_gross', { precision: 14, scale: 2 }).notNull().default('0'),

  // Delivery (§12)
  deliveryAddress: text('delivery_address'),
  deliveryDeadline: date('delivery_deadline'),
  deliveryInstructions: text('delivery_instructions'),

  // Freight & customs (§12, §13)
  freightTerms: varchar('freight_terms', { length: 60 }),
  freightResponsibleParty: varchar('freight_responsible_party', { length: 30 }),
  freightForwarderId: uuid('freight_forwarder_id').references(() => vendors.id),
  customsRequirements: text('customs_requirements'),
  customsStatus: varchar('customs_status', { length: 30 }),

  // Linkage
  approvalReferenceId: uuid('approval_reference_id'),
  relatedInvoiceId: uuid('related_invoice_id'),
  legacyNoApproval: boolean('legacy_no_approval').notNull().default(false),

  terms: text('terms'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, t => ({
  projectIdx: index('po_project_idx').on(t.projectId, t.status),
  vendorIdx: index('po_vendor_idx').on(t.vendorId)
}));

export const purchaseOrderLines = pgTable('purchase_order_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  purchaseOrderId: uuid('purchase_order_id').notNull().references(() => purchaseOrders.id),
  itemId: uuid('item_id').notNull().references(() => items.id),
  quantity: numeric('quantity', { precision: 12, scale: 2 }).notNull(),
  unitCost: numeric('unit_cost', { precision: 14, scale: 2 }).notNull(),
  lineTotal: numeric('line_total', { precision: 14, scale: 2 }).notNull(),
  note: text('note')
}, t => ({
  itemIdx: index('pol_item_idx').on(t.itemId)
}));

/* ─────────────────────────── APPROVALS ─────────────────────────── */

export const approvals = pgTable('approvals', {
  id: uuid('id').primaryKey().defaultRandom(),
  reference: varchar('reference', { length: 40 }).notNull().unique(),
  projectId: uuid('project_id').notNull().references(() => projects.id),

  // Polymorphic target — exactly one must be set
  scopeBaselineVersionId: uuid('scope_baseline_version_id').references(() => scopeBaselineVersions.id),
  itemId: uuid('item_id').references(() => items.id),
  quoteId: uuid('quote_id').references(() => quotes.id),
  purchaseOrderId: uuid('purchase_order_id').references(() => purchaseOrders.id),
  changeOrderId: uuid('change_order_id'),                                // FK added later
  budgetBaselineId: uuid('budget_baseline_id'),                          // future

  // The legal substance
  subject: varchar('subject', { length: 300 }).notNull(),
  description: text('description'),
  version: varchar('version', { length: 40 }),
  referenceImageId: uuid('reference_image_id'),
  referenceDocumentId: uuid('reference_document_id'),
  price: numeric('price', { precision: 14, scale: 2 }),
  priceCurrency: currencyEnum('price_currency'),
  freightAssumptions: text('freight_assumptions'),
  customsAssumptions: text('customs_assumptions'),
  leadTimeDays: integer('lead_time_days'),
  supplierName: varchar('supplier_name', { length: 200 }),
  approvalConsequence: text('approval_consequence'),

  // Workflow
  status: approvalStatusEnum('status').notNull().default('draft'),
  conditions: text('conditions'),
  approverName: varchar('approver_name', { length: 200 }),
  approverEmail: varchar('approver_email', { length: 320 }),
  approvalChannel: approvalChannelEnum('approval_channel'),
  approvalEvidenceFileId: uuid('approval_evidence_file_id'),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  respondedAt: timestamp('responded_at', { withTimezone: true }),
  validUntil: date('valid_until'),
  supersededById: uuid('superseded_by_id'),
  batchId: uuid('batch_id'),
  requestedBy: uuid('requested_by').notNull().references(() => users.id),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, t => ({
  projectIdx: index('approvals_project_idx').on(t.projectId, t.status),
  itemIdx: index('approvals_item_approved_idx').on(t.itemId)
    .where(sql`status IN ('approved', 'approved_with_conditions')`),
  expiringIdx: index('approvals_expiring_idx').on(t.status, t.validUntil),
  batchIdx: index('approvals_batch_idx').on(t.batchId),
  // Exactly one polymorphic target must be set
  oneTargetCheck: check('approvals_one_target_check',
    sql`(CASE WHEN scope_baseline_version_id IS NOT NULL THEN 1 ELSE 0 END +
         CASE WHEN item_id IS NOT NULL THEN 1 ELSE 0 END +
         CASE WHEN quote_id IS NOT NULL THEN 1 ELSE 0 END +
         CASE WHEN purchase_order_id IS NOT NULL THEN 1 ELSE 0 END +
         CASE WHEN change_order_id IS NOT NULL THEN 1 ELSE 0 END +
         CASE WHEN budget_baseline_id IS NOT NULL THEN 1 ELSE 0 END) = 1`)
}));

/* ─────────────────────────── CHANGE ORDERS ─────────────────────────── */

export const changeOrders = pgTable('change_orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  reference: varchar('reference', { length: 40 }).notNull().unique(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  title: varchar('title', { length: 300 }).notNull(),
  description: text('description'),
  reason: text('reason'),
  requestedBy: changeOrderRequestedByEnum('requested_by').notNull(),
  requestedByUserId: uuid('requested_by_user_id').references(() => users.id),
  requestedByExternal: varchar('requested_by_external', { length: 200 }),
  dateRequested: date('date_requested').notNull(),

  costImpactAmount: numeric('cost_impact_amount', { precision: 14, scale: 2 }),
  costImpactCurrency: currencyEnum('cost_impact_currency'),
  timeImpactDays: integer('time_impact_days'),
  affectsSupplier: boolean('affects_supplier').notNull().default(false),
  affectsFreightCustoms: boolean('affects_freight_customs').notNull().default(false),
  affectsInstall: boolean('affects_install').notNull().default(false),

  status: changeOrderStatusEnum('status').notNull().default('requested'),
  approvalId: uuid('approval_id'),
  finalDecision: text('final_decision'),
  implementedAt: timestamp('implemented_at', { withTimezone: true }),
  implementedBy: uuid('implemented_by').references(() => users.id),

  resultingScopeBaselineVersionId: uuid('resulting_scope_baseline_version_id'),
  linkedDecisionId: uuid('linked_decision_id'),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, t => ({
  projectIdx: index('co_project_idx').on(t.projectId, t.status),
  workflowIdx: index('co_workflow_idx').on(t.status, t.dateRequested)
}));

export const changeOrderImpacts = pgTable('change_order_impacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  changeOrderId: uuid('change_order_id').notNull().references(() => changeOrders.id),
  itemId: uuid('item_id').references(() => items.id),
  packageId: uuid('package_id').references(() => packages.id),
  vendorId: uuid('vendor_id').references(() => vendors.id),
  impactType: changeImpactTypeEnum('impact_type').notNull(),
  costDelta: numeric('cost_delta', { precision: 14, scale: 2 }),
  costDeltaCurrency: currencyEnum('cost_delta_currency'),
  timeDeltaDays: integer('time_delta_days'),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, t => ({
  changeOrderIdx: index('coi_change_order_idx').on(t.changeOrderId),
  itemIdx: index('coi_item_idx').on(t.itemId)
}));

/* ─────────────────────────── RISKS ─────────────────────────── */

export const riskItems = pgTable('risk_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  reference: varchar('reference', { length: 40 }).notNull().unique(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  category: riskCategoryEnum('category').notNull(),
  title: varchar('title', { length: 300 }).notNull(),
  description: text('description'),
  likelihood: integer('likelihood').notNull(),
  impact: integer('impact').notNull(),
  score: integer('score').notNull(),                                  // likelihood * impact, computed at write
  scoreBand: riskBandEnum('score_band').notNull(),
  ownerId: uuid('owner_id').references(() => users.id),
  mitigationAction: text('mitigation_action'),
  mitigationDueDate: date('mitigation_due_date'),
  residualLikelihood: integer('residual_likelihood'),
  residualImpact: integer('residual_impact'),
  residualScore: integer('residual_score'),
  status: riskStatusEnum('status').notNull().default('identified'),
  acceptedByDecisionId: uuid('accepted_by_decision_id'),
  realisedAsIssueId: uuid('realised_as_issue_id'),
  identifiedAt: timestamp('identified_at', { withTimezone: true }).notNull().defaultNow(),
  identifiedByUserId: uuid('identified_by_user_id').references(() => users.id),
  linkedItems: jsonb('linked_items'),
  linkedVendorId: uuid('linked_vendor_id').references(() => vendors.id),
  linkedPurchaseOrderId: uuid('linked_purchase_order_id').references(() => purchaseOrders.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, t => ({
  projectIdx: index('risk_project_idx').on(t.projectId, t.scoreBand, t.status),
  ownerIdx: index('risk_owner_open_idx').on(t.ownerId, t.status)
    .where(sql`status NOT IN ('closed', 'mitigated')`),
  topScoreIdx: index('risk_top_score_idx').on(t.score)
    .where(sql`status NOT IN ('closed', 'accepted')`)
}));

/* ─────────────────────────── ISSUES ─────────────────────────── */

export const issues = pgTable('issues', {
  id: uuid('id').primaryKey().defaultRandom(),
  reference: varchar('reference', { length: 40 }).notNull().unique(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  category: issueCategoryEnum('category').notNull(),
  title: varchar('title', { length: 300 }).notNull(),
  description: text('description'),
  severity: severityEnum('severity').notNull(),
  status: issueStatusEnum('status').notNull().default('open'),
  raisedBy: uuid('raised_by').notNull().references(() => users.id),
  raisedAt: timestamp('raised_at', { withTimezone: true }).notNull().defaultNow(),
  assignedTo: uuid('assigned_to').references(() => users.id),
  reassignedAt: timestamp('reassigned_at', { withTimezone: true }),
  resolution: text('resolution'),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  resolvedBy: uuid('resolved_by').references(() => users.id),

  linkedItemId: uuid('linked_item_id').references(() => items.id),
  linkedVendorId: uuid('linked_vendor_id').references(() => vendors.id),
  linkedPurchaseOrderId: uuid('linked_purchase_order_id').references(() => purchaseOrders.id),
  linkedApprovalId: uuid('linked_approval_id').references(() => approvals.id),
  linkedChangeOrderId: uuid('linked_change_order_id').references(() => changeOrders.id),
  linkedRiskId: uuid('linked_risk_id').references(() => riskItems.id),
  attachments: jsonb('attachments'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, t => ({
  projectIdx: index('issue_project_idx').on(t.projectId, t.status),
  ownerIdx: index('issue_owner_open_idx').on(t.assignedTo, t.status)
    .where(sql`status NOT IN ('closed', 'resolved')`),
  severityIdx: index('issue_severity_idx').on(t.severity, t.status)
    .where(sql`severity IN ('high', 'critical')`)
}));

/* ─────────────────────────── DECISIONS ─────────────────────────── */

export const decisions = pgTable('decisions', {
  id: uuid('id').primaryKey().defaultRandom(),
  reference: varchar('reference', { length: 40 }).notNull().unique(),
  projectId: uuid('project_id').references(() => projects.id),
  title: varchar('title', { length: 300 }).notNull(),
  decisionText: text('decision_text').notNull(),
  rationale: text('rationale').notNull(),
  alternativesConsidered: text('alternatives_considered'),
  consequences: text('consequences'),
  impactAssessment: text('impact_assessment'),
  decisionType: decisionTypeEnum('decision_type').notNull(),
  decidedBy: uuid('decided_by').notNull().references(() => users.id),
  decidedAt: timestamp('decided_at', { withTimezone: true }).notNull().defaultNow(),
  secondedBy: uuid('seconded_by').references(() => users.id),
  supersedesDecisionId: uuid('supersedes_decision_id'),
  supersededByDecisionId: uuid('superseded_by_decision_id'),
  linkedRecords: jsonb('linked_records'),
  evidenceFiles: jsonb('evidence_files'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, t => ({
  projectIdx: index('decisions_project_idx').on(t.projectId, t.decidedAt),
  typeIdx: index('decisions_type_idx').on(t.decisionType)
}));

/* ─────────────────────────── DEFECT CLAIMS ─────────────────────────── */

export const defectClaims = pgTable('defect_claims', {
  id: uuid('id').primaryKey().defaultRandom(),
  reference: varchar('reference', { length: 40 }).notNull().unique(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  itemId: uuid('item_id').notNull().references(() => items.id),
  purchaseOrderId: uuid('purchase_order_id').notNull().references(() => purchaseOrders.id),
  vendorId: uuid('vendor_id').notNull().references(() => vendors.id),
  defectType: defectTypeEnum('defect_type').notNull(),
  severity: defectSeverityEnum('severity').notNull(),
  description: text('description').notNull(),
  affectedQuantity: numeric('affected_quantity', { precision: 12, scale: 2 }).notNull(),
  discoveredAt: timestamp('discovered_at', { withTimezone: true }).notNull(),
  discoveredByUserId: uuid('discovered_by_user_id').notNull().references(() => users.id),
  photos: jsonb('photos'),
  status: defectStatusEnum('status').notNull().default('raised'),
  resolutionAction: defectResolutionEnum('resolution_action'),
  resolutionValue: numeric('resolution_value', { precision: 14, scale: 2 }),
  resolutionValueCurrency: currencyEnum('resolution_value_currency'),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  resolvedByUserId: uuid('resolved_by_user_id').references(() => users.id),
  linkedVendorCommunicationId: uuid('linked_vendor_communication_id'),
  replacementPurchaseOrderId: uuid('replacement_purchase_order_id').references(() => purchaseOrders.id),
  linkedInsuranceClaimRef: varchar('linked_insurance_claim_ref', { length: 120 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, t => ({
  projectIdx: index('defect_project_idx').on(t.projectId, t.status),
  vendorIdx: index('defect_vendor_idx').on(t.vendorId, t.discoveredAt),
  openIdx: index('defect_open_idx').on(t.status)
    .where(sql`status NOT IN ('resolved', 'refund_received')`)
}));

/* ─────────────────────────── SHIPMENTS ─────────────────────────── */

export const shipments = pgTable('shipments', {
  id: uuid('id').primaryKey().defaultRandom(),
  reference: varchar('reference', { length: 40 }).notNull().unique(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  originVendorId: uuid('origin_vendor_id').notNull().references(() => vendors.id),
  originCountry: varchar('origin_country', { length: 2 }),
  originLocation: varchar('origin_location', { length: 200 }),
  destinationAddress: text('destination_address'),
  freightForwarderId: uuid('freight_forwarder_id').references(() => vendors.id),
  carrierName: varchar('carrier_name', { length: 200 }),
  trackingNumber: varchar('tracking_number', { length: 120 }),
  mode: shipmentModeEnum('mode').notNull(),
  status: shipmentStatusEnum('status').notNull().default('planned'),
  departureDate: date('departure_date'),
  expectedArrival: date('expected_arrival'),
  actualArrival: timestamp('actual_arrival', { withTimezone: true }),
  incoterms: varchar('incoterms', { length: 20 }),
  totalValueDeclared: numeric('total_value_declared', { precision: 14, scale: 2 }),
  valueCurrency: currencyEnum('value_currency'),
  insured: boolean('insured').notNull().default(false),
  insuredValue: numeric('insured_value', { precision: 14, scale: 2 }),
  insuranceProvider: varchar('insurance_provider', { length: 200 }),
  insurancePolicyRef: varchar('insurance_policy_ref', { length: 120 }),
  packingListFileId: uuid('packing_list_file_id'),
  commercialInvoiceFileId: uuid('commercial_invoice_file_id'),
  customsDocsFileIds: jsonb('customs_docs_file_ids'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, t => ({
  projectIdx: index('shipments_project_idx').on(t.projectId, t.status),
  incomingIdx: index('shipments_incoming_idx').on(t.status, t.expectedArrival)
    .where(sql`status NOT IN ('delivered', 'returned')`)
}));

export const shipmentItems = pgTable('shipment_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  shipmentId: uuid('shipment_id').notNull().references(() => shipments.id),
  itemId: uuid('item_id').notNull().references(() => items.id),
  purchaseOrderId: uuid('purchase_order_id').notNull().references(() => purchaseOrders.id),
  quantity: numeric('quantity', { precision: 12, scale: 2 }).notNull(),
  status: shipmentItemStatusEnum('status').notNull().default('in_transit'),
  receivedQuantity: numeric('received_quantity', { precision: 12, scale: 2 }),
  receivedAt: timestamp('received_at', { withTimezone: true }),
  receivedByUserId: uuid('received_by_user_id').references(() => users.id),
  defectClaimId: uuid('defect_claim_id').references(() => defectClaims.id),
  notes: text('notes')
}, t => ({
  shipmentIdx: index('si_shipment_idx').on(t.shipmentId),
  itemIdx: index('si_item_idx').on(t.itemId)
}));

export const deliveryEvents = pgTable('delivery_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  shipmentId: uuid('shipment_id').notNull().references(() => shipments.id),
  eventType: deliveryEventTypeEnum('event_type').notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  location: varchar('location', { length: 200 }),
  notes: text('notes'),
  evidenceFileId: uuid('evidence_file_id'),
  recordedByUserId: uuid('recorded_by_user_id').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, t => ({
  shipmentIdx: index('de_shipment_idx').on(t.shipmentId, t.occurredAt)
}));

/* ─────────────────────────── INVOICES / PAYMENTS / TRIGGERS ─────────────────────────── */

export const billingTriggers = pgTable('billing_triggers', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').references(() => projects.id),
  name: varchar('name', { length: 200 }).notNull(),
  triggerEvent: billingTriggerEventEnum('trigger_event').notNull(),
  triggerCondition: jsonb('trigger_condition'),
  amountCalculation: billingTriggerCalcEnum('amount_calculation').notNull(),
  amountValue: numeric('amount_value', { precision: 14, scale: 2 }),
  amountPercent: numeric('amount_percent', { precision: 5, scale: 2 }),
  amountBasis: varchar('amount_basis', { length: 40 }),
  descriptionTemplate: text('description_template'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, t => ({
  projectIdx: index('bt_project_idx').on(t.projectId, t.active, t.triggerEvent)
}));

export const invoices = pgTable('invoices', {
  id: uuid('id').primaryKey().defaultRandom(),
  reference: varchar('reference', { length: 40 }).notNull().unique(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  clientId: uuid('client_id').notNull().references(() => clients.id),
  status: invoiceStatusEnum('status').notNull().default('draft'),
  issueDate: date('issue_date'),
  dueDate: date('due_date'),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  currency: currencyEnum('currency').notNull(),
  subtotalNet: numeric('subtotal_net', { precision: 14, scale: 2 }).notNull().default('0'),
  vatRate: numeric('vat_rate', { precision: 5, scale: 2 }).notNull(),
  vatAmount: numeric('vat_amount', { precision: 14, scale: 2 }).notNull().default('0'),
  totalGross: numeric('total_gross', { precision: 14, scale: 2 }).notNull().default('0'),
  amountPaid: numeric('amount_paid', { precision: 14, scale: 2 }).notNull().default('0'),
  balanceDue: numeric('balance_due', { precision: 14, scale: 2 }).notNull().default('0'),
  triggeredByBillingTriggerId: uuid('triggered_by_billing_trigger_id').references(() => billingTriggers.id),
  triggeredByEvent: varchar('triggered_by_event', { length: 60 }),
  invoiceDocumentId: uuid('invoice_document_id'),
  // Poweroffice integration — Controller mirrors Poweroffice invoices, doesn't generate them
  externalSystem: varchar('external_system', { length: 40 }).default('poweroffice'),
  externalReference: varchar('external_reference', { length: 60 }),       // Poweroffice invoice number
  externalUrl: varchar('external_url', { length: 500 }),                  // deep link into Poweroffice
  externalStatus: varchar('external_status', { length: 40 }),             // status string from Poweroffice
  externalSyncedAt: timestamp('external_synced_at', { withTimezone: true }),
  notes: text('notes'),
  terms: text('terms'),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, t => ({
  projectIdx: index('inv_project_idx').on(t.projectId, t.status),
  overdueIdx: index('inv_overdue_idx').on(t.dueDate)
    .where(sql`status NOT IN ('paid', 'void')`),
  clientIdx: index('inv_client_idx').on(t.clientId, t.status),
  externalRefIdx: index('inv_external_ref_idx').on(t.externalReference)
}));

export const invoiceLines = pgTable('invoice_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  invoiceId: uuid('invoice_id').notNull().references(() => invoices.id),
  description: varchar('description', { length: 500 }).notNull(),
  itemId: uuid('item_id').references(() => items.id),
  purchaseOrderId: uuid('purchase_order_id').references(() => purchaseOrders.id),
  changeOrderId: uuid('change_order_id').references(() => changeOrders.id),
  timeEntryAggregate: jsonb('time_entry_aggregate'),
  milestoneType: varchar('milestone_type', { length: 60 }),
  quantity: numeric('quantity', { precision: 12, scale: 2 }),
  unitPrice: numeric('unit_price', { precision: 14, scale: 2 }),
  lineTotal: numeric('line_total', { precision: 14, scale: 2 }).notNull(),
  marginAtInvoice: numeric('margin_at_invoice', { precision: 14, scale: 2 }),
  displayOrder: integer('display_order').notNull().default(0)
}, t => ({
  invoiceIdx: index('il_invoice_idx').on(t.invoiceId, t.displayOrder),
  itemIdx: index('il_item_idx').on(t.itemId)
}));

export const payments = pgTable('payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  reference: varchar('reference', { length: 40 }).notNull().unique(),
  invoiceId: uuid('invoice_id').notNull().references(() => invoices.id),
  amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
  currency: currencyEnum('currency').notNull(),
  fxRateToProject: numeric('fx_rate_to_project', { precision: 12, scale: 6 }),
  receivedDate: date('received_date').notNull(),
  clearedDate: date('cleared_date'),
  method: paymentMethodEnum('method').notNull(),
  status: paymentStatusEnum('status').notNull().default('expected'),
  bankReference: varchar('bank_reference', { length: 200 }),
  evidenceFileId: uuid('evidence_file_id'),
  notes: text('notes'),
  recordedBy: uuid('recorded_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, t => ({
  invoiceIdx: index('pay_invoice_idx').on(t.invoiceId, t.status),
  receivedIdx: index('pay_received_idx').on(t.receivedDate)
    .where(sql`status IN ('received', 'cleared')`)
}));

/* ─────────────────────────── DRAWINGS & FILES ─────────────────────────── */

export const fileRecords = pgTable('file_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').references(() => projects.id),
  stage: projectStageEnum('stage'),
  name: varchar('name', { length: 300 }).notNull(),
  kind: fileKindEnum('kind').notNull(),
  currentVersionId: uuid('current_version_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const fileVersions = pgTable('file_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  fileRecordId: uuid('file_record_id').notNull().references(() => fileRecords.id),
  versionNumber: integer('version_number').notNull(),
  blobUri: varchar('blob_uri', { length: 600 }).notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  mimeType: varchar('mime_type', { length: 120 }),
  uploadedBy: uuid('uploaded_by').notNull().references(() => users.id),
  uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
  supersedesId: uuid('supersedes_id'),
  note: text('note')
});

export const drawings = pgTable('drawings', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  number: varchar('number', { length: 60 }).notNull().unique(),
  title: varchar('title', { length: 300 }).notNull(),
  discipline: drawingDisciplineEnum('discipline').notNull(),
  revision: varchar('revision', { length: 6 }).notNull(),
  scale: varchar('scale', { length: 20 }),
  paperSize: varchar('paper_size', { length: 10 }),
  status: drawingStatusEnum('status').notNull().default('wip'),
  issuedAt: date('issued_at'),
  supersededById: uuid('superseded_by_id'),
  fileRecordId: uuid('file_record_id').references(() => fileRecords.id),
  packageIds: jsonb('package_ids'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, t => ({
  projectIdx: index('dwg_project_idx').on(t.projectId, t.status)
}));

export const documentTemplates = pgTable('document_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: docTemplateSlugEnum('slug').notNull(),
  locale: localeEnum('locale').notNull(),
  version: integer('version').notNull(),
  status: docTemplateStatusEnum('status').notNull().default('draft'),
  previousVersionId: uuid('previous_version_id'),
  subjectTemplate: varchar('subject_template', { length: 500 }),
  bodyTemplate: text('body_template').notNull(),
  requiredClauses: jsonb('required_clauses'),
  variablesSchema: jsonb('variables_schema'),
  createdByUserId: uuid('created_by_user_id').notNull().references(() => users.id),
  reviewedByUserId: uuid('reviewed_by_user_id').references(() => users.id),
  activatedByUserId: uuid('activated_by_user_id').references(() => users.id),
  activatedAt: timestamp('activated_at', { withTimezone: true }),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, t => ({
  lookupIdx: index('tpl_lookup_idx').on(t.slug, t.locale, t.status),
  versionsIdx: index('tpl_versions_idx').on(t.slug, t.locale, t.version)
}));

/* ─────────────────────────── TIME ENTRIES ─────────────────────────── */

/**
 * Time entries — extended for the Project Coaching layer (MVP-A;
 * see `28-project-coaching-layer.md` §7.1). Pre-existing columns
 * (stage / category / workDate / hours / note / chargeable /
 * nonChargeableReason / chargeableToChangeOrderId / enteredAt)
 * stay as-is for backward compat.
 *
 * The Coaching uplift adds parallel framing on the same hour:
 *   - `commercialReason` + `customerVisibleSummary` — internal vs
 *     external phrasing. The Work Evidence Summary report reads
 *     `customerVisibleSummary` for its narrative.
 *   - `chargeabilityStatus` — the richer 9-state classification.
 *     The legacy `chargeable` boolean is now a derived view of
 *     this; the time-entries server action keeps both in sync.
 *
 * `linkedObjectType` + `linkedObjectId` are polymorphic — they
 * connect this hour to the entity the work was about (brief,
 * scope, item, approval, RFQ, quote, PO, change order, etc.).
 *
 * Partial index `time_unreportable_idx` is the fast lookup for the
 * Project Coach dashboard rule "time entries missing commercial
 * reason".
 */
export const timeEntries = pgTable('time_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  stage: projectStageEnum('stage').notNull(),
  category: timeCategoryEnum('category').notNull(),
  workDate: date('work_date').notNull(),
  hours: numeric('hours', { precision: 5, scale: 2 }).notNull(),
  note: text('note'),
  chargeable: boolean('chargeable').notNull().default(true),
  nonChargeableReason: text('non_chargeable_reason'),
  chargeableToChangeOrderId: uuid('chargeable_to_change_order_id').references(() => changeOrders.id),
  enteredAt: timestamp('entered_at', { withTimezone: true }).notNull().defaultNow(),

  // Coaching MVP-A uplift
  commercialReason: text('commercial_reason'),
  customerVisibleSummary: text('customer_visible_summary'),
  chargeabilityStatus: chargeabilityStatusEnum('chargeability_status'),
  linkedObjectType: varchar('linked_object_type', { length: 40 }),
  linkedObjectId: uuid('linked_object_id'),
  reportable: boolean('reportable').notNull().default(true),
  includedInReportAt: timestamp('included_in_report_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, t => ({
  projectCategoryIdx: index('te_project_category_idx').on(t.projectId, t.category, t.workDate),
  userIdx: index('te_user_idx').on(t.userId, t.chargeable, t.workDate),
  // Coaching MVP-A: drives the dashboard "missing commercial reason" check.
  unreportableIdx: index('te_unreportable_idx').on(t.projectId)
    .where(sql`commercial_reason IS NULL AND reportable = true`)
}));

/* ─────────────────────────── EQUIPMENT & BOOKINGS ─────────────────────────── */

export const equipment = pgTable('equipment', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 200 }).notNull(),
  category: equipmentCategoryEnum('category').notNull(),
  status: equipmentStatusEnum('status').notNull().default('available'),
  location: varchar('location', { length: 200 }),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const maintenanceWindows = pgTable('maintenance_windows', {
  id: uuid('id').primaryKey().defaultRandom(),
  equipmentId: uuid('equipment_id').notNull().references(() => equipment.id),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  reason: varchar('reason', { length: 300 })
});

export const bookings = pgTable('bookings', {
  id: uuid('id').primaryKey().defaultRandom(),
  equipmentId: uuid('equipment_id').notNull().references(() => equipment.id),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  purchaseOrderId: uuid('purchase_order_id').references(() => purchaseOrders.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  status: bookingStatusEnum('status').notNull().default('scheduled'),
  note: text('note')
  // Exclusion constraint for overlap prevention added via raw SQL in migration
}, t => ({
  equipmentIdx: index('bookings_equipment_idx').on(t.equipmentId, t.startsAt)
}));

/* ─────────────────────────── LESSONS LEARNED ─────────────────────────── */

export const lessonsLearned = pgTable('lessons_learned', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().unique().references(() => projects.id),
  status: lessonsStatusEnum('status').notNull().default('not_started'),
  whatWentWell: jsonb('what_went_well'),
  whatWentWrong: jsonb('what_went_wrong'),
  keyLearnings: jsonb('key_learnings'),
  recommendationsForFuture: jsonb('recommendations_for_future'),
  budgetVarianceSummary: text('budget_variance_summary'),
  timeVarianceSummary: text('time_variance_summary'),
  marginActualPct: numeric('margin_actual_pct', { precision: 5, scale: 2 }),
  marginTargetPct: numeric('margin_target_pct', { precision: 5, scale: 2 }),
  supplierReview: jsonb('supplier_review'),
  clientRelationshipHealth: integer('client_relationship_health'),
  clientRelationshipNotes: text('client_relationship_notes'),
  likelyRepeatClient: boolean('likely_repeat_client'),
  sessionDate: date('session_date'),
  participants: jsonb('participants'),
  facilitatorId: uuid('facilitator_id').references(() => users.id),
  artefactsToSave: jsonb('artefacts_to_save'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  finalisedAt: timestamp('finalised_at', { withTimezone: true })
}, t => ({
  statusIdx: index('lessons_status_idx').on(t.status)
}));

/* ─────────────────────────── VENDOR COMMUNICATIONS ─────────────────────────── */

export const vendorCommunications = pgTable('vendor_communications', {
  id: uuid('id').primaryKey().defaultRandom(),
  vendorId: uuid('vendor_id').notNull().references(() => vendors.id),
  projectId: uuid('project_id').references(() => projects.id),
  itemId: uuid('item_id').references(() => items.id),
  rfqId: uuid('rfq_id').references(() => rfqs.id),
  purchaseOrderId: uuid('purchase_order_id').references(() => purchaseOrders.id),
  direction: vendorCommDirectionEnum('direction').notNull(),
  channel: vendorCommChannelEnum('channel').notNull(),
  stage: vendorCommStageEnum('stage').notNull(),                              // R8: required
  subject: varchar('subject', { length: 500 }).notNull(),
  body: text('body'),
  attachments: jsonb('attachments'),
  senderId: uuid('sender_id').references(() => users.id),
  senderEmail: varchar('sender_email', { length: 320 }),
  recipientEmail: varchar('recipient_email', { length: 320 }),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  recordedBy: uuid('recorded_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, t => ({
  vendorIdx: index('vc_vendor_idx').on(t.vendorId, t.occurredAt),
  projectIdx: index('vc_project_idx').on(t.projectId, t.occurredAt)
}));

/* ─────────────────────────── TRANSLATIONS / AUDIT / NOTIFICATIONS ─────────────────────────── */

export const translations = pgTable('translations', {
  key: varchar('key', { length: 200 }).primaryKey(),
  en: text('en').notNull(),
  no: text('no'),
  status: translationStatusEnum('status').notNull().default('mt_only'),
  reviewerId: uuid('reviewer_id').references(() => users.id),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  entityType: varchar('entity_type', { length: 60 }).notNull(),
  entityId: uuid('entity_id').notNull(),
  actorId: uuid('actor_id').references(() => users.id),
  action: varchar('action', { length: 60 }).notNull(),
  before: jsonb('before'),
  after: jsonb('after'),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow()
}, t => ({
  entityIdx: index('audit_entity_idx').on(t.entityType, t.entityId, t.occurredAt)
}));

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  kind: varchar('kind', { length: 60 }).notNull(),
  subject: varchar('subject', { length: 500 }).notNull(),
  body: text('body'),
  link: varchar('link', { length: 500 }),
  readAt: timestamp('read_at', { withTimezone: true }),
  emailSentAt: timestamp('email_sent_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, t => ({
  userIdx: index('notif_user_idx').on(t.userId, t.createdAt)
}));

/* ─────────────────────────── RELATIONS ─────────────────────────── */

export const projectsRelations = relations(projects, ({ one, many }) => ({
  client: one(clients, { fields: [projects.clientId], references: [clients.id] }),
  lead: one(leads, { fields: [projects.leadId], references: [leads.id] }),
  currentOwner: one(users, { fields: [projects.currentOwnerId], references: [users.id] }),
  packages: many(packages),
  rooms: many(rooms),
  scopeBaseline: one(scopeBaselines, { fields: [projects.id], references: [scopeBaselines.projectId] }),
  stageTransitions: many(stageTransitions),
  approvals: many(approvals),
  changeOrders: many(changeOrders),
  risks: many(riskItems),
  issues: many(issues),
  decisions: many(decisions),
  invoices: many(invoices),
  shipments: many(shipments),
  lessonsLearned: one(lessonsLearned)
}));

export const clientsRelations = relations(clients, ({ many }) => ({
  projects: many(projects),
  invoices: many(invoices)
}));

export const itemsRelations = relations(items, ({ one, many }) => ({
  package: one(packages, { fields: [items.packageId], references: [packages.id] }),
  room: one(rooms, { fields: [items.roomId], references: [rooms.id] }),
  landedCost: one(landedCostBreakdowns, { fields: [items.id], references: [landedCostBreakdowns.itemId] }),
  quotes: many(quotes),
  approvals: many(approvals)
}));

export const packagesRelations = relations(packages, ({ one, many }) => ({
  project: one(projects, { fields: [packages.projectId], references: [projects.id] }),
  items: many(items)
}));

/* ─────────────────────────── WAVE 5 — ELEMENT LIST ─────────────────────────── */

export const elementListViewKindEnum = pgEnum('element_list_view_kind', [
  'internal', 'customer', 'supplier'
]);

export const elementListExportFormatEnum = pgEnum('element_list_export_format', [
  'pdf', 'xlsx', 'csv', 'web_link'
]);

export const dropboxExportStatusEnum = pgEnum('dropbox_export_status', [
  'queued', 'uploading', 'done', 'failed'
]);

/**
 * ItemImage — the product photo that appears next to each item on the Element List.
 *
 * Separate from spec_file_id (which is for technical spec sheets / CAD).
 * Holds three variants: original (as uploaded), processed (background removed
 * via @imgly/background-removal in the browser), and thumbnail.
 */
export const itemImages = pgTable('item_images', {
  id: uuid('id').primaryKey().defaultRandom(),
  itemId: uuid('item_id').notNull().references(() => items.id, { onDelete: 'cascade' }),
  originalBlobUri: varchar('original_blob_uri', { length: 600 }).notNull(),
  processedBlobUri: varchar('processed_blob_uri', { length: 600 }),
  thumbnailBlobUri: varchar('thumbnail_blob_uri', { length: 600 }),
  originalMime: varchar('original_mime', { length: 60 }).notNull(),
  originalBytes: integer('original_bytes').notNull(),
  processedBytes: integer('processed_bytes'),
  widthPx: integer('width_px'),
  heightPx: integer('height_px'),
  backgroundRemovedAt: timestamp('background_removed_at', { withTimezone: true }),
  uploadedBy: uuid('uploaded_by').notNull().references(() => users.id),
  uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
  caption: varchar('caption', { length: 300 }),
  displayOrder: integer('display_order').notNull().default(0)
}, t => ({
  itemIdx: index('item_images_item_idx').on(t.itemId, t.displayOrder)
}));

/**
 * ElementListSnapshot — point-in-time exports.
 *
 * Every PDF / Excel / CSV export creates a row here so we can answer
 * "what did Siv send on 31.05.2026?" months later.
 */
export const elementListSnapshots = pgTable('element_list_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  reference: varchar('reference', { length: 40 }).notNull().unique(),    // ELS-014-008
  projectId: uuid('project_id').notNull().references(() => projects.id),
  version: integer('version').notNull(),                                  // per-project autoincrement
  viewKind: elementListViewKindEnum('view_kind').notNull(),
  supplierVendorId: uuid('supplier_vendor_id').references(() => vendors.id),
  exportFormat: elementListExportFormatEnum('export_format').notNull(),
  blobUri: varchar('blob_uri', { length: 600 }),                          // null for web_link
  shareLinkId: uuid('share_link_id'),                                     // populated when export_format = web_link
  filtersApplied: jsonb('filters_applied'),                               // room/package/status filters at time of export
  itemCount: integer('item_count').notNull(),
  totalValue: numeric('total_value', { precision: 14, scale: 2 }),
  totalValueCurrency: currencyEnum('total_value_currency'),
  generatedBy: uuid('generated_by').notNull().references(() => users.id),
  generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
  notes: text('notes')
}, t => ({
  projectIdx: index('els_project_idx').on(t.projectId, t.generatedAt),
  versionIdx: uniqueIndex('els_project_version_idx').on(t.projectId, t.version)
}));

/**
 * ElementListShareLink — token-secured public URL.
 *
 * Lets a client or supplier view their slice of the Element List without
 * logging in. Revocable, expirable, audit-tracked.
 */
export const elementListShareLinks = pgTable('element_list_share_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  token: varchar('token', { length: 64 }).notNull().unique(),             // base64url, 48 chars + buffer
  projectId: uuid('project_id').notNull().references(() => projects.id),
  viewKind: elementListViewKindEnum('view_kind').notNull(),               // customer | supplier
  supplierVendorId: uuid('supplier_vendor_id').references(() => vendors.id),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  revokedBy: uuid('revoked_by').references(() => users.id),
  passwordHash: varchar('password_hash', { length: 100 }),                // bcrypt; optional
  lastAccessedAt: timestamp('last_accessed_at', { withTimezone: true }),
  accessCount: integer('access_count').notNull().default(0),
  label: varchar('label', { length: 200 })                                // staff-facing label e.g. "Anna pre-meeting review"
}, t => ({
  tokenIdx: uniqueIndex('els_share_link_token_idx').on(t.token),
  projectIdx: index('els_share_link_project_idx').on(t.projectId, t.revokedAt)
}));

/**
 * DropboxCredentials — OAuth tokens for per-user Dropbox export.
 *
 * One row per user. Tokens encrypted at rest (the *_encrypted columns
 * hold base64-wrapped ciphertext; the app decrypts on use using a key
 * sourced from Supabase Vault).
 */
export const dropboxCredentials = pgTable('dropbox_credentials', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  accessTokenEncrypted: text('access_token_encrypted').notNull(),
  refreshTokenEncrypted: text('refresh_token_encrypted').notNull(),
  tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }).notNull(),
  accountEmail: varchar('account_email', { length: 320 }),
  accountName: varchar('account_name', { length: 200 }),
  connectedAt: timestamp('connected_at', { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp('revoked_at', { withTimezone: true })
});

/**
 * DropboxExports — audit log of files pushed to Dropbox.
 */
export const dropboxExports = pgTable('dropbox_exports', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  sourceBlobUri: varchar('source_blob_uri', { length: 600 }).notNull(),   // Supabase Storage URI of the file pushed
  sourceFileName: varchar('source_file_name', { length: 400 }).notNull(), // local filename (with DD.MM.YYYY)
  sourceFileRecordId: uuid('source_file_record_id'),                      // optional FK into file_records if the file lives there
  dropboxPath: varchar('dropbox_path', { length: 800 }).notNull(),
  dropboxFileId: varchar('dropbox_file_id', { length: 120 }),
  status: dropboxExportStatusEnum('status').notNull().default('queued'),
  errorMessage: text('error_message'),
  exportedBy: uuid('exported_by').notNull().references(() => users.id),
  exportedAt: timestamp('exported_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true })
}, t => ({
  projectIdx: index('dropbox_exports_project_idx').on(t.projectId, t.exportedAt),
  userIdx: index('dropbox_exports_user_idx').on(t.exportedBy, t.exportedAt)
}));

/* Relations for Wave 5 entities */

export const itemImagesRelations = relations(itemImages, ({ one }) => ({
  item: one(items, { fields: [itemImages.itemId], references: [items.id] }),
  uploadedByUser: one(users, { fields: [itemImages.uploadedBy], references: [users.id] })
}));

export const elementListSnapshotsRelations = relations(elementListSnapshots, ({ one }) => ({
  project: one(projects, { fields: [elementListSnapshots.projectId], references: [projects.id] }),
  supplierVendor: one(vendors, { fields: [elementListSnapshots.supplierVendorId], references: [vendors.id] }),
  shareLink: one(elementListShareLinks, { fields: [elementListSnapshots.shareLinkId], references: [elementListShareLinks.id] }),
  generatedByUser: one(users, { fields: [elementListSnapshots.generatedBy], references: [users.id] })
}));

export const elementListShareLinksRelations = relations(elementListShareLinks, ({ one }) => ({
  project: one(projects, { fields: [elementListShareLinks.projectId], references: [projects.id] }),
  supplierVendor: one(vendors, { fields: [elementListShareLinks.supplierVendorId], references: [vendors.id] }),
  createdByUser: one(users, { fields: [elementListShareLinks.createdBy], references: [users.id] })
}));

export const dropboxExportsRelations = relations(dropboxExports, ({ one }) => ({
  project: one(projects, { fields: [dropboxExports.projectId], references: [projects.id] }),
  exportedByUser: one(users, { fields: [dropboxExports.exportedBy], references: [users.id] })
}));

/* Relations for the time-entries table (declaration above in the
 * existing schema block — extended in-place for the Coaching MVP-A
 * uplift). */
export const timeEntriesRelations = relations(timeEntries, ({ one }) => ({
  project: one(projects, { fields: [timeEntries.projectId], references: [projects.id] }),
  user: one(users, { fields: [timeEntries.userId], references: [users.id] })
}));

/* ─────────────────────────── PROJECT EVIDENCE NOTES ─────────────────────────── */

/**
 * Project Coaching MVP-B — see `28-project-coaching-layer.md` §7.3.
 *
 * The structured output of the Coach drawer wizard. Each note carries
 * an internal phrasing (staff-facing) and an optional customer-visible
 * summary (which the Work Evidence Summary report uses verbatim).
 *
 * `sourceType` + `sourceId` are polymorphic — they connect the note to
 * the entity the wizard was launched from (a time entry, an approval,
 * a comment, etc.) or `coach_wizard` when it's a free-standing note.
 *
 * Notes are scoped to a reporting period (typically a week, per
 * resolved decision #2 in doc 28). The Work Evidence Summary
 * generator (MVP-E) pulls notes whose period intersects the
 * requested summary period, grouped by `evidenceCategory`.
 */
export const projectEvidenceNotes = pgTable('project_evidence_notes', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),

  // Polymorphic provenance — where this note came from.
  sourceType: varchar('source_type', { length: 40 }).notNull(),
  // Values: time_entry | approval | change_order | customer_comment |
  //         coach_wizard | scope_update | procurement_event |
  //         delivery_event | handover_event | manual
  sourceId: uuid('source_id'),

  evidenceCategory: evidenceCategoryEnum('evidence_category').notNull(),

  internalNote: text('internal_note').notNull(),
  customerSummary: text('customer_summary'),

  // Reporting period the note belongs to (weekly per decision #2).
  reportingPeriodStart: date('reporting_period_start').notNull(),
  reportingPeriodEnd: date('reporting_period_end').notNull(),
  includeInReport: boolean('include_in_report').notNull().default(true),

  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, t => ({
  projectIdx: index('pen_project_period_idx').on(t.projectId, t.reportingPeriodEnd),
  reportIdx: index('pen_for_report_idx').on(t.projectId, t.includeInReport)
}));

export const projectEvidenceNotesRelations = relations(projectEvidenceNotes, ({ one }) => ({
  project: one(projects, { fields: [projectEvidenceNotes.projectId], references: [projects.id] }),
  author: one(users, { fields: [projectEvidenceNotes.createdBy], references: [users.id] })
}));

/* ─────────────────────────── PROJECT COACH RECOMMENDATIONS ─────────────────────────── */

/**
 * Project Coaching MVP-D — see `28-project-coaching-layer.md` §7.2.
 *
 * The persistence layer behind the Project Coach dashboard. The rules
 * engine in `coach-health.ts` produces in-memory `Recommendation`s
 * keyed by a stable `recommendation_key` (e.g.
 * `brief.no_signoff.<projectId>`). The dashboard's sync step upserts
 * each into this table:
 *
 *   - New key → INSERT with status='open'
 *   - Existing key in any non-terminal status → no-op (preserve
 *     user state — acknowledged / dismissed stays as the user set it)
 *   - Existing key in `open` or `acknowledged` whose rule no longer
 *     fires this run → marked `resolved` (the condition cleared)
 *   - Stale `dismissed` rows survive — the user explicitly silenced
 *     them; we don't auto-resurrect
 *
 * `recommendation_key` is the stable identity across runs. Unique per
 * (project, key) so the upsert is straightforward.
 *
 * `severity` and `module` are denormalised from the rules engine so
 * the dashboard can sort + group without re-running the rules.
 *
 * `observation_key` + `observation_params` are stored so the dashboard
 * can render the translated observation line; the rules engine doesn't
 * persist already-translated strings (i18n stays at render time).
 */
export const projectCoachRecommendations = pgTable('project_coach_recommendations', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),

  /** Stable identity from the rules engine, e.g. `brief.no_signoff.<projectId>`. */
  recommendationKey: varchar('recommendation_key', { length: 200 }).notNull(),
  /** The rule's i18n key root (e.g. `coach_rule.brief_no_signoff`). */
  ruleKey: varchar('rule_key', { length: 120 }).notNull(),
  module: varchar('module', { length: 40 }).notNull(),
  severity: coachRecommendationSeverityEnum('severity').notNull(),

  observationKey: varchar('observation_key', { length: 200 }).notNull(),
  observationParams: jsonb('observation_params'),
  actionLabelKey: varchar('action_label_key', { length: 200 }).notNull(),
  actionHref: text('action_href').notNull(),

  status: coachRecommendationStatusEnum('status').notNull().default('open'),
  acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
  acknowledgedBy: uuid('acknowledged_by').references(() => users.id),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  resolvedBy: uuid('resolved_by').references(() => users.id),
  dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
  dismissedBy: uuid('dismissed_by').references(() => users.id),

  firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, t => ({
  projectKeyIdx: uniqueIndex('pcr_project_key_idx').on(t.projectId, t.recommendationKey),
  // Fast lookup for the dashboard page: open / acknowledged per project.
  openIdx: index('pcr_open_idx').on(t.projectId, t.severity)
    .where(sql`status IN ('open', 'acknowledged')`)
}));

export const projectCoachRecommendationsRelations = relations(projectCoachRecommendations, ({ one }) => ({
  project: one(projects, { fields: [projectCoachRecommendations.projectId], references: [projects.id] })
}));
