"use client";

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import type { WorkspaceState } from '@/lib/workspace';
import { isStageComplete } from '@/lib/workspace';

interface Props {
  workspace: WorkspaceState | null;
  /** Drawer state below `lg`. Ignored at desktop widths. */
  open: boolean;
  onNavigate: () => void;
}

// Labels use the language a first-time administrator would use, per the
// Experience Doctrine translation table. The canonical object names —
// Relationship Class, Recognition Policy, Policy Assignment — remain in the
// types, the routes, and the Atlas.
const NAV_ITEMS = [
  { label: 'Overview',                href: '/workspace',             exact: true,  unlockedAfter: null,                built: true },
  { label: 'Your organization',       href: '/workspace/profile',     exact: false, unlockedAfter: null,                built: true },
  { label: 'Relationship groups',     href: '/workspace/classes',     exact: false, unlockedAfter: 'profile' as const,  built: true },
  { label: 'Recognition rules',       href: '/workspace/policies',    exact: false, unlockedAfter: 'classes' as const,  built: true },
  { label: 'Who each rule applies to', href: '/workspace/assignments', exact: false, unlockedAfter: 'classes' as const,  built: true },
  { label: 'People',                  href: '/workspace/people',      exact: false, unlockedAfter: 'policies' as const, built: true },
  { label: 'Campaigns',               href: '/workspace/programs',    exact: false, unlockedAfter: 'assignments' as const, built: true },
];

export default function WorkspaceSidebar({ workspace, open, onNavigate }: Props) {
  const pathname = usePathname();

  function isLocked(item: (typeof NAV_ITEMS)[number]): boolean {
    if (!item.built) return true;
    if (item.unlockedAfter === null) return false;
    if (!workspace) return true;
    return !isStageComplete(item.unlockedAfter, workspace.setupStage);
  }

  function isActive(item: (typeof NAV_ITEMS)[number]) {
    if (isLocked(item)) return false;
    if (item.exact) return pathname === item.href;
    return pathname.startsWith(item.href);
  }

  return (
    <aside
      aria-label="Workspace navigation"
      aria-hidden={!open ? undefined : false}
      className={`fixed inset-y-0 left-0 w-60 max-w-[80vw] bg-white border-r border-stone/15 flex flex-col z-40 transition-transform duration-200 lg:translate-x-0 lg:z-20 ${
        open ? 'translate-x-0 shadow-xl lg:shadow-none' : '-translate-x-full'
      }`}
    >

      {/* Logo + workspace selector */}
      <div className="px-5 pt-6 pb-4 border-b border-stone/10">
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2 min-w-0">
            <Image
              src="/brand-assets/03_Monogram/PNG/aniye-monogram-gold.png"
              alt="Aniyé"
              width={24}
              height={24}
              className="w-6 h-6 flex-shrink-0"
            />
            <span className="font-display font-semibold text-sm text-ink">Aniy&eacute;</span>
          </div>
          <button
            type="button"
            onClick={onNavigate}
            aria-label="Close navigation"
            className="lg:hidden w-8 h-8 -mr-1 flex items-center justify-center rounded-lg text-stone hover:bg-cream hover:text-ink transition-colors text-xl leading-none"
          >
            &times;
          </button>
        </div>
        {/* Workspace selector — future-ready, currently display-only */}
        <div className="flex items-center justify-between rounded-lg px-3 py-2 bg-cream">
          <span className="font-body text-xs font-medium text-ink truncate">
            {workspace?.companyName || 'Workspace'}
          </span>
          <span className="text-stone/50 text-xs ml-2 flex-shrink-0">&#8964;</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const locked = isLocked(item);
          const active = isActive(item);
          if (locked) {
            return (
              <div
                key={item.label}
                className="flex items-center justify-between gap-2 rounded-lg px-3 py-2.5 opacity-40 cursor-not-allowed select-none"
              >
                <span className="font-body text-sm text-stone">{item.label}</span>
                <span className="font-body text-xs text-stone/60 flex-shrink-0">
                  {item.built ? 'Soon' : 'Not yet'}
                </span>
              </div>
            );
          }
          return (
            <Link
              key={item.label}
              href={item.href}
              onClick={onNavigate}
              className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2.5 transition-colors ${
                active ? 'bg-gold/10 text-ink' : 'text-stone hover:bg-cream hover:text-ink'
              }`}
            >
              <span className={`font-body text-sm ${active ? 'font-semibold' : ''}`}>
                {item.label}
              </span>
              {active && <span className="w-1.5 h-1.5 rounded-full bg-gold flex-shrink-0" />}
            </Link>
          );
        })}
      </nav>

      {/* Footer nav */}
      <div className="px-3 pb-5 pt-3 border-t border-stone/10 space-y-0.5">
        <div className="flex items-center rounded-lg px-3 py-2.5 opacity-40 cursor-not-allowed select-none">
          <span className="font-body text-sm text-stone">Settings</span>
        </div>
        <Link
          href="/"
          onClick={onNavigate}
          className="flex items-center rounded-lg px-3 py-2.5 text-stone hover:bg-cream hover:text-ink transition-colors"
        >
          <span className="font-body text-sm">&#8592; Back to site</span>
        </Link>
      </div>

    </aside>
  );
}
