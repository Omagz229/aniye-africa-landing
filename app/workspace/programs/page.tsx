import type { Metadata } from 'next';
import ProgramsPage from '@/app/components/workspace/ProgramsPage';

export const metadata: Metadata = {
  title: 'Campaigns — Aniyé Africa',
  robots: { index: false },
};

export default function ProgramsRoute() {
  return <ProgramsPage />;
}
