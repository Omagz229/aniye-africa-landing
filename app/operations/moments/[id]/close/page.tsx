import type { Metadata } from 'next';
import ClosurePanel from '@/app/components/operations/ClosurePanel';

export const metadata: Metadata = {
  title: 'Close the moment — Aniyé Operations',
  robots: { index: false },
};

interface Props { params: Promise<{ id: string }> }

export default async function CloseMomentRoute({ params }: Props) {
  const { id } = await params;
  return <ClosurePanel momentId={id} />;
}
