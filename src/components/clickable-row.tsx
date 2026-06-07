'use client';

import { useRouter } from 'next/navigation';

/**
 * Generic clickable table row — navigates to `href` when any part of
 * the row is clicked or Enter is pressed.
 *
 * Inner <a> and <button> elements keep their own click behaviour
 * (cmd-click open-in-new-tab on a real <a>, etc.) so the parent row
 * click is suppressed when the event originated on them.
 *
 * Note: this duplicates the per-route ProjectRow pattern in
 * /projects/page.tsx. We keep that one in place to avoid churning
 * the project list, but new entity lists (/clients, /vendors) reach
 * for this shared component instead.
 */
export function ClickableRow({
  href,
  children
}: {
  href: string;
  children: React.ReactNode;
}) {
  const router = useRouter();

  return (
    <tr
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest('a, button')) return;
        router.push(href);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') router.push(href);
      }}
      tabIndex={0}
      className="hover:bg-bg cursor-pointer focus:outline-none focus:bg-bg border-t border-line"
    >
      {children}
    </tr>
  );
}
