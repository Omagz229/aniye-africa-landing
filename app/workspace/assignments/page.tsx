import type { Metadata } from 'next';
import PolicyAssignmentsPage from '@/app/components/workspace/PolicyAssignmentsPage';

export const metadata: Metadata = {
  title: 'Who each rule applies to — Aniyé Africa',
  robots: { index: false },
};

export default function AssignmentsPage() {
  return <PolicyAssignmentsPage />;
}
