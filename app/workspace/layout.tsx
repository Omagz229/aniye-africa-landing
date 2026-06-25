import WorkspaceShell from '@/app/components/workspace/WorkspaceShell';

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return <WorkspaceShell>{children}</WorkspaceShell>;
}
