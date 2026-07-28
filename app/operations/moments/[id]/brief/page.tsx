import type { Metadata } from 'next';
import ExecutionBriefPanel from '@/app/components/operations/ExecutionBrief';

export const metadata: Metadata = {
  title: 'Brief — Aniyé Operations',
  robots: { index: false },
};

interface Props { params: Promise<{ id: string }> }

export default async function ExecutionBriefRoute({ params }: Props) {
  const { id } = await params;
  return <ExecutionBriefPanel momentId={id} />;
}
