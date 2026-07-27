import type { Metadata } from 'next';
import PolicyForm from '@/app/components/workspace/PolicyForm';

export const metadata: Metadata = {
  title: 'New recognition rule — Aniyé Africa',
  robots: { index: false },
};

export default function NewPolicyPage() {
  return <PolicyForm />;
}
