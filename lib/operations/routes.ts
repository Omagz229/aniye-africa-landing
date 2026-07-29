/**
 * Operations route titles.
 *
 * Extracted from `OperationsShell` so the mapping is testable without a DOM —
 * H3.2-D2 was a missing case here, and a missing case is exactly the kind of
 * thing that should fail a validation run rather than a visual review.
 */

/**
 * The header title for an Operations route.
 *
 * **Longest match first.** The brief route lives *under* a moment, so it must be
 * tested before the `/operations/moments` prefix — otherwise it inherits
 * "Moments", which is what H3.2-D2 was.
 */
export function titleFor(pathname: string): string {
  if (/^\/operations\/programs\/[^/]+\/prepare$/.test(pathname)) return 'Prepare moments';
  if (/^\/operations\/moments\/[^/]+\/brief$/.test(pathname)) return 'Brief';
  if (/^\/operations\/moments\/[^/]+\/item$/.test(pathname)) return 'Choose an item';
  if (/^\/operations\/moments\/[^/]+$/.test(pathname)) return 'Moment';
  if (pathname.startsWith('/operations/moments')) return 'Moments';
  if (pathname.startsWith('/operations/briefs')) return 'Briefs';
  return 'Command';
}
