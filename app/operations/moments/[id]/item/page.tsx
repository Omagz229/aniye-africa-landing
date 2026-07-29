import type { Metadata } from 'next';
import ItemSelectionPanel from '@/app/components/operations/ItemSelection';

export const metadata: Metadata = {
  title: 'Choose an item — Aniyé Operations',
  robots: { index: false },
};

interface Props { params: Promise<{ id: string }> }

export default async function ItemSelectionRoute({ params }: Props) {
  const { id } = await params;
  return <ItemSelectionPanel momentId={id} />;
}
