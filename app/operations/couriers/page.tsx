import type { Metadata } from 'next';
import CourierDirectory from '@/app/components/operations/CourierDirectory';

export const metadata: Metadata = {
  title: 'Couriers — Aniyé Operations',
  robots: { index: false },
};

export default function CouriersRoute() {
  return <CourierDirectory />;
}
