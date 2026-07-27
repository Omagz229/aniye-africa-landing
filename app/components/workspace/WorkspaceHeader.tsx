"use client";

import { usePathname } from 'next/navigation';
import type { WorkspaceState } from '@/lib/workspace';

interface Props {
  workspace: WorkspaceState | null;
  onOpenNav: () => void;
  navOpen: boolean;
}

/**
 * EX-H4 — every workspace route now has a title, in the language a first-time
 * administrator would use. Three routes previously fell through to the generic
 * "Workspace": assignments, new policy, and policy detail.
 *
 * Longest match wins, so `/workspace/policies/new` resolves before
 * `/workspace/policies`.
 */
const PAGE_TITLES: Array<[string, string]> = [
  ['/workspace/policies/new', 'New recognition rule'],
  ['/workspace/policies',     'Recognition rules'],
  ['/workspace/assignments',  'Who each rule applies to'],
  ['/workspace/classes',      'Relationship groups'],
  ['/workspace/people',       'People'],
  ['/workspace/profile',      'Your organization'],
  ['/workspace/programs/new', 'New campaign'],
  ['/workspace/programs',     'Campaigns'],
  ['/workspace',              'Overview'],
];

function titleFor(pathname: string): string {
  // A policy detail route is `/workspace/policies/<id>` — matched by the
  // `/workspace/policies` prefix but deserving its own name.
  if (/^\/workspace\/policies\/[^/]+$/.test(pathname) && !pathname.endsWith('/new')) {
    return 'Recognition rule';
  }
  if (/^\/workspace\/programs\/[^/]+$/.test(pathname) && !pathname.endsWith('/new')) {
    return 'Campaign';
  }
  const match = PAGE_TITLES.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  return match?.[1] ?? 'Workspace';
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase();
}

export default function WorkspaceHeader({ workspace, onOpenNav, navOpen }: Props) {
  const pathname = usePathname();
  const title = titleFor(pathname);
  const initials = workspace?.contactName ? getInitials(workspace.contactName) : '?';

  return (
    <header className="fixed top-0 left-0 lg:left-60 right-0 h-14 bg-white border-b border-stone/15 flex items-center justify-between gap-3 px-4 sm:px-6 z-30">

      <div className="flex items-center gap-2 min-w-0">
        {/* Menu trigger — the only way into navigation below `lg` */}
        <button
          type="button"
          onClick={onOpenNav}
          aria-label="Open navigation"
          aria-expanded={navOpen}
          className="lg:hidden w-9 h-9 -ml-1.5 flex flex-col items-center justify-center gap-[3px] rounded-lg hover:bg-cream transition-colors flex-shrink-0"
        >
          <span aria-hidden className="block w-4 h-0.5 bg-ink rounded-full" />
          <span aria-hidden className="block w-4 h-0.5 bg-ink rounded-full" />
          <span aria-hidden className="block w-4 h-0.5 bg-ink rounded-full" />
        </button>

        <h1 className="font-display font-semibold text-base text-ink truncate">{title}</h1>
      </div>

      <div className="flex items-center gap-3 flex-shrink-0">

        {/* Notification placeholder — inert until it does something */}
        <button
          type="button"
          disabled
          aria-label="Notifications — not available yet"
          className="hidden sm:flex w-8 h-8 items-center justify-center rounded-lg opacity-40 cursor-not-allowed"
        >
          <span aria-hidden className="w-4 h-4 rounded-full border-2 border-stone/30 flex items-center justify-center">
            <span className="w-1.5 h-1.5 rounded-full bg-stone/30" />
          </span>
        </button>

        {/* User */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-gold flex items-center justify-center flex-shrink-0">
            <span className="font-body font-bold text-xs text-ink">{initials}</span>
          </div>
          <div className="hidden md:block leading-tight">
            <p className="font-body text-xs font-semibold text-ink">
              {workspace?.contactName || 'User'}
            </p>
            {workspace?.contactRole && (
              <p className="font-body text-xs text-stone">{workspace.contactRole}</p>
            )}
          </div>
        </div>

      </div>
    </header>
  );
}
