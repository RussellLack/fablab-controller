'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { createApproval } from '@/server/actions/approvals';
import { cx } from '@/lib/utils';

type ScopeVersion = { id: string; versionNumber: number; status: string };

export function NewApprovalForm({
  projectId,
  projectRef,
  scopeVersions
}: {
  projectId: string;
  projectRef: string;
  scopeVersions: ScopeVersion[];
}) {
  const t = useTranslations();
  const bound = createApproval.bind(null, projectId, projectRef);
  const [state, action, pending] = useActionState(bound, null);
  const [targetType, setTargetType] = useState<string>(
    scopeVersions[0] ? 'scope_baseline_version' : ''
  );
  const [targetId, setTargetId] = useState<string>(scopeVersions[0]?.id ?? '');

  return (
    <form action={action} className="space-y-4 max-w-3xl">
      {state && !state.ok && (
        <div className="card bg-danger-soft border-danger text-danger text-[13px]">{state.error}</div>
      )}

      <Section title={t('approval.section_target')}>
        <Row label={t('approval.target_type')} required>
          <select
            value={targetType}
            onChange={e => setTargetType(e.target.value)}
            name="targetType"
            className="w-full px-2.5 py-2 border border-line rounded-md text-[13px]"
            required
          >
            <option value="">—</option>
            <option value="scope_baseline_version">{t('approval.target.scope')}</option>
            {/* Future: enable when item/quote/po UIs land */}
            <option value="item" disabled>{t('approval.target.item')} ({t('approval.coming_soon')})</option>
            <option value="quote" disabled>{t('approval.target.quote')} ({t('approval.coming_soon')})</option>
            <option value="purchase_order" disabled>{t('approval.target.po')} ({t('approval.coming_soon')})</option>
          </select>
        </Row>
        {targetType === 'scope_baseline_version' && (
          <Row label={t('approval.scope_version')} required>
            <select
              value={targetId}
              onChange={e => setTargetId(e.target.value)}
              name="targetId"
              className="w-full px-2.5 py-2 border border-line rounded-md text-[13px]"
              required
            >
              {scopeVersions.length === 0 ? (
                <option value="">{t('approval.no_scope_versions')}</option>
              ) : (
                scopeVersions.map(v => (
                  <option key={v.id} value={v.id}>
                    v{v.versionNumber} — {t(`scope.version_status.${v.status}`)}
                  </option>
                ))
              )}
            </select>
          </Row>
        )}
      </Section>

      <Section title={t('approval.section_substance')}>
        <Row label={t('approval.subject')} required>
          <input name="subject" required className="w-full px-2.5 py-2 border border-line rounded-md text-[13px]" placeholder={t('approval.subject_placeholder')} />
        </Row>
        <Row label={t('approval.description')}>
          <textarea name="description" rows={4} className="w-full px-2.5 py-2 border border-line rounded-md text-[13px]" placeholder={t('approval.description_placeholder')} />
        </Row>
        <Row label={t('approval.version')}>
          <input name="version" className="w-full px-2.5 py-2 border border-line rounded-md text-[13px]" placeholder="v2" />
        </Row>
        <Row label={t('approval.price')}>
          <div className="flex gap-2">
            <input name="price" type="number" step="0.01" className="flex-[2] px-2.5 py-2 border border-line rounded-md text-[13px]" />
            <select name="priceCurrency" defaultValue="NOK" className="flex-1 px-2.5 py-2 border border-line rounded-md text-[13px]">
              {['NOK', 'EUR', 'USD', 'GBP', 'SEK', 'DKK'].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </Row>
        <Row label={t('approval.freight')}>
          <input name="freightAssumptions" className="w-full px-2.5 py-2 border border-line rounded-md text-[13px]" />
        </Row>
        <Row label={t('approval.customs')}>
          <input name="customsAssumptions" className="w-full px-2.5 py-2 border border-line rounded-md text-[13px]" />
        </Row>
        <Row label={t('approval.lead_time_days')}>
          <input name="leadTimeDays" type="number" className="w-full px-2.5 py-2 border border-line rounded-md text-[13px]" />
        </Row>
        <Row label={t('approval.supplier')}>
          <input name="supplierName" className="w-full px-2.5 py-2 border border-line rounded-md text-[13px]" />
        </Row>
        <Row label={t('approval.consequence')} required>
          <textarea name="approvalConsequence" rows={2} required className="w-full px-2.5 py-2 border border-line rounded-md text-[13px]" placeholder={t('approval.consequence_placeholder')} />
        </Row>
      </Section>

      <Section title={t('approval.section_approver')}>
        <Row label={t('approval.approver_name')} required>
          <input name="approverName" required className="w-full px-2.5 py-2 border border-line rounded-md text-[13px]" />
        </Row>
        <Row label={t('approval.approver_email')} required>
          <input name="approverEmail" type="email" required className="w-full px-2.5 py-2 border border-line rounded-md text-[13px]" />
        </Row>
        <Row label={t('approval.channel')} required>
          <select name="approvalChannel" required className="w-full px-2.5 py-2 border border-line rounded-md text-[13px]">
            <option value="email">{t('approval.channel.email')}</option>
            <option value="portal">{t('approval.channel.portal')}</option>
            <option value="in_person">{t('approval.channel.in_person')}</option>
            <option value="phone_confirmed_in_writing">{t('approval.channel.phone')}</option>
            <option value="signed_document">{t('approval.channel.signed')}</option>
          </select>
        </Row>
        <Row label={t('approval.valid_until')}>
          <input name="validUntil" type="date" className="w-full px-2.5 py-2 border border-line rounded-md text-[13px]" />
        </Row>
      </Section>

      <div className="flex justify-end gap-2">
        <button type="submit" disabled={pending} className={cx('btn btn-primary', pending && 'opacity-60')}>
          {pending ? t('action.saving') : t('action.save_as_draft')}
        </button>
      </div>
      <p className="text-ink-3 text-xs">{t('approval.new_footer')}</p>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <h3 className="card-title mb-3">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Row({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[200px_1fr] gap-4 items-center">
      <label className="text-[13px] text-ink-2">{label}{required && '*'}</label>
      <div>{children}</div>
    </div>
  );
}
