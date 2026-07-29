'use client';

import { useEffect, useState } from 'react';

/**
 * Is the off-canvas drawer currently hidden from the user?
 *
 * Both shells hide their sidebar with a Tailwind breakpoint: below `lg` it is a
 * drawer translated off-screen, at `lg` and above it is permanently visible.
 * Off-screen is **not** the same as unreachable — without `inert` the drawer
 * keeps its tab stops, and a keyboard or screen-reader user lands on navigation
 * they cannot see.
 *
 * The breakpoint has to be read in JavaScript because `inert` is an attribute,
 * not a style, and it must agree with the CSS exactly. `1024px` is Tailwind's
 * `lg` — if that changes in the theme, it changes here too.
 *
 * Returns `false` during SSR and the first paint, which is the safe default:
 * a briefly-interactive drawer is better than one that is briefly inert while
 * visible.
 *
 * Extracted after the same defect was found in both shells — H3.1-D2 in
 * `OperationsShell`, and the identical one in `WorkspaceSidebar`.
 */
export function useOffcanvasHidden(open: boolean): boolean {
  const [isDesktop, setIsDesktop] = useState(true);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const sync = () => setIsDesktop(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  return !isDesktop && !open;
}
