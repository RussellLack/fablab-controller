'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { cx } from '@/lib/utils';
import { STAFF_ROLES, type ActionResult } from '@/lib/roles';
import {
  addStaffMember,
  updateStaffRoles,
  setStaffActive,
  removeStaffMember
} from '@/server/actions/staff';

export type TeamMember = {
  email: string;
  name: string;
  roles: string[];
  active: boolean;
  pending: boolean;
};

const ALL_ROLES = STAFF_ROLES as readonly string[];

function RoleChips({ roles }: { roles: string[] }) {
  const t = useTranslations();
  if (!roles.length) return <span className="text-ink-3 text-[12px]">—</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {roles.map((r) => (
        <span
          key={r}
          className="bg-bg text-ink-2 text-[11px] px-1.5 py-0.5 rounded border border-line"
        >
          {t(`staff.role.${r}`)}
        </span>
      ))}
    </span>
  );
}

export function TeamClient({
  members,
  currentEmail
}: {
  members: TeamMember[];
  currentEmail: string;
}) {
  const t = useTranslations();
  const [addState, addAction, adding] = useActionState<ActionResult | null, FormData>(
    addStaffMember,
    null
  );
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  const [draftRoles, setDraftRoles] = useState<string[]>([]);
  const [rowError, setRowError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  // Reset the add form's fields visually after a successful add by keying it.
  const [formKey, setFormKey] = useState(0);
  useEffect(() => {
    if (addState?.ok) setFormKey((k) => k + 1);
  }, [addState]);

  function run(p: Promise<ActionResult>) {
    setRowError(null);
    startTransition(async () => {
      const res = await p;
      if (!res.ok) setRowError(res.error);
    });
  }

  function startEdit(m: TeamMember) {
    setEditing(m.email);
    setDraftRoles(m.roles);
    setRowError(null);
  }

  function toggleDraftRole(role: string) {
    setDraftRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  }

  return (
    <div className="max-w-4xl">
      <header className="mb-6">
        <h1 className="text-[20px] font-semibold text-ink">{t('staff.title')}</h1>
        <p className="text-[13px] text-ink-2 mt-1">{t('staff.subtitle')}</p>
      </header>

      {/* Add member */}
      <form
        key={formKey}
        action={addAction}
        className="border border-line rounded-lg p-4 mb-6 bg-surface"
      >
        <div className="text-[13px] font-semibold text-ink mb-3">
          {t('staff.add_heading')}
        </div>
        <div className="grid grid-cols-[1fr_1fr] gap-3">
          <label className="block">
            <span className="text-[12px] text-ink-2">{t('staff.field_email')}</span>
            <input
              name="email"
              type="email"
              required
              placeholder="name@example.com"
              className="mt-1 w-full px-2.5 py-2 border border-line rounded-md text-[13px]"
            />
          </label>
          <label className="block">
            <span className="text-[12px] text-ink-2">{t('staff.field_name')}</span>
            <input
              name="name"
              type="text"
              placeholder={t('staff.field_name_ph')}
              className="mt-1 w-full px-2.5 py-2 border border-line rounded-md text-[13px]"
            />
          </label>
        </div>

        <div className="mt-3">
          <span className="text-[12px] text-ink-2">{t('staff.field_roles')}</span>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {ALL_ROLES.map((role) => (
              <label
                key={role}
                className="flex items-center gap-1.5 text-[12px] text-ink border border-line rounded-md px-2 py-1 cursor-pointer hover:bg-bg"
              >
                <input
                  type="checkbox"
                  name="roles"
                  value={role}
                  defaultChecked={role === 'project_lead'}
                />
                {t(`staff.role.${role}`)}
              </label>
            ))}
          </div>
        </div>

        <label className="mt-3 flex items-center gap-2 text-[12px] text-ink-2">
          <input type="checkbox" name="notify" value="on" defaultChecked />
          {t('staff.notify_label')}
        </label>

        {addState && !addState.ok && (
          <div className="mt-3 text-[12px] text-red-600">{addState.error}</div>
        )}
        {addState?.ok && (
          <div className="mt-3 text-[12px] text-green-700">{t('staff.added_ok')}</div>
        )}

        <div className="mt-4">
          <button
            type="submit"
            disabled={adding}
            className="bg-ink text-surface text-[13px] font-medium px-4 py-2 rounded-md hover:opacity-90 disabled:opacity-50"
          >
            {adding ? t('staff.adding') : t('staff.add_button')}
          </button>
        </div>
      </form>

      {rowError && (
        <div className="mb-3 text-[12px] text-red-600">{rowError}</div>
      )}

      {/* Roster */}
      <div className="border border-line rounded-lg overflow-hidden">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="bg-bg text-ink-3 text-[11px] uppercase tracking-wider">
              <th className="text-left font-medium px-4 py-2">{t('staff.col_member')}</th>
              <th className="text-left font-medium px-4 py-2">{t('staff.col_roles')}</th>
              <th className="text-left font-medium px-4 py-2">{t('staff.col_status')}</th>
              <th className="text-right font-medium px-4 py-2">{t('staff.col_actions')}</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const isSelf = m.email.toLowerCase() === currentEmail;
              const isEditing = editing === m.email;
              const status = m.pending
                ? t('staff.status_pending')
                : m.active
                ? t('staff.status_active')
                : t('staff.status_inactive');
              return (
                <tr key={m.email} className="border-t border-line align-top">
                  <td className="px-4 py-3">
                    <div className="font-medium text-ink">{m.name}</div>
                    <div className="text-ink-3 text-[12px]">{m.email}</div>
                    {isSelf && (
                      <div className="text-accent text-[11px] mt-0.5">{t('staff.you')}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {isEditing ? (
                      <div className="flex flex-wrap gap-1.5">
                        {ALL_ROLES.map((role) => (
                          <label
                            key={role}
                            className="flex items-center gap-1 text-[11px] border border-line rounded px-1.5 py-0.5 cursor-pointer hover:bg-bg"
                          >
                            <input
                              type="checkbox"
                              checked={draftRoles.includes(role)}
                              onChange={() => toggleDraftRole(role)}
                            />
                            {t(`staff.role.${role}`)}
                          </label>
                        ))}
                      </div>
                    ) : (
                      <RoleChips roles={m.roles} />
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cx(
                        'text-[11px] px-1.5 py-0.5 rounded-full',
                        m.pending && 'bg-amber-100 text-amber-700',
                        !m.pending && m.active && 'bg-green-100 text-green-700',
                        !m.pending && !m.active && 'bg-line text-ink-3'
                      )}
                    >
                      {status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2 flex-wrap">
                      {isEditing ? (
                        <>
                          <button
                            onClick={() => {
                              run(updateStaffRoles(m.email, draftRoles));
                              setEditing(null);
                            }}
                            disabled={pending}
                            className="text-[12px] px-2 py-1 rounded bg-ink text-surface hover:opacity-90 disabled:opacity-50"
                          >
                            {t('staff.save')}
                          </button>
                          <button
                            onClick={() => setEditing(null)}
                            className="text-[12px] px-2 py-1 rounded border border-line text-ink-2 hover:bg-bg"
                          >
                            {t('staff.cancel')}
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => startEdit(m)}
                            className="text-[12px] px-2 py-1 rounded border border-line text-ink-2 hover:bg-bg"
                          >
                            {t('staff.edit_roles')}
                          </button>
                          {!m.pending &&
                            (m.active ? (
                              <button
                                onClick={() => run(setStaffActive(m.email, false))}
                                disabled={pending || isSelf}
                                className="text-[12px] px-2 py-1 rounded border border-line text-ink-2 hover:bg-bg disabled:opacity-40"
                              >
                                {t('staff.deactivate')}
                              </button>
                            ) : (
                              <button
                                onClick={() => run(setStaffActive(m.email, true))}
                                disabled={pending}
                                className="text-[12px] px-2 py-1 rounded border border-line text-ink-2 hover:bg-bg disabled:opacity-50"
                              >
                                {t('staff.activate')}
                              </button>
                            ))}
                          {confirmRemove === m.email ? (
                            <button
                              onClick={() => {
                                run(removeStaffMember(m.email));
                                setConfirmRemove(null);
                              }}
                              disabled={pending || isSelf}
                              className="text-[12px] px-2 py-1 rounded bg-red-600 text-white hover:opacity-90 disabled:opacity-40"
                            >
                              {t('staff.confirm_remove')}
                            </button>
                          ) : (
                            <button
                              onClick={() => setConfirmRemove(m.email)}
                              disabled={isSelf}
                              className="text-[12px] px-2 py-1 rounded border border-line text-red-600 hover:bg-red-50 disabled:opacity-40"
                            >
                              {m.pending ? t('staff.remove_invite') : t('staff.remove')}
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
