import type { Metadata } from 'next';
import NewCampaign from '@/app/components/workspace/NewCampaign';

export const metadata: Metadata = {
  title: 'New campaign — Aniyé Africa',
  robots: { index: false },
};

export default function NewProgramRoute() {
  return <NewCampaign />;
}
