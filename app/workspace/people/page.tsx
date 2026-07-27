import type { Metadata } from 'next';
import PeopleDirectory from '@/app/components/workspace/PeopleDirectory';

export const metadata: Metadata = {
  title: 'People — Aniyé Africa',
  robots: { index: false },
};

export default function PeoplePage() {
  return <PeopleDirectory />;
}
