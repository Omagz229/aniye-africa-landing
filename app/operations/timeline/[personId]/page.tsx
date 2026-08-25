import type { Metadata } from 'next';
import RecipientTimeline from '@/app/components/operations/RecipientTimeline';

export const metadata: Metadata = {
  title: 'Relationship timeline — Aniyé Operations',
  robots: { index: false },
};

interface Props { params: Promise<{ personId: string }> }

export default async function RecipientTimelineRoute({ params }: Props) {
  const { personId } = await params;
  return <RecipientTimeline personId={personId} />;
}
