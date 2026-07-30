import type { Metadata } from 'next';
import VendorSelectionPanel from '@/app/components/operations/VendorSelection';

export const metadata: Metadata = {
  title: 'Compare vendor offers — Aniyé Operations',
  robots: { index: false },
};

interface Props { params: Promise<{ id: string }> }

export default async function VendorSelectionRoute({ params }: Props) {
  const { id } = await params;
  return <VendorSelectionPanel momentId={id} />;
}
