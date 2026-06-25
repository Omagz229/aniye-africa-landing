"use client";

import { usePathname } from 'next/navigation';
import type { WorkspaceState } from '@/lib/workspace';

interface Props {
  workspace: WorkspaceState | null;
}

const PAGE_TITLES: Record<string, string> = {
  '/workspace': 'Overview',
  '/workspace/profile': 'Organization Profile',
  '/workspace/classes': 'Relationship Classes',
  '/workspace/policies': 'Policies',
  '/workspace/people': 'People',
  '/workspace/programs': 'Programs',
};

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase();
}

export default function WorkspaceHeader({ workspace }: Props) {
  const pathname = usePathname();
  const title = PAGE_TITLES[pathname] ?? 'Workspace';
  const initials = workspace?.contactName ? getInitials(workspace.contactName) : '?';

  return (
    <header className="fixed top-0 left-60 right-0 h-14 bg-white border-b border-stone/15 flex items-center justify-between px-6 z-10">

      <h1 className="font-display font-semibold text-base text-ink">{title}</h1>

      <div className="flex items-center gap-3">

        {/* Notification placeholder */}
        <button
          aria-label="Notifications (coming soon)"
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-cream transition-colors"
        >
          <span className="w-4 h-4 rounded-full border-2 border-stone/30 flex items-center justify-center">
            <span className="w-1.5 h-1.5 rounded-full bg-stone/30" />
          </span>
        </button>

        {/* User */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-gold flex items-center justify-center flex-shrink-0">
            <span className="font-body font-bold text-xs text-ink">{initials}</span>
          </div>
          <div className="hidden sm:block leading-tight">
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
