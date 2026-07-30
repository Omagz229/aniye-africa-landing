import type { Metadata } from 'next';
import VendorDirectory from '@/app/components/operations/VendorDirectory';

export const metadata: Metadata = {
  title: 'Vendors — Aniyé Operations',
  robots: { index: false },
};

export default function VendorsRoute() {
  return <VendorDirectory />;
}
