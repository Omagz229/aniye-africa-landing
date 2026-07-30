import type { Metadata } from 'next';
import FulfilmentPanel from '@/app/components/operations/FulfilmentPanel';

export const metadata: Metadata = {
  title: 'Fulfilment — Aniyé Operations',
  robots: { index: false },
};

interface Props { params: Promise<{ id: string }> }

export default async function FulfilmentRoute({ params }: Props) {
  const { id } = await params;
  return <FulfilmentPanel momentId={id} />;
}
