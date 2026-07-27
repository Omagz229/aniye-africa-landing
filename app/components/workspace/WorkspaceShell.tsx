"use client";

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { WorkspaceState } from '@/lib/workspace';
import { getWorkspace } from '@/lib/workspace';
import WorkspaceSidebar from './WorkspaceSidebar';
import WorkspaceHeader from './WorkspaceHeader';

interface Props {
  children: React.ReactNode;
}

/**
 * EX-C2 — responsive workspace shell.
 *
 * The shell previously offset content by a hardcoded `ml-60` against a fixed
 * 240px sidebar with no breakpoint anywhere, leaving roughly 135px of usable
 * width on a 375px phone. Every setup route was affected, and the responsive
 * work inside the People components was unreachable behind it.
 *
 * Desktop (`lg` and above) is unchanged: permanent sidebar, offset content.
 * Below `lg` the sidebar becomes an off-canvas drawer opened from the header.
 */
export default function WorkspaceShell({ children }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [workspace, setWorkspace] = useState<WorkspaceState | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    const ws = getWorkspace();
    if (!ws) {
      router.replace('/assessment');
      return;
    }
    setWorkspace(ws);
    setHydrated(true);
  }, [router]);

  const closeNav = useCallback(() => setNavOpen(false), []);

  // Choosing a destination closes the drawer — a nav that stays open over the
  // page it just navigated to is its own dead end.
  useEffect(() => { closeNav(); }, [pathname, closeNav]);

  // Escape dismisses, and the page behind must not scroll while the drawer is
  // open. Both are restored on close.
  useEffect(() => {
    if (!navOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') closeNav();
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [navOpen, closeNav]);

  if (!hydrated) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-gold border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream">

      {/* Scrim — blocks interaction with the page beneath while the nav is open */}
      {navOpen && (
        <div
          onClick={closeNav}
          aria-hidden
          className="lg:hidden fixed inset-0 bg-ink/40 z-30 transition-opacity"
        />
      )}

      <WorkspaceSidebar workspace={workspace} open={navOpen} onNavigate={closeNav} />
      <WorkspaceHeader workspace={workspace} onOpenNav={() => setNavOpen(true)} navOpen={navOpen} />

      <main className="lg:ml-60 pt-14 min-h-screen">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
