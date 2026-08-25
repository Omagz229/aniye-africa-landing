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
  if (/^\/operations\/moments\/[^/]+\/close$/.test(pathname)) return 'Close the moment';
  if (/^\/operations\/moments\/[^/]+\/brief$/.test(pathname)) return 'Brief';
  if (/^\/operations\/moments\/[^/]+\/item$/.test(pathname)) return 'Choose an item';
  if (/^\/operations\/moments\/[^/]+\/vendor$/.test(pathname)) return 'Vendor offers';
  if (/^\/operations\/moments\/[^/]+\/courier$/.test(pathname)) return 'Arrange carriage';
  if (/^\/operations\/moments\/[^/]+\/fulfilment$/.test(pathname)) return 'Fulfilment';
  if (/^\/operations\/moments\/[^/]+\/order$/.test(pathname)) return 'Recognition Order';
  if (/^\/operations\/moments\/[^/]+\/close$/.test(pathname)) return 'Close the moment';
  if (/^\/operations\/moments\/[^/]+$/.test(pathname)) return 'Moment';
  if (/^\/operations\/timeline\/[^/]+$/.test(pathname)) return 'Relationship timeline';
  if (pathname.startsWith('/operations/moments')) return 'Moments';
  if (pathname.startsWith('/operations/briefs')) return 'Briefs';
  if (pathname.startsWith('/operations/vendors')) return 'Vendors';
  if (pathname.startsWith('/operations/couriers')) return 'Couriers';
  if (pathname.startsWith('/operations/fulfilments')) return 'Fulfilments';
  if (pathname.startsWith('/operations/orders')) return 'Orders';
  if (/^\/operations\/timeline\/[^/]+$/.test(pathname)) return 'Relationship timeline';
  return 'Command';
}
