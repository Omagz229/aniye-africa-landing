import type { Metadata } from 'next';
import PolicyLibrary from '@/app/components/workspace/PolicyLibrary';

export const metadata: Metadata = {
  title: 'Recognition Policies — Aniyé Africa',
  robots: { index: false },
};

export default function PoliciesPage() {
  return <PolicyLibrary />;
}
