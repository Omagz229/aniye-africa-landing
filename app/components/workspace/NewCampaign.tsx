"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { WorkspaceState } from '@/lib/workspace';
import { getWorkspace } from '@/lib/workspace';
import CampaignWizard from './CampaignWizard';

/**
 * Route guard for the wizard. Kept separate so `CampaignWizard` receives a
 * loaded workspace and never has to render a half-state.
 */
export default function NewCampaign() {
  const router = useRouter();
  const [workspace, setWorkspace] = useState<WorkspaceState | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);

  useEffect(() => {
    const ws = getWorkspace();
    if (!ws) { router.push('/assessment'); return; }
    if (ws.setupStage === 'profile' || ws.setupStage === 'classes' || ws.setupStage === 'policies') {
      setBlocked('earlier-steps');
      return;
    }
    if (!ws.relationshipClasses.some(c => c.isActive)) { setBlocked('no-groups'); return; }
    if (ws.people.filter(p => p.status === 'Active').length === 0) { setBlocked('no-people'); return; }
    setWorkspace(ws);
  }, [router]);

  if (blocked) {
    const copy = {
      'earlier-steps': {
        heading: 'A few steps to go first',
        body: 'A campaign draws on your groups, rules and people. Finish those and this step will be waiting.',
        href: '/workspace', cta: 'Back to setup',
      },
      'no-groups': {
        heading: 'Turn on a relationship group first',
        body: 'A campaign covers one group of people, and you have none active. Turn one on, then come back.',
        href: '/workspace/classes', cta: 'Go to relationship groups',
      },
      'no-people': {
        heading: 'Add some people first',
        body: 'A campaign needs people to recognise. Add or import them, then come back.',
        href: '/workspace/people', cta: 'Go to People',
      },
    }[blocked]!;

    return (
      <div className="space-y-6 max-w-xl">
        <div>
          <p className="font-body text-xs text-stone uppercase tracking-widest mb-1">Campaigns</p>
          <h2 className="font-display font-bold text-2xl sm:text-3xl text-ink mb-2">{copy.heading}</h2>
          <p className="font-body text-stone">{copy.body}</p>
        </div>
        <Link href={copy.href}
          className="inline-flex items-center gap-2 rounded-full bg-gold text-ink font-semibold text-sm px-6 py-3 hover:brightness-105 hover:shadow-md transition-all">
          {copy.cta} &#8594;
        </Link>
      </div>
    );
  }

  if (!workspace) return null;
  return <CampaignWizard workspace={workspace} />;
}
