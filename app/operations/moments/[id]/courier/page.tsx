import type { Metadata } from 'next';
import CourierSelectionPanel from '@/app/components/operations/CourierSelection';

export const metadata: Metadata = {
  title: 'Arrange carriage — Aniyé Operations',
  robots: { index: false },
};

interface Props { params: Promise<{ id: string }> }

export default async function CourierSelectionRoute({ params }: Props) {
  const { id } = await params;
  return <CourierSelectionPanel momentId={id} />;
}
