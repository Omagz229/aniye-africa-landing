import type { Metadata } from 'next';
import VerifyGate from '@/app/components/verify/VerifyGate';

export const metadata: Metadata = {
  title: 'Set Up Your Workspace — Aniyé Africa',
  description: 'Create your Aniyé workspace to start building your first relationship program.',
  robots: { index: false },
};

interface Props {
  searchParams: Promise<{ d?: string }>;
}

export default async function VerifyPage({ searchParams }: Props) {
  const params = await searchParams;
  return <VerifyGate encoded={params.d} />;
}
