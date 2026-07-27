import type { Metadata } from 'next';
import PolicyAssignmentsPage from '@/app/components/workspace/PolicyAssignmentsPage';

export const metadata: Metadata = {
  title: 'Policy Assignments — Aniyé Africa',
  robots: { index: false },
};

export default function AssignmentsPage() {
  return <PolicyAssignmentsPage />;
}
