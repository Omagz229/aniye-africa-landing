import type { Metadata } from 'next';
import OperationsCommand from '@/app/components/operations/OperationsCommand';

export const metadata: Metadata = {
  title: 'Operations — Aniyé Africa',
  robots: { index: false },
};

export default function OperationsRoute() {
  return <OperationsCommand />;
}
