import type { Metadata } from 'next';
import { Suspense } from 'react';
import MomentsList from '@/app/components/operations/MomentsList';

export const metadata: Metadata = {
  title: 'Moments — Aniyé Operations',
  robots: { index: false },
};

export default function MomentsRoute() {
  return (
    <Suspense fallback={null}>
      <MomentsList />
    </Suspense>
  );
}
