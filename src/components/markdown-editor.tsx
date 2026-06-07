'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Tabbed Markdown editor used on the notes field of every edit form.
 * Two tabs: Write (plain textarea) + Preview (react-markdown render).
 *
 * Drop-in replacement for a <textarea name="notes">: keeps the same
 * `name` and `defaultValue` props so it works with the existing
 * server actions without changing them. State is local; the hidden
 * textarea is what the form submits.
 */
export function MarkdownEditor({
  name,
  defaultValue = '',
  rows = 6,
  placeholder
}: {
  name: string;
  defaultValue?: string;
  rows?: number;
  placeholder?: string;
}) {
  const t = useTranslations();
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  const [value, setValue] = useState(defaultValue);

  return (
    <div className="border border-line rounded-md overflow-hidden bg-surface">
      <div className="flex items-center justify-between px-1 pt-1 bg-bg border-b border-line">
        <div className="flex gap-1">
          <TabButton active={tab === 'write'} onClick={() => setTab('write')}>
            {t('markdown.write')}
          </TabButton>
          <TabButton active={tab === 'preview'} onClick={() => setTab('preview')}>
            {t('markdown.preview')}
          </TabButton>
        </div>
        <span className="text-[10px] uppercase tracking-wider text-ink-3 pr-2">
          {t('markdown.help')}
        </span>
      </div>
      {tab === 'write' ? (
        <textarea
          name={name}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={rows}
          placeholder={placeholder}
          className="w-full px-3 py-2 text-[13px] font-mono bg-surface focus:outline-none resize-y"
        />
      ) : (
        <div className="px-3 py-2 text-[13px] prose prose-sm max-w-none min-h-[6rem]">
          {value.trim() ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>
          ) : (
            <span className="text-ink-3 italic">{t('markdown.empty_preview')}</span>
          )}
          {/* Hidden textarea preserves form submission when on preview */}
          <textarea name={name} value={value} readOnly className="hidden" tabIndex={-1} />
        </div>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 text-[12px] rounded-t-md transition-colors duration-75 ${
        active
          ? 'bg-surface text-ink border-b-0'
          : 'text-ink-2 hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}
