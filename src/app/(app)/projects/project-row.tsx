'use client';

import { useRouter } from 'next/navigation';

/**
 * Clickable row for the projects table — navigates to /projects/[id]
 * when any part of the row is clicked or Enter is pressed.
 *
 * The visible REF cell is also a real <a> link (rendered by the
 * parent) so middle-click / cmd-click / right-click → open in new
 * tab continues to work.
 */
export function ProjectRow({
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
        // Ignore clicks that originated on a link or button so they keep their
        // own behaviour (cmd-click open in new tab, etc.).
        const target = e.target as HTMLElement;
        if (target.closest('a, button')) return;
        router.push(href);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') router.push(href);
      }}
      tabIndex={0}
      className="hover:bg-bg cursor-pointer focus:outline-none focus:bg-bg"
    >
      {children}
    </tr>
  );
}
