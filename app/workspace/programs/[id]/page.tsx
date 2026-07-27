import type { Metadata } from 'next';
import ProgramDetail from '@/app/components/workspace/ProgramDetail';

export const metadata: Metadata = {
  title: 'Campaign — Aniyé Africa',
  robots: { index: false },
};

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ProgramDetailRoute({ params }: Props) {
  const { id } = await params;
  return <ProgramDetail programId={id} />;
}
