import type { Metadata } from 'next';
import MomentDetail from '@/app/components/operations/MomentDetail';

export const metadata: Metadata = {
  title: 'Moment — Aniyé Operations',
  robots: { index: false },
};

interface Props { params: Promise<{ id: string }> }

export default async function MomentDetailRoute({ params }: Props) {
  const { id } = await params;
  return <MomentDetail momentId={id} />;
}
