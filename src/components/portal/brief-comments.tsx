'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import {
  deleteBriefComment,
  editBriefComment,
  postBriefComment
} from '@/server/actions/customer-comments';

/**
 * Shared brief-discussion thread, mounted on both the staff project
 * brief page and the customer portal brief page. Single-level threading:
 * every comment is either top-level or a reply to a top-level. Reply-
 * to-a-reply collapses to a sibling reply (the schema allows arbitrary
 * depth; the UI flattens for clarity).
 *
 * Author can edit + delete their own; everyone can read and reply.
 * Staff comments carry a small "Fablab" pill so the customer can see
 * at a glance who's talking.
 */

export type BriefComment = {
  id: string;
  authorId: string;
  authorIsStaff: boolean;
  body: string;
  section: string | null;
  replyToId: string | null;
  createdAt: string; // ISO
  editedAt: string | null;
};

type Props = {
  projectId: string;
  initial: BriefComment[];
  currentUserId: string;
  /**
   * Whether the *current* user can post in this thread.
   * Staff: true everywhere. Customers: true only when they have an
   * active invitation (the parent page already enforced this; the prop
   * controls whether to render the form).
   */
  canPost: boolean;
};

export function BriefComments({
  projectId,
  initial,
  currentUserId,
  canPost
}: Props) {
  const t = useTranslations();

  // Build the parent → replies map. Reply rows whose parent is missing
  // (e.g. the parent was deleted) get promoted to top-level so the
  // content isn't lost; they still display chronologically inline.
  const topLevel: BriefComment[] = [];
  const childrenByParent: Record<string, BriefComment[]> = {};
  const knownIds = new Set(initial.map((c) => c.id));

  for (const c of initial) {
    if (c.replyToId && knownIds.has(c.replyToId)) {
      (childrenByParent[c.replyToId] ??= []).push(c);
    } else {
      topLevel.push(c);
    }
  }

  return (
    <div className="card">
      <h3 className="card-title mb-3">{t('brief_comments.title')}</h3>

      {topLevel.length === 0 ? (
        <p className="text-[12px] text-ink-3 italic mb-3">
          {t('brief_comments.empty')}
        </p>
      ) : (
        <ul className="space-y-3 mb-4">
          {topLevel.map((c) => (
            <li key={c.id}>
              <CommentRow
                comment={c}
                projectId={projectId}
                currentUserId={currentUserId}
                canPost={canPost}
              />
              {childrenByParent[c.id]?.length ? (
                <ul className="pl-5 mt-2 space-y-2 border-l border-line">
                  {childrenByParent[c.id]!.map((reply) => (
                    <li key={reply.id}>
                      <CommentRow
                        comment={reply}
                        projectId={projectId}
                        currentUserId={currentUserId}
                        canPost={canPost}
                        isReply
                      />
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canPost ? (
        <NewCommentForm projectId={projectId} />
      ) : (
        <p className="text-[12px] text-ink-3 italic">
          {t('brief_comments.read_only')}
        </p>
      )}
    </div>
  );
}

function CommentRow({
  comment,
  projectId,
  currentUserId,
  canPost,
  isReply
}: {
  comment: BriefComment;
  projectId: string;
  currentUserId: string;
  canPost: boolean;
  isReply?: boolean;
}) {
  const t = useTranslations();
  const [mode, setMode] = useState<'view' | 'edit' | 'reply'>('view');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const isMine = comment.authorId === currentUserId;

  function doDelete() {
    if (!window.confirm(t('brief_comments.confirm_delete'))) return;
    setError(null);
    startTransition(async () => {
      const r = await deleteBriefComment(comment.id);
      if (!r.ok) setError(r.error);
      else router.refresh();
    });
  }

  return (
    <div className="text-[13px]">
      <div className="flex items-center gap-2 mb-1">
        <span
          className={`pill ${
            comment.authorIsStaff
              ? 'text-accent bg-accent-soft'
              : 'text-info bg-info-soft'
          }`}
        >
          {comment.authorIsStaff
            ? t('brief_comments.author_staff')
            : t('brief_comments.author_customer')}
        </span>
        <span className="text-[11px] text-ink-3">
          {formatTimestamp(comment.createdAt)}
          {comment.editedAt ? ` · ${t('brief_comments.edited')}` : ''}
        </span>
      </div>

      {mode === 'edit' ? (
        <EditCommentForm
          comment={comment}
          onDone={() => setMode('view')}
        />
      ) : (
        <p className="whitespace-pre-wrap leading-snug">{comment.body}</p>
      )}

      {error && <div className="text-[11px] text-warn mt-1">{error}</div>}

      {mode === 'view' && (
        <div className="flex items-center gap-2 mt-1.5 text-[11px] text-ink-3">
          {canPost && !isReply && (
            <button
              onClick={() => setMode('reply')}
              className="hover:text-ink"
              disabled={isPending}
            >
              {t('brief_comments.reply')}
            </button>
          )}
          {isMine && (
            <>
              <button
                onClick={() => setMode('edit')}
                className="hover:text-ink"
                disabled={isPending}
              >
                {t('brief_comments.edit')}
              </button>
              <button
                onClick={doDelete}
                className="hover:text-warn"
                disabled={isPending}
              >
                {t('brief_comments.delete')}
              </button>
            </>
          )}
        </div>
      )}

      {mode === 'reply' && (
        <div className="mt-2">
          <NewCommentForm
            projectId={projectId}
            replyToId={comment.id}
            onDone={() => setMode('view')}
            compact
          />
        </div>
      )}
    </div>
  );
}

function NewCommentForm({
  projectId,
  replyToId,
  onDone,
  compact
}: {
  projectId: string;
  replyToId?: string;
  onDone?: () => void;
  compact?: boolean;
}) {
  const t = useTranslations();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    if (replyToId) fd.set('replyToId', replyToId);
    setError(null);
    startTransition(async () => {
      const r = await postBriefComment(projectId, fd);
      if (!r.ok) {
        setError(r.error);
      } else {
        form.reset();
        router.refresh();
        onDone?.();
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <textarea
        name="body"
        rows={compact ? 2 : 3}
        required
        placeholder={
          replyToId
            ? t('brief_comments.reply_placeholder')
            : t('brief_comments.new_placeholder')
        }
        className="w-full px-3 py-2 border border-line rounded-md bg-surface text-[13px] focus:outline-none focus:ring-2 focus:ring-accent/30 resize-none"
        disabled={isPending}
      />
      {error && (
        <div className="text-[11px] text-warn bg-warn-soft border border-warn/20 rounded px-2 py-1">
          {error}
        </div>
      )}
      <div className="flex items-center justify-end gap-2">
        {onDone && (
          <button
            type="button"
            onClick={onDone}
            className="btn btn-ghost text-[12px]"
            disabled={isPending}
          >
            {t('action.cancel')}
          </button>
        )}
        <button
          type="submit"
          className="btn btn-primary text-[12px]"
          disabled={isPending}
        >
          {isPending
            ? t('brief_comments.posting')
            : replyToId
              ? t('brief_comments.send_reply')
              : t('brief_comments.send')}
        </button>
      </div>
    </form>
  );
}

function EditCommentForm({
  comment,
  onDone
}: {
  comment: BriefComment;
  onDone: () => void;
}) {
  const t = useTranslations();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const r = await editBriefComment(comment.id, fd);
      if (!r.ok) setError(r.error);
      else {
        router.refresh();
        onDone();
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <textarea
        name="body"
        rows={3}
        required
        defaultValue={comment.body}
        className="w-full px-3 py-2 border border-line rounded-md bg-surface text-[13px] focus:outline-none focus:ring-2 focus:ring-accent/30 resize-none"
        disabled={isPending}
      />
      {error && (
        <div className="text-[11px] text-warn bg-warn-soft border border-warn/20 rounded px-2 py-1">
          {error}
        </div>
      )}
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onDone}
          className="btn btn-ghost text-[12px]"
          disabled={isPending}
        >
          {t('action.cancel')}
        </button>
        <button
          type="submit"
          className="btn btn-primary text-[12px]"
          disabled={isPending}
        >
          {isPending ? t('brief_comments.saving') : t('brief_comments.save_edit')}
        </button>
      </div>
    </form>
  );
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
}
