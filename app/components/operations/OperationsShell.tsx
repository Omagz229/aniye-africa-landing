"use client";

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { titleFor } from '@/lib/operations/routes';
import { useOffcanvasHidden } from '@/lib/use-offcanvas-hidden';
import { usePathname, useRouter } from 'next/navigation';
import type { WorkspaceState } from '@/lib/workspace';
import { getWorkspace } from '@/lib/workspace';

/**
 * The internal Operations shell — ADR-005.
 *
 * Deliberately **not** `WorkspaceShell`. Different audience, different
 * vocabulary, different visual weight: this is a working surface for one
 * operator, dense and dark-headed, where the customer's workspace is calm and
 * guided. Design tokens are shared; navigation, roles and route tree are not.
 *
 * ⚠️ There is no authentication. Per ADR-010 this is an internal prototype on
 * browser storage, and no external party may be given access to it.
 */

interface Props {
  children: React.ReactNode;
}

const NAV_ITEMS = [
  { label: 'Command', href: '/operations', exact: true, built: true },
  { label: 'Moments', href: '/operations/moments', exact: false, built: true },
  { label: 'Briefs', href: '/operations/briefs', exact: false, built: true },
  { label: 'Vendors', href: '/operations/vendors', exact: false, built: true },
  { label: 'Couriers', href: '/operations/couriers', exact: false, built: true },
  { label: 'Fulfilments', href: '/operations/fulfilments', exact: false, built: true },
];

/**
 * Shown as explicitly unavailable rather than omitted — no clickable dead ends.
 *
 * Fulfilment left this list at H3.6. **Catalog stays**: H3.3 built a flat seed
 * that item selection reads, and no administration surface for it — listing a
 * section that does not exist would be the dead end this list exists to prevent.
 */
const FUTURE_SECTIONS = ['Catalog'];

export default function OperationsShell({ children }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [workspace, setWorkspace] = useState<WorkspaceState | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    const ws = getWorkspace();
    if (!ws) { router.replace('/assessment'); return; }
    setWorkspace(ws);
    setHydrated(true);
  }, [router]);

  const closeNav = useCallback(() => setNavOpen(false), []);
  useEffect(() => { closeNav(); }, [pathname, closeNav]);

  // Hidden from tab order and the a11y tree whenever it is off-canvas.
  const navHidden = useOffcanvasHidden(navOpen);

  useEffect(() => {
    if (!navOpen) return;
    function onKeyDown(e: KeyboardEvent) { if (e.key === 'Escape') closeNav(); }
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [navOpen, closeNav]);

  if (!hydrated) {
    return (
      <div className="min-h-screen bg-ink flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-gold border-t-transparent animate-spin" />
      </div>
    );
  }

  function isActive(item: (typeof NAV_ITEMS)[number]) {
    return item.exact ? pathname === item.href : pathname.startsWith(item.href);
  }

  return (
    <div className="min-h-screen bg-cream">

      {navOpen && (
        <div onClick={closeNav} aria-hidden className="lg:hidden fixed inset-0 bg-ink/60 z-30" />
      )}

      {/* Sidebar — dark, to make the surface unmistakably internal */}
      <aside
        aria-label="Operations navigation"
        // Hidden from the accessibility tree and from tab order whenever it is
        // translated off-screen — never at lg and above, where it is visible.
        aria-hidden={navHidden || undefined}
        inert={navHidden || undefined}
        // `invisible` is doing the accessibility work, not `inert`: it applies
        // from the very first paint, with no JavaScript, so a closed drawer is
        // out of the tab order and the a11y tree before any effect has run.
        // `lg:visible` restores it where it is permanently on screen, and
        // opening it below lg restores it too. The hook below then adds `inert`
        // and `aria-hidden` once the breakpoint is known — belt and braces, not
        // the mechanism.
        className={`fixed inset-y-0 left-0 w-60 max-w-[80vw] bg-ink flex flex-col z-40 transition-transform duration-200 lg:translate-x-0 lg:z-20 lg:visible ${
          navOpen ? 'visible translate-x-0 shadow-xl lg:shadow-none' : 'invisible -translate-x-full'
        }`}
      >
        <div className="px-5 pt-6 pb-4 border-b border-cream/10">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="font-display font-semibold text-sm text-cream">Aniy&eacute; Operations</p>
              <p className="font-body text-xs text-cream/50 truncate">
                {workspace?.companyName || 'Workspace'}
              </p>
            </div>
            <button type="button" onClick={closeNav} aria-label="Close navigation"
              className="lg:hidden w-8 h-8 -mr-1 flex items-center justify-center rounded-lg text-cream/60 hover:text-cream transition-colors text-xl leading-none">
              &times;
            </button>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map(item => (
            <Link key={item.href} href={item.href} onClick={closeNav}
              className={`flex items-center justify-between rounded-lg px-3 py-2.5 transition-colors ${
                isActive(item) ? 'bg-gold/15 text-cream' : 'text-cream/60 hover:bg-cream/5 hover:text-cream'
              }`}>
              <span className={`font-body text-sm ${isActive(item) ? 'font-semibold' : ''}`}>
                {item.label}
              </span>
              {isActive(item) && <span className="w-1.5 h-1.5 rounded-full bg-gold flex-shrink-0" />}
            </Link>
          ))}

          <div className="pt-4 mt-3 border-t border-cream/10">
            <p className="font-body text-xs text-cream/35 uppercase tracking-widest px-3 mb-2">
              Not built yet
            </p>
            {FUTURE_SECTIONS.map(label => (
              <div key={label}
                className="flex items-center justify-between rounded-lg px-3 py-2 opacity-35 cursor-not-allowed select-none">
                <span className="font-body text-sm text-cream/70">{label}</span>
                <span className="font-body text-xs text-cream/50 flex-shrink-0">—</span>
              </div>
            ))}
          </div>
        </nav>

        <div className="px-3 pb-5 pt-3 border-t border-cream/10">
          <div className="px-3 py-2 mb-2 rounded-lg bg-gold/10">
            <p className="font-body text-xs text-gold leading-snug">
              Internal prototype. Browser storage only — not for external access.
            </p>
          </div>
          <Link href="/workspace" onClick={closeNav}
            className="flex items-center rounded-lg px-3 py-2.5 text-cream/60 hover:bg-cream/5 hover:text-cream transition-colors">
            <span className="font-body text-sm">&#8592; Customer workspace</span>
          </Link>
        </div>
      </aside>

      <header className="fixed top-0 left-0 lg:left-60 right-0 h-14 bg-ink border-b border-cream/10 flex items-center gap-2 px-4 sm:px-6 z-30">
        <button type="button" onClick={() => setNavOpen(true)} aria-label="Open navigation" aria-expanded={navOpen}
          className="lg:hidden w-9 h-9 -ml-1.5 flex flex-col items-center justify-center gap-[3px] rounded-lg hover:bg-cream/10 transition-colors flex-shrink-0">
          <span aria-hidden className="block w-4 h-0.5 bg-cream rounded-full" />
          <span aria-hidden className="block w-4 h-0.5 bg-cream rounded-full" />
          <span aria-hidden className="block w-4 h-0.5 bg-cream rounded-full" />
        </button>
        <h1 className="font-display font-semibold text-base text-cream truncate">{titleFor(pathname)}</h1>
        <span className="ml-auto font-body text-xs text-gold/80 hidden sm:block flex-shrink-0">
          Internal
        </span>
      </header>

      <main className="lg:ml-60 pt-14 min-h-screen">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">{children}</div>
      </main>
    </div>
  );
}

