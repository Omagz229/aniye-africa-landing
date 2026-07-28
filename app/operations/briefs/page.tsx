import type { Metadata } from 'next';
import { Suspense } from 'react';
import BriefsList from '@/app/components/operations/BriefsList';

export const metadata: Metadata = {
  title: 'Briefs — Aniyé Operations',
  robots: { index: false },
};

export default function BriefsRoute() {
  return (
    <Suspense fallback={null}>
      <BriefsList />
    </Suspense>
  );
}
