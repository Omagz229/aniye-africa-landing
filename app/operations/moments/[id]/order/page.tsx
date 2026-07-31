import type { Metadata } from 'next';
import RecognitionOrderPanel from '@/app/components/operations/RecognitionOrderPanel';

export const metadata: Metadata = {
  title: 'Recognition Order — Aniyé Operations',
  robots: { index: false },
};

interface Props { params: Promise<{ id: string }> }

export default async function RecognitionOrderRoute({ params }: Props) {
  const { id } = await params;
  return <RecognitionOrderPanel momentId={id} />;
}
