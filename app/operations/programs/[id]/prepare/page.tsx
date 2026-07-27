import type { Metadata } from 'next';
import PrepareMoments from '@/app/components/operations/PrepareMoments';

export const metadata: Metadata = {
  title: 'Prepare moments — Aniyé Operations',
  robots: { index: false },
};

interface Props { params: Promise<{ id: string }> }

export default async function PrepareRoute({ params }: Props) {
  const { id } = await params;
  return <PrepareMoments programId={id} />;
}
