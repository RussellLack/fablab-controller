'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { inviteProjectCustomer } from '@/server/actions/customer-portal';

/**
 * "+ Invite customer" button + lightweight modal.
 *
 * Single-shot form: email (required) + optional personal note.
 * Submits via the inviteProjectCustomer server action which is
 * idempotent on (project, email) — re-inviting an existing row
 * clears revoked_at, updates the note, and re-sends the magic link.
 */
export function InviteCustomerLauncher({ projectId }: { projectId: string }) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const emailRef = useRef<HTMLInputElement>(null);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    window.addEventListener('keydown', onKey);
    // Focus the email field on open.
    queueMicrotask(() => emailRef.current?.focus());
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  function close() {
    setOpen(false);
    setError(null);
    setSuccess(null);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await inviteProjectCustomer(projectId, fd);
      if (result.ok) {
        const email = fd.get('email')?.toString().trim() ?? '';
        setSuccess(t('customer_portal.invite_sent', { email }));
        // Reset the form so a follow-up invite is clean.
        (e.target as HTMLFormElement).reset();
        queueMicrotask(() => emailRef.current?.focus());
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn btn-primary text-[12px]">
        {t('customer_portal.invite_cta')}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div className="bg-surface border border-line rounded-xl w-[420px] max-w-full p-6 shadow-xl">
            <div className="flex items-start justify-between mb-3">
              <h2 className="text-[15px] font-semibold">
                {t('customer_portal.invite_title')}
              </h2>
              <button
                onClick={close}
                className="text-ink-3 hover:text-ink text-[18px] leading-none"
                aria-label={t('action.cancel')}
              >
                ×
              </button>
            </div>
            <p className="text-[12px] text-ink-2 mb-4 leading-snug">
              {t('customer_portal.invite_body')}
            </p>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-[12px] text-ink-2 mb-1">
                  {t('customer_portal.invite_email_label')}
                </label>
                <input
                  ref={emailRef}
                  type="email"
                  name="email"
                  required
                  autoComplete="off"
                  placeholder="name@example.com"
                  className="w-full px-3 py-2 border border-line rounded-md bg-surface text-[13px] focus:outline-none focus:ring-2 focus:ring-accent/30"
                />
              </div>
              <div>
                <label className="block text-[12px] text-ink-2 mb-1">
                  {t('customer_portal.invite_note_label')}
                </label>
                <textarea
                  name="note"
                  rows={3}
                  placeholder={t('customer_portal.invite_note_placeholder')}
                  className="w-full px-3 py-2 border border-line rounded-md bg-surface text-[13px] focus:outline-none focus:ring-2 focus:ring-accent/30 resize-none"
                />
              </div>

              {error && (
                <div className="text-[12px] text-warn bg-warn-soft border border-warn/20 rounded px-3 py-2">
                  {error}
                </div>
              )}
              {success && (
                <div className="text-[12px] text-ok bg-ok-soft border border-ok/20 rounded px-3 py-2">
                  {success}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button type="button" onClick={close} className="btn">
                  {t('action.cancel')}
                </button>
                <button type="submit" className="btn btn-primary" disabled={isPending}>
                  {isPending
                    ? t('customer_portal.invite_sending')
                    : t('customer_portal.invite_submit')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
