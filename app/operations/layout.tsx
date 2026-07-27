import OperationsShell from '@/app/components/operations/OperationsShell';

export default function OperationsLayout({ children }: { children: React.ReactNode }) {
  return <OperationsShell>{children}</OperationsShell>;
}
