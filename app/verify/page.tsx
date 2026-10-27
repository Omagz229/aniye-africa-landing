import type { Metadata } from 'next';
import VerifyGate from '@/app/components/verify/VerifyGate';

export const metadata: Metadata = {
  title: 'Set Up Your Workspace — Aniyé Africa',
  description: 'Create your Aniyé workspace to start building your first relationship program.',
  robots: { index: false },
};

// PRIV-001: no searchParams. VerifyGate reads the assessment saved on this device.
export default function VerifyPage() {
  return <VerifyGate />;
}
