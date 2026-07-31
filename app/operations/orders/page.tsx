import type { Metadata } from 'next';
import OrdersQueue from '@/app/components/operations/OrdersQueue';

export const metadata: Metadata = {
  title: 'Recognition Orders — Aniyé Operations',
  robots: { index: false },
};

export default function OrdersRoute() {
  return <OrdersQueue />;
}
