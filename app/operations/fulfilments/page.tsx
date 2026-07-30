import type { Metadata } from 'next';
import FulfilmentQueue from '@/app/components/operations/FulfilmentQueue';

export const metadata: Metadata = {
  title: 'Fulfilments — Aniyé Operations',
  robots: { index: false },
};

export default function FulfilmentsRoute() {
  return <FulfilmentQueue />;
}
