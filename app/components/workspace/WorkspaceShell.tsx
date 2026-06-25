"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { WorkspaceState } from '@/lib/workspace';
import { getWorkspace } from '@/lib/workspace';
import WorkspaceSidebar from './WorkspaceSidebar';
import WorkspaceHeader from './WorkspaceHeader';

interface Props {
  children: React.ReactNode;
}

export default function WorkspaceShell({ children }: Props) {
  const router = useRouter();
  const [workspace, setWorkspace] = useState<WorkspaceState | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const ws = getWorkspace();
    if (!ws) {
      router.replace('/assessment');
      return;
    }
    setWorkspace(ws);
    setHydrated(true);
  }, [router]);

  if (!hydrated) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-gold border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream">
      <WorkspaceSidebar workspace={workspace} />
      <WorkspaceHeader workspace={workspace} />
      <main className="ml-60 pt-14 min-h-screen">
        <div className="max-w-4xl mx-auto px-8 py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
