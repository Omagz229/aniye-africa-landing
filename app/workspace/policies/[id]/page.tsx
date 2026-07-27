import type { Metadata } from 'next';
import PolicyDetail from '@/app/components/workspace/PolicyDetail';

export const metadata: Metadata = {
  title: 'Recognition rule — Aniyé Africa',
  robots: { index: false },
};

interface Props {
  params: Promise<{ id: string }>;
}

export default async function PolicyDetailPage({ params }: Props) {
  const { id } = await params;
  return <PolicyDetail policyId={id} />;
}
