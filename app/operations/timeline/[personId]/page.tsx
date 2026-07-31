import type { Metadata } from 'next';
import RelationshipTimeline from '@/app/components/operations/RelationshipTimeline';

export const metadata: Metadata = {
  title: 'Relationship timeline — Aniyé Operations',
  robots: { index: false },
};

interface Props { params: Promise<{ personId: string }> }

export default async function RelationshipTimelineRoute({ params }: Props) {
  const { personId } = await params;
  return <RelationshipTimeline personId={personId} />;
}
