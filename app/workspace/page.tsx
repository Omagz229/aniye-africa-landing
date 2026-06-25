import type { Metadata } from 'next';
import SetupChecklist from '@/app/components/workspace/SetupChecklist';

export const metadata: Metadata = {
  title: 'Workspace — Aniyé Africa',
  robots: { index: false },
};

export default function WorkspacePage() {
  return <SetupChecklist />;
}
